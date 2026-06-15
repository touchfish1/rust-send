mod room;
mod ws;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use room::RoomState;
use std::net::SocketAddr;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = Arc::new(RoomState::new());

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080")
        .await
        .unwrap();

    tracing::info!("relay-server listening on 0.0.0.0:8080");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<RoomState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.clone(), addr))
}

async fn handle_socket(socket: WebSocket, state: Arc<RoomState>, client_addr: SocketAddr) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let Some(reg) = ws::wait_register(&mut ws_receiver).await else {
        return;
    };

    let session_id = uuid::Uuid::new_v4();
    let (write_tx, mut write_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let read_tx = write_tx.clone();

    // 加入房间
    let devices = state
        .add(
            session_id,
            reg.device_id,
            reg.name.clone(),
            reg.device_type.clone(),
            Some(client_addr.ip().to_string()),
            write_tx,
        )
        .await;

    tracing::info!(
        "device registered: {} ({})  total: {}",
        reg.name,
        reg.device_id,
        devices.len()
    );

    // 发送 device_list 给新连接
    let list_msg = serde_json::json!({"type": "device_list", "devices": devices});
    let _ = ws_sender
        .send(Message::Text(list_msg.to_string()))
        .await;

    // 广播给其他客户端
    state.broadcast_device_list().await;

    // 写任务：mpsc → WebSocket
    let write = tokio::spawn(async move {
        while let Some(msg) = write_rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // 读任务：WebSocket → 解析 → 路由
    let read_state = state.clone();
    let read_dev_id = reg.device_id;
    let read_dev_name = reg.name.clone();
    let read_tx_clone = read_tx.clone();
    let read = tokio::spawn(async move {
        let rx = read_tx_clone;
        while let Some(msg) = ws_receiver.next().await {
            let text = match msg {
                Ok(Message::Text(t)) => t,
                Ok(Message::Close(_)) => break,
                Ok(Message::Ping(_)) => continue,
                Err(_) => break,
                _ => continue,
            };

            let parsed: serde_json::Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let msg_type = parsed["type"].as_str().unwrap_or("");

            match msg_type {
                "ping" => {
                    let _ = rx.send(r#"{"type":"pong"}"#.into());
                }
                "discover" => {
                    let devices = read_state.get_device_list().await;
                    let resp = serde_json::json!({"type": "device_list", "devices": devices});
                    let _ = rx.send(resp.to_string());
                }
                "register" => {
                    // 已处理，忽略
                }
                _ => {
                    // 需要 target_id 的消息路由到目标
                    if let Some(target_id) =
                        serde_json::from_value::<uuid::Uuid>(parsed["target_id"].clone()).ok()
                    {
                        let mut forwarded = parsed.clone();
                        forwarded["source_id"] = serde_json::json!(read_dev_id);
                        forwarded["source_name"] = serde_json::json!(read_dev_name);
                        let msg_str = forwarded.to_string();

                        if read_state.route(&target_id, &msg_str).await.is_err() {
                            let error = serde_json::json!({
                                "type": "error",
                                "code": "device_offline",
                                "message": "目标设备离线"
                            });
                            let _ = rx.send(error.to_string());
                        }
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = write => {},
        _ = read => {},
    }

    state.remove(&reg.device_id, &session_id).await;
    state.broadcast_device_list().await;
    tracing::info!("device disconnected: {}", reg.name);
}
