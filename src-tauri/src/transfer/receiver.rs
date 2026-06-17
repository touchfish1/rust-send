use crate::core::file::{FileMeta, ProgressEvent};
use crate::core::peer::PeerHandle;
use crate::core::protocol::PeerMessage;
use crate::error::AppError;
use crate::transfer::engine::ControlSignal;
use bytes::Bytes;
use sha2::{Digest, Sha256};
use std::time::Instant;
use tokio::io::AsyncWriteExt;
use tokio::sync::{broadcast, mpsc};
use tokio::time::Duration;

const VERIFY_TIMEOUT: Duration = Duration::from_secs(30);

pub async fn run_file_receive(
    transfer_id: uuid::Uuid,
    meta: &FileMeta,
    save_path: &std::path::Path,
    peer: PeerHandle,
    _chunk_size: u32,
    mut cancel_rx: broadcast::Receiver<ControlSignal>,
    mut data_rx: mpsc::Receiver<Bytes>,
    progress_tx: mpsc::Sender<ProgressEvent>,
) -> Result<(), AppError> {
    // 创建父目录
    if let Some(parent) = save_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let mut file = tokio::fs::File::create(save_path).await?;
    let mut hasher = Sha256::new();
    let start = Instant::now();
    let mut total_received = 0u64;
    let mut paused = false;

    loop {
        if paused {
            match cancel_rx.recv().await {
                Ok(ControlSignal::Resume) => {
                    paused = false;
                    progress_tx
                        .send(ProgressEvent::Resumed { file_id: meta.id })
                        .await
                        .ok();
                    continue;
                }
                Ok(ControlSignal::Cancel) => {
                    let _ = tokio::fs::remove_file(save_path).await;
                    return Err(AppError::Cancelled("paused then cancelled".into()));
                }
                Ok(ControlSignal::Pause) => continue,
                Err(_) => return Err(AppError::Cancelled("channel closed".into())),
            }
        }

        tokio::select! {
            signal = cancel_rx.recv() => {
                match signal {
                    Ok(ControlSignal::Cancel) => {
                        let _ = tokio::fs::remove_file(save_path).await;
                        return Err(AppError::Cancelled("user cancelled".into()));
                    }
                    Ok(ControlSignal::Pause) => {
                        paused = true;
                        progress_tx.send(ProgressEvent::Paused {
                            reason: "user".into(),
                        }).await.ok();
                        continue;
                    }
                    Ok(ControlSignal::Resume) => continue,
                    Err(_) => return Err(AppError::Cancelled("channel closed".into())),
                }
            }
            data = data_rx.recv() => {
                let raw = match data {
                    Some(d) => d,
                    None => return Err(AppError::Other("data channel closed".into())),
                };

                // 尝试解析为 JSON 消息（控制消息）或二进制分片
                if let Ok(text) = String::from_utf8(raw.to_vec()) {
                    if let Ok(msg) = serde_json::from_str::<PeerMessage>(&text) {
                        match msg {
                            PeerMessage::Complete { file_id, checksum } => {
                                if file_id != meta.id {
                                    continue;
                                }
                                // 校验 SHA256
                                let actual = hex::encode(hasher.finalize());
                                if actual != checksum {
                                    let _ = peer.send(Bytes::from(
                                        serde_json::to_string(&PeerMessage::Error {
                                            file_id,
                                            code: "checksum_mismatch".into(),
                                            message: format!("expected {checksum}, got {actual}"),
                                        }).unwrap()
                                    )).await;
                                    return Err(AppError::ChecksumMismatch { expected: checksum, actual });
                                }

                                let ack = serde_json::to_string(&PeerMessage::CompleteAck {
                                    file_id,
                                })?;
                                peer.send(Bytes::from(ack)).await?;

                                progress_tx
                                    .send(ProgressEvent::Complete {
                                        transfer_id,
                                        file_id,
                                        file_name: meta.name.clone(),
                                        saved_path: Some(save_path.to_string_lossy().to_string()),
                                    })
                                    .await
                                    .ok();

                                file.sync_all().await?;
                                return Ok(());
                            }
                            PeerMessage::Error { file_id: _, code: err_code, message: err_msg } => {
                                return Err(AppError::PeerError(err_code, err_msg));
                            }
                            _ => {}
                        }
                        continue;
                    }
                }

                // 二进制分片处理
                if raw.len() >= 24 {
                    let chunk_index = u32::from_be_bytes([
                        raw[16], raw[17], raw[18], raw[19],
                    ]);
                    let payload_len = u32::from_be_bytes([
                        raw[20], raw[21], raw[22], raw[23],
                    ]) as usize;

                    if raw.len() >= 24 + payload_len {
                        let payload = &raw[24..24 + payload_len];
                        file.write_all(payload).await?;
                        hasher.update(payload);

                        total_received += payload_len as u64;

                        // 发送 ACK
                        let ack = serde_json::to_string(&PeerMessage::Ack {
                            file_id: meta.id,
                            chunk_index,
                        })?;
                        peer.send(Bytes::from(ack)).await?;

                        let elapsed = start.elapsed().as_secs_f64();
                        let speed = if elapsed > 0.0 {
                            total_received as f64 / elapsed
                        } else {
                            0.0
                        };

                        progress_tx
                            .send(ProgressEvent::Progress {
                                transfer_id,
                                file_id: meta.id,
                                file_name: meta.name.clone(),
                                bytes_sent: total_received,
                                bytes_total: meta.size,
                                speed,
                            })
                            .await
                            .ok();
                    }
                }
            }
        }
    }
}
