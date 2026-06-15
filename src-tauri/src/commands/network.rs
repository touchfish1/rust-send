use crate::relay::client::{RelayClient, RelayEvent};
use crate::AppState;
use crate::core::peer::PeerHandle;
use bytes::Bytes;
use std::sync::Arc;
use tauri::{Emitter, State};

#[tauri::command]
pub async fn connect_relay(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<(), String> {
    let (device_id, device_name) = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        (config.device_id, config.device_name.clone())
    };

    let (client, event_rx) = RelayClient::connect(&url, device_id, &device_name)
        .await
        .map_err(|e| e.to_string())?;

    let client = Arc::new(client);
    {
        let mut relay = state.relay_client.lock().await;
        *relay = Some(client.clone());
    }

    // 如果连接成功，保存 URL 到配置
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        config.relay_url = Some(url);
        crate::storage::config::save(&config).map_err(|e| e.to_string())?;
    }

    // 启动中继事件处理循环
    let data_channels = state.receiver_data_channels.clone();
    let engine = state.engine.clone();
    let pending_outgoing = state.pending_outgoing.clone();
    let local_id = device_id;
    tauri::async_runtime::spawn(async move {
        process_relay_events_internal(
            event_rx,
            data_channels,
            engine,
            pending_outgoing,
            app,
            local_id,
        )
        .await;
    });

    Ok(())
}

#[tauri::command]
pub async fn disconnect_relay(state: State<'_, AppState>) -> Result<(), String> {
    let mut relay = state.relay_client.lock().await;
    *relay = None;
    Ok(())
}

#[tauri::command]
pub async fn send_chat_message(
    state: State<'_, AppState>,
    target_id: String,
    message_id: String,
    text: String,
) -> Result<(), String> {
    let target = uuid::Uuid::parse_str(&target_id).map_err(|e| e.to_string())?;
    let client = {
        let relay = state.relay_client.lock().await;
        relay.as_ref().ok_or("relay not connected")?.clone()
    };

    client
        .send_chat_message(target, &message_id, &text)
        .map_err(|e| e.to_string())
}

/// 公开给 lib.rs 自动连接时使用
pub async fn process_relay_events_internal(
    mut event_rx: tokio::sync::mpsc::Receiver<RelayEvent>,
    data_channels: Arc<tokio::sync::Mutex<std::collections::HashMap<uuid::Uuid, tokio::sync::mpsc::Sender<Bytes>>>>,
    engine: Arc<tokio::sync::Mutex<crate::transfer::engine::TransferEngine>>,
    pending_outgoing: Arc<tokio::sync::Mutex<std::collections::HashMap<uuid::Uuid, crate::PendingOutgoingTransfer>>>,
    app_handle: tauri::AppHandle,
    local_device_id: uuid::Uuid,
) {
    while let Some(event) = event_rx.recv().await {
        match event {
            RelayEvent::Connected => {
                let _ = app_handle.emit("connection:state", serde_json::json!({"state": "relay"}));
            }
            RelayEvent::Disconnected => {
                let _ = app_handle.emit("connection:state", serde_json::json!({"state": "offline"}));
            }
            RelayEvent::DeviceList(devices) => {
                for device in devices {
                    // 过滤掉自己
                    if device.id == local_device_id {
                        continue;
                    }
                    let _ = app_handle.emit("device:discovered", &device);
                }
            }
            RelayEvent::TransferRequest { source_id, source_name, files } => {
                let incoming = serde_json::json!({
                    "sourceId": source_id,
                    "sourceName": source_name,
                    "files": files.iter().map(|f| serde_json::json!({
                        "id": f.id,
                        "name": f.name,
                        "size": f.size,
                        "mimeType": f.mime_type,
                    })).collect::<Vec<_>>(),
                });
                let _ = app_handle.emit("transfer:incoming", incoming);
            }
            RelayEvent::TransferAccepted { target_id } => {
                if let Some(pending) = pending_outgoing.lock().await.remove(&target_id) {
                    let peer = PeerHandle::Relay {
                        client: pending.client,
                        peer_id: target_id,
                    };
                    engine.lock().await.start_send(
                        peer,
                        pending.target_name,
                        pending.files,
                        pending.paths,
                    );
                }
            }
            RelayEvent::TransferRejected { target_id } => {
                pending_outgoing.lock().await.remove(&target_id);
                let _ = app_handle.emit("transfer:failed", serde_json::json!({
                    "transfer_id": target_id,
                    "file_id": target_id,
                    "error": "transfer rejected",
                }));
            }
            RelayEvent::ChatMessage {
                source_id,
                source_name,
                message_id,
                text,
                sent_at,
            } => {
                let _ = app_handle.emit("chat:message", serde_json::json!({
                    "id": message_id,
                    "peerId": source_id,
                    "peerName": source_name,
                    "text": text,
                    "createdAt": sent_at,
                }));
            }
            RelayEvent::RelayData { file_id, data } => {
                // 路由到接收器
                let channels = data_channels.lock().await;
                if let Some(tx) = channels.get(&file_id) {
                    let _ = tx.send(data).await;
                }
            }
            RelayEvent::Cancel { transfer_id, reason } => {
                let _ = app_handle.emit("transfer:cancelled", serde_json::json!({
                    "transfer_id": transfer_id, "reason": reason,
                }));
            }
            RelayEvent::Pause { transfer_id, reason } => {
                let _ = app_handle.emit("transfer:paused", serde_json::json!({
                    "transfer_id": transfer_id, "reason": reason,
                }));
            }
            RelayEvent::Resume { transfer_id } => {
                let _ = app_handle.emit("transfer:resumed", serde_json::json!({
                    "transfer_id": transfer_id,
                }));
            }
            RelayEvent::Signal { .. } => {}
            RelayEvent::ChunkRequest { .. } => {}
            RelayEvent::Error(msg) => {
                let _ = app_handle.emit("relay:error", serde_json::json!({"message": msg}));
            }
        }
    }
}
