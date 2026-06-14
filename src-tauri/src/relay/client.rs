use crate::core::device::DeviceInfo;
use crate::core::file::FileMeta;
use crate::core::protocol::SignalingMessage;
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Clone)]
pub struct RelayClient {
    device_id: uuid::Uuid,
    write_tx: mpsc::UnboundedSender<String>,
    connected: Arc<AtomicBool>,
    url: String,
    device_name: String,
}

pub enum RelayEvent {
    Connected,
    Disconnected,
    DeviceList(Vec<DeviceInfo>),
    Signal {
        source_id: uuid::Uuid,
        message: SignalingMessage,
    },
    TransferRequest {
        source_id: uuid::Uuid,
        source_name: String,
        files: Vec<FileMeta>,
    },
    TransferAccepted {
        target_id: uuid::Uuid,
    },
    TransferRejected {
        target_id: uuid::Uuid,
    },
    RelayData {
        file_id: uuid::Uuid,
        data: Bytes,
    },
    Cancel {
        transfer_id: uuid::Uuid,
        reason: String,
    },
    Pause {
        transfer_id: uuid::Uuid,
        reason: String,
    },
    Resume {
        transfer_id: uuid::Uuid,
    },
    ChunkRequest {
        transfer_id: uuid::Uuid,
        file_id: uuid::Uuid,
        missing_chunks: Vec<u32>,
    },
    Error(String),
}

impl RelayClient {
    pub async fn connect(
        url: &str,
        device_id: uuid::Uuid,
        device_name: &str,
    ) -> Result<(Self, mpsc::Receiver<RelayEvent>), crate::AppError> {
        let (ws, _) = connect_async(url).await?;
        let url = url.to_string();
        let device_name = device_name.to_string();
        let connected = Arc::new(AtomicBool::new(true));

        let (write_tx, mut write_rx) = mpsc::unbounded_channel::<String>();
        let (event_tx, event_rx) = mpsc::channel(256);

        let register = serde_json::json!({
            "type": "register",
            "device_id": device_id,
            "device_name": device_name,
            "device_type": "desktop",
        });

        let (mut ws_writer, mut ws_reader) = ws.split();

        ws_writer
            .send(Message::Text(register.to_string()))
            .await?;

        // 发送连接成功事件
        let _ = event_tx.send(RelayEvent::Connected).await;

        // 写循环 + 15s 心跳
        let hb_tx = write_tx.clone();
        let conn = connected.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        if hb_tx.send(r#"{"type":"ping"}"#.into()).is_err() {
                            break;
                        }
                    }
                    msg = write_rx.recv() => {
                        match msg {
                            Some(m) => {
                                if ws_writer.send(Message::Text(m.into())).await.is_err() {
                                    break;
                                }
                            }
                            None => break,
                        }
                    }
                }
            }
            conn.store(false, Ordering::SeqCst);
        });

        // 读循环
        let et = event_tx.clone();
        let conn = connected.clone();
        tokio::spawn(async move {
            while let Some(msg) = ws_reader.next().await {
                let text = match msg {
                    Ok(Message::Text(t)) => t,
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => continue,
                };

                let parsed: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                let event = {
                    let msg_type = match parsed["type"].as_str() {
                        Some(t) => t,
                        None => continue,
                    };
                    match msg_type {
                        "pong" => continue,
                        "device_list" => {
                            let Ok(devices) = serde_json::from_value::<Vec<DeviceInfo>>(parsed["devices"].clone()) else { continue };
                            RelayEvent::DeviceList(devices)
                        }
                        "signal" => {
                            let Ok(source_id) = serde_json::from_value::<uuid::Uuid>(parsed["source_id"].clone()) else { continue };
                            let Ok(message) = serde_json::from_value::<SignalingMessage>(parsed["message"].clone()) else { continue };
                            RelayEvent::Signal { source_id, message }
                        }
                        "transfer_request" => {
                            let Ok(source_id) = serde_json::from_value::<uuid::Uuid>(parsed["source_id"].clone()) else { continue };
                            let source_name = parsed["source_name"].as_str().unwrap_or("unknown").to_string();
                            let Ok(files) = serde_json::from_value::<Vec<FileMeta>>(parsed["files"].clone()) else { continue };
                            RelayEvent::TransferRequest { source_id, source_name, files }
                        }
                        "transfer_accept" => {
                            let Ok(target_id) = serde_json::from_value::<uuid::Uuid>(parsed["source_id"].clone()) else { continue };
                            RelayEvent::TransferAccepted { target_id }
                        }
                        "transfer_reject" => {
                            let Ok(target_id) = serde_json::from_value::<uuid::Uuid>(parsed["source_id"].clone()) else { continue };
                            RelayEvent::TransferRejected { target_id }
                        }
                        "relay_data" => {
                            let _source_id = serde_json::from_value::<uuid::Uuid>(parsed["source_id"].clone()).ok();
                            let data_b64 = parsed["data"].as_str().unwrap_or("");
                            let raw = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data_b64) {
                                Ok(d) => d,
                                Err(_) => continue,
                            };
                            let file_id = if raw.len() >= 16 {
                                match uuid::Uuid::from_slice(&raw[..16]) {
                                    Ok(id) => id,
                                    Err(_) => continue,
                                }
                            } else {
                                continue
                            };
                            RelayEvent::RelayData { file_id, data: Bytes::from(raw) }
                        }
                        "cancel" => {
                            let Ok(transfer_id) = serde_json::from_value::<uuid::Uuid>(parsed["transfer_id"].clone()) else { continue };
                            let reason = parsed["reason"].as_str().unwrap_or("unknown").to_string();
                            RelayEvent::Cancel { transfer_id, reason }
                        }
                        "pause" => {
                            let Ok(transfer_id) = serde_json::from_value::<uuid::Uuid>(parsed["transfer_id"].clone()) else { continue };
                            let reason = parsed["reason"].as_str().unwrap_or("user").to_string();
                            RelayEvent::Pause { transfer_id, reason }
                        }
                        "resume" => {
                            let Ok(transfer_id) = serde_json::from_value::<uuid::Uuid>(parsed["transfer_id"].clone()) else { continue };
                            RelayEvent::Resume { transfer_id }
                        }
                        "chunk_request" => {
                            let Ok(transfer_id) = serde_json::from_value::<uuid::Uuid>(parsed["transfer_id"].clone()) else { continue };
                            let Ok(file_id) = serde_json::from_value::<uuid::Uuid>(parsed["file_id"].clone()) else { continue };
                            let Ok(missing_chunks) = serde_json::from_value::<Vec<u32>>(parsed["missing_chunks"].clone()) else { continue };
                            RelayEvent::ChunkRequest { transfer_id, file_id, missing_chunks }
                        }
                        "error" => {
                            let msg = parsed["message"].as_str().unwrap_or("unknown").to_string();
                            RelayEvent::Error(msg)
                        }
                        _ => continue,
                    }
                };

                if et.send(event).await.is_err() {
                    break;
                }
            }
            conn.store(false, Ordering::SeqCst);
        });

        Ok((
            Self {
                device_id,
                write_tx,
                connected,
                url,
                device_name,
            },
            event_rx,
        ))
    }

    pub fn send_signal(
        &self,
        target_id: uuid::Uuid,
        msg: &SignalingMessage,
    ) -> Result<(), String> {
        let payload = serde_json::json!({
            "type": "signal",
            "target_id": target_id,
            "message": msg,
        });
        self.write_tx
            .send(payload.to_string())
            .map_err(|_| "relay disconnected".to_string())
    }

    pub fn send_transfer_request(
        &self,
        target_id: uuid::Uuid,
        files: &[FileMeta],
    ) -> Result<(), String> {
        let payload = serde_json::json!({
            "type": "transfer_request",
            "target_id": target_id,
            "files": files,
        });
        self.write_tx
            .send(payload.to_string())
            .map_err(|_| "relay disconnected".to_string())
    }

    pub fn send_transfer_response(
        &self,
        target_id: uuid::Uuid,
        accepted: bool,
        conflict: Option<&str>,
    ) -> Result<(), String> {
        let mut payload = serde_json::json!({
            "type": if accepted { "transfer_accept" } else { "transfer_response" },
            "target_id": target_id,
            "accepted": accepted,
        });
        if let Some(c) = conflict {
            payload["conflict"] = serde_json::json!(c);
        }
        self.write_tx
            .send(payload.to_string())
            .map_err(|_| "relay disconnected".to_string())
    }

    pub fn send_cancel(&self, target_id: uuid::Uuid, transfer_id: uuid::Uuid) -> Result<(), String> {
        let payload = serde_json::json!({
            "type": "cancel",
            "target_id": target_id,
            "transfer_id": transfer_id,
            "reason": "user_cancelled",
        });
        self.write_tx
            .send(payload.to_string())
            .map_err(|_| "relay disconnected".to_string())
    }

    pub fn send_pause(
        &self,
        target_id: uuid::Uuid,
        transfer_id: uuid::Uuid,
        reason: &str,
    ) -> Result<(), String> {
        let payload = serde_json::json!({
            "type": "pause",
            "target_id": target_id,
            "transfer_id": transfer_id,
            "reason": reason,
        });
        self.write_tx
            .send(payload.to_string())
            .map_err(|_| "relay disconnected".to_string())
    }

    pub fn send_resume(
        &self,
        target_id: uuid::Uuid,
        transfer_id: uuid::Uuid,
    ) -> Result<(), String> {
        let payload = serde_json::json!({
            "type": "resume",
            "target_id": target_id,
            "transfer_id": transfer_id,
        });
        self.write_tx
            .send(payload.to_string())
            .map_err(|_| "relay disconnected".to_string())
    }

    pub fn send_chunk_request(
        &self,
        target_id: uuid::Uuid,
        transfer_id: uuid::Uuid,
        file_id: uuid::Uuid,
        missing_chunks: Vec<u32>,
    ) -> Result<(), String> {
        let payload = serde_json::json!({
            "type": "chunk_request",
            "target_id": target_id,
            "transfer_id": transfer_id,
            "file_id": file_id,
            "missing_chunks": missing_chunks,
        });
        self.write_tx
            .send(payload.to_string())
            .map_err(|_| "relay disconnected".to_string())
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    pub async fn reconnect(&self) -> Result<Self, crate::AppError> {
        Self::connect(&self.url, self.device_id, &self.device_name)
            .await
            .map(|(client, _rx)| client)
    }

    /// 原始消息发送（供 PeerHandle 调用）
    pub fn send_raw(&self, payload: String) -> Result<(), String> {
        self.write_tx
            .send(payload)
            .map_err(|_| "relay disconnected".to_string())
    }
}
