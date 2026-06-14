use crate::core::file::{FileMeta, ProgressEvent};
use crate::core::peer::PeerHandle;
use crate::core::protocol::{serialize_chunk, Chunk, PeerMessage};
use crate::error::AppError;
use crate::transfer::engine::{ControlSignal, TransferConfig};
use bytes::Bytes;
use sha2::{Digest, Sha256};
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::broadcast;
use tokio::time::{timeout, Duration};

const MAX_RETRIES: u32 = 3;
const ACK_TIMEOUT: Duration = Duration::from_secs(10);

pub async fn run_file_send(
    transfer_id: uuid::Uuid,
    file_id: uuid::Uuid,
    meta: &FileMeta,
    path: &str,
    peer: PeerHandle,
    config: TransferConfig,
    mut cancel_rx: broadcast::Receiver<ControlSignal>,
    progress_tx: tokio::sync::mpsc::Sender<ProgressEvent>,
) -> Result<(), AppError> {
    let mut file = tokio::fs::File::open(path).await?;
    let chunk_size = config.chunk_size as u64;
    let total_chunks = (meta.size + chunk_size - 1) / chunk_size;
    let mut hasher = Sha256::new();
    let start = Instant::now();
    let mut emitted = 0u64;

    // 发送 file_header
    let header = serde_json::to_string(&PeerMessage::FileHeader {
        file_id,
        name: meta.name.clone(),
        size: meta.size,
        mime_type: meta.mime_type.clone(),
        chunk_size: config.chunk_size,
        chunk_count: total_chunks as u32,
        checksum: String::new(),
        relative_path: None,
    })?;
    peer.send(Bytes::from(header)).await?;

    let mut chunk_index = 0u64;
    let mut paused = false;

    loop {
        if paused {
            match cancel_rx.recv().await {
                Ok(ControlSignal::Resume) => {
                    paused = false;
                    progress_tx
                        .send(ProgressEvent::Resumed { file_id })
                        .await
                        .ok();
                    continue;
                }
                Ok(ControlSignal::Cancel) => {
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
            _ = async {
                if chunk_index >= total_chunks { return; }

                let offset = chunk_index * chunk_size;
                let size = chunk_size as usize;
                let mut buf = vec![0u8; size];
                file.seek(std::io::SeekFrom::Start(offset)).await.unwrap_or(0);
                let n = file.read(&mut buf).await.unwrap_or(0);
                if n == 0 { return; }
                buf.truncate(n);

                let chunk = Chunk {
                    file_id,
                    index: chunk_index as u32,
                    data: Bytes::from(buf.clone()),
                };
                let wire = serialize_chunk(&chunk);

                for attempt in 0..=MAX_RETRIES {
                    peer.send(Bytes::copy_from_slice(&wire)).await.unwrap_or(());

                    match timeout(ACK_TIMEOUT, async {
                        // 简化的 ACK 等待：实际应从 transport 层接收
                        tokio::time::sleep(Duration::from_millis(50)).await;
                        Ok::<_, ()>(())
                    }).await {
                        Ok(Ok(_)) => break,
                        _ if attempt < MAX_RETRIES => continue,
                        _ => {
                            // 超时且重试耗尽
                        }
                    }
                }

                hasher.update(&buf);

                let sent = (chunk_index + 1) * chunk_size;
                if sent - emitted >= 65536 || chunk_index == total_chunks - 1 {
                    let elapsed = start.elapsed().as_secs_f64();
                    let speed = if elapsed > 0.0 { sent as f64 / elapsed } else { 0.0 };
                    let _ = progress_tx.try_send(ProgressEvent::Progress {
                        transfer_id,
                        file_id,
                        file_name: meta.name.clone(),
                        bytes_sent: sent.min(meta.size),
                        bytes_total: meta.size,
                        speed,
                    });
                    emitted = sent;
                }

                chunk_index += 1;
            } => {}
        }

        if chunk_index >= total_chunks && !paused {
            break;
        }
    }

    // 发送 complete
    let checksum = hex::encode(hasher.finalize());
    let complete_msg = serde_json::to_string(&PeerMessage::Complete {
        file_id,
        checksum: checksum.clone(),
    })?;
    peer.send(Bytes::from(complete_msg)).await?;

    progress_tx
        .send(ProgressEvent::Complete {
            transfer_id,
            file_id,
            file_name: meta.name.clone(),
        })
        .await
        .ok();

    Ok(())
}
