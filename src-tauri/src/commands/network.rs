use crate::relay::client::{RelayClient, RelayEvent};
use crate::AppState;
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
    let local_id = device_id;
    tauri::async_runtime::spawn(async move {
        process_relay_events_internal(event_rx, data_channels, app, local_id).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn disconnect_relay(state: State<'_, AppState>) -> Result<(), String> {
    let mut relay = state.relay_client.lock().await;
    *relay = None;
    Ok(())
}

/// 公开给 lib.rs 自动连接时使用
pub async fn process_relay_events_internal(
    mut event_rx: tokio::sync::mpsc::Receiver<RelayEvent>,
    data_channels: Arc<tokio::sync::Mutex<std::collections::HashMap<uuid::Uuid, tokio::sync::mpsc::Sender<Bytes>>>>,
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
            RelayEvent::TransferAccepted { .. } => {
                // 发送方收到对方接受传输的确认（可选处理）
            }
            RelayEvent::TransferRejected { .. } => {
                // 发送方收到对方拒绝传输的通知（可选处理）
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
