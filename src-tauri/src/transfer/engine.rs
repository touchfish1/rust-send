use crate::core::file::{
    Direction, FileMeta, FileProgress, ProgressEvent, TransferRecord, TransferState, TransferStatus,
};
use crate::core::peer::PeerHandle;
use crate::error::AppError;
use bytes::Bytes;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};

pub struct TransferConfig {
    pub chunk_size: u32,
    pub max_retries: u32,
    pub ack_timeout: std::time::Duration,
    pub max_concurrent: usize,
    pub verify_timeout: std::time::Duration,
}

impl Default for TransferConfig {
    fn default() -> Self {
        Self {
            chunk_size: 65536,
            max_retries: 3,
            ack_timeout: std::time::Duration::from_secs(10),
            max_concurrent: 3,
            verify_timeout: std::time::Duration::from_secs(30),
        }
    }
}

#[derive(Clone)]
pub enum ControlSignal {
    Cancel,
    Pause,
    Resume,
}

struct TransferTask {
    state: TransferState,
    cancel_tx: broadcast::Sender<ControlSignal>,
    file_paths: Vec<String>,
    save_dir: Option<std::path::PathBuf>,
}

pub struct QueuedTransfer {
    pub id: uuid::Uuid,
    pub peer: PeerHandle,
    pub peer_name: String,
    pub files: Vec<FileMeta>,
    pub file_paths: Vec<String>,
    pub direction: Direction,
    pub save_dir: Option<std::path::PathBuf>,
}

pub struct TransferEngine {
    config: TransferConfig,
    active: HashMap<uuid::Uuid, TransferTask>,
    queue: VecDeque<QueuedTransfer>,
    progress_tx: mpsc::Sender<ProgressEvent>,
    /// file_id → data sender channel (for routing incoming relay data to receivers)
    data_channels: Arc<Mutex<HashMap<uuid::Uuid, mpsc::Sender<Bytes>>>>,
}

impl TransferEngine {
    pub fn new(config: TransferConfig) -> (Self, mpsc::Receiver<ProgressEvent>) {
        let (progress_tx, progress_rx) = mpsc::channel(1024);
        (
            Self {
                config,
                active: HashMap::new(),
                queue: VecDeque::new(),
                progress_tx,
                data_channels: Arc::new(Mutex::new(HashMap::new())),
            },
            progress_rx,
        )
    }

    pub fn set_data_channels(
        &mut self,
        channels: Arc<Mutex<HashMap<uuid::Uuid, mpsc::Sender<Bytes>>>>,
    ) {
        self.data_channels = channels;
    }

    pub fn start_send(
        &mut self,
        peer: PeerHandle,
        peer_name: String,
        files: Vec<FileMeta>,
        file_paths: Vec<String>,
    ) -> uuid::Uuid {
        let id = uuid::Uuid::new_v4();
        let file_progress: Vec<FileProgress> = files
            .iter()
            .map(|f| FileProgress {
                file_id: f.id,
                file_name: f.name.clone(),
                size: f.size,
                bytes_sent: 0,
                speed: 0.0,
                status: TransferStatus::Queued,
            })
            .collect();

        if self.active.len() >= self.config.max_concurrent {
            self.queue.push_back(QueuedTransfer {
                id,
                peer,
                peer_name,
                files,
                file_paths,
                direction: Direction::Send,
                save_dir: None,
            });
            let pos = self.queue.len();
            let _ = self.progress_tx.try_send(ProgressEvent::Queued {
                transfer_id: id,
                position: pos,
            });
            return id;
        }

        let (cancel_tx, _) = broadcast::channel(64);

        let mut cancel_rxs = Vec::new();
        for _ in files.iter() {
            cancel_rxs.push(cancel_tx.subscribe());
        }

        let task = TransferTask {
            state: TransferState {
                id,
                direction: Direction::Send,
                peer_id: peer.peer_id(),
                peer_name,
                transport: peer.transport(),
                files: file_progress,
                started_at: chrono::Utc::now(),
                status: TransferStatus::Transferring,
            },
            cancel_tx,
            file_paths: file_paths.clone(),
            save_dir: None,
        };

        let progress_tx = self.progress_tx.clone();

        let file_metas: Vec<FileMeta> = files.into_iter().collect();
        for (i, meta) in file_metas.iter().enumerate() {
            let file_path = file_paths[i].clone();
            let file_id = meta.id;
            let meta_name = meta.name.clone();
            let meta_size = meta.size;
            let meta_mime = meta.mime_type.clone();
            let peer = match &peer {
                PeerHandle::Lan { conn, peer_id } => PeerHandle::Lan {
                    conn: conn.clone(),
                    peer_id: *peer_id,
                },
                PeerHandle::Relay { client, peer_id } => PeerHandle::Relay {
                    client: client.clone(),
                    peer_id: *peer_id,
                },
                PeerHandle::Both {
                    conn,
                    client,
                    peer_id,
                } => PeerHandle::Both {
                    conn: conn.clone(),
                    client: client.clone(),
                    peer_id: *peer_id,
                },
            };
            let pt = progress_tx.clone();
            let cr = cancel_rxs.remove(0);
            let cfg = self.config.clone();

            tokio::spawn(async move {
                let file_meta = FileMeta {
                    id: file_id,
                    name: meta_name,
                    size: meta_size,
                    mime_type: meta_mime,
                };
                let result = crate::transfer::sender::run_file_send(
                    id, file_id, &file_meta, &file_path, peer, cfg, cr, pt,
                )
                .await;
                if let Err(e) = result {
                    log::error!("file send failed: {}", e);
                }
            });
        }

        self.active.insert(id, task);
        id
    }

    pub fn start_receive(
        &mut self,
        peer: PeerHandle,
        peer_name: String,
        files: Vec<FileMeta>,
        save_dir: std::path::PathBuf,
    ) -> uuid::Uuid {
        let id = uuid::Uuid::new_v4();
        let file_progress: Vec<FileProgress> = files
            .iter()
            .map(|f| FileProgress {
                file_id: f.id,
                file_name: f.name.clone(),
                size: f.size,
                bytes_sent: 0,
                speed: 0.0,
                status: TransferStatus::Queued,
            })
            .collect();

        if self.active.len() >= self.config.max_concurrent {
            self.queue.push_back(QueuedTransfer {
                id,
                peer,
                peer_name,
                files,
                file_paths: vec![],
                direction: Direction::Receive,
                save_dir: Some(save_dir),
            });
            return id;
        }

        let (cancel_tx, _) = broadcast::channel(64);
        let progress_tx = self.progress_tx.clone();
        let data_channels = self.data_channels.clone();
        let mut cancel_rxs = Vec::new();
        for _ in files.iter() {
            cancel_rxs.push(cancel_tx.subscribe());
        }

        let chunk_size = self.config.chunk_size;
        for meta in files.iter() {
            let file_id = meta.id;
            let save_path = save_dir.join(&meta.name);
            let peer = match &peer {
                PeerHandle::Lan { conn, peer_id } => PeerHandle::Lan {
                    conn: conn.clone(),
                    peer_id: *peer_id,
                },
                PeerHandle::Relay { client, peer_id } => PeerHandle::Relay {
                    client: client.clone(),
                    peer_id: *peer_id,
                },
                PeerHandle::Both {
                    conn,
                    client,
                    peer_id,
                } => PeerHandle::Both {
                    conn: conn.clone(),
                    client: client.clone(),
                    peer_id: *peer_id,
                },
            };
            let (data_tx, data_rx) = mpsc::channel(64);
            let pt = progress_tx.clone();
            let cr = cancel_rxs.remove(0);
            let dc = data_channels.clone();
            let file_meta = meta.clone();

            // 注册 data channel
            let dc_clone = dc.clone();
            tokio::spawn(async move {
                let mut channels = dc_clone.lock().await;
                channels.insert(file_id, data_tx);
            });

            tokio::spawn(async move {
                let result = crate::transfer::receiver::run_file_receive(
                    id, &file_meta, &save_path, peer, chunk_size, cr, data_rx, pt,
                )
                .await;
                // 完成后取消注册
                let mut channels = dc.lock().await;
                channels.remove(&file_id);
                if let Err(e) = result {
                    log::error!("file receive failed: {}", e);
                }
            });
        }

        let task = TransferTask {
            state: TransferState {
                id,
                direction: Direction::Receive,
                peer_id: peer.peer_id(),
                peer_name,
                transport: peer.transport(),
                files: file_progress,
                started_at: chrono::Utc::now(),
                status: TransferStatus::Transferring,
            },
            cancel_tx,
            file_paths: vec![],
            save_dir: Some(save_dir),
        };

        self.active.insert(id, task);
        id
    }

    pub fn cancel(&mut self, transfer_id: &uuid::Uuid) -> Result<(), AppError> {
        if let Some(task) = self.active.remove(transfer_id) {
            let _ = task.cancel_tx.send(ControlSignal::Cancel);
            let _ = self.progress_tx.try_send(ProgressEvent::Cancelled {
                transfer_id: *transfer_id,
                reason: "user_cancelled".into(),
            });
            // 清理该传输中所有文件的 data channels
            let dc = self.data_channels.clone();
            let file_ids: Vec<uuid::Uuid> = task.state.files.iter().map(|f| f.file_id).collect();
            tokio::spawn(async move {
                let mut channels = dc.lock().await;
                for fid in &file_ids {
                    channels.remove(fid);
                }
            });
        }
        self.queue.retain(|q| q.id != *transfer_id);
        self.try_dequeue();
        Ok(())
    }

    pub fn pause(&mut self, transfer_id: &uuid::Uuid) -> Result<(), AppError> {
        if let Some(task) = self.active.get(transfer_id) {
            let _ = task.cancel_tx.send(ControlSignal::Pause);
        }
        if let Some(task) = self.active.get_mut(transfer_id) {
            task.state.status = TransferStatus::Paused;
        }
        Ok(())
    }

    pub fn resume(&mut self, transfer_id: &uuid::Uuid) -> Result<(), AppError> {
        if let Some(task) = self.active.get(transfer_id) {
            let _ = task.cancel_tx.send(ControlSignal::Resume);
        }
        if let Some(task) = self.active.get_mut(transfer_id) {
            task.state.status = TransferStatus::Transferring;
        }
        Ok(())
    }

    pub fn active_transfers(&self) -> Vec<TransferState> {
        let mut transfers: Vec<TransferState> =
            self.active.values().map(|t| t.state.clone()).collect();
        transfers.extend(self.queue.iter().map(|q| {
            TransferState {
                id: q.id,
                direction: q.direction.clone(),
                peer_id: q.peer.peer_id(),
                peer_name: q.peer_name.clone(),
                transport: q.peer.transport(),
                files: q
                    .files
                    .iter()
                    .map(|f| FileProgress {
                        file_id: f.id,
                        file_name: f.name.clone(),
                        size: f.size,
                        bytes_sent: 0,
                        speed: 0.0,
                        status: TransferStatus::Queued,
                    })
                    .collect(),
                started_at: chrono::Utc::now(),
                status: TransferStatus::Queued,
            }
        }));
        transfers
    }

    /// Route incoming relay data to the correct receiver
    pub async fn route_incoming_data(&self, file_id: &uuid::Uuid, data: Bytes) -> Result<(), ()> {
        let channels = self.data_channels.lock().await;
        if let Some(tx) = channels.get(file_id) {
            tx.send(data).await.map_err(|_| ())
        } else {
            Err(())
        }
    }

    pub fn mark_file_completed(
        &mut self,
        transfer_id: &uuid::Uuid,
        file_id: &uuid::Uuid,
    ) -> Option<TransferRecord> {
        let task = self.active.get_mut(transfer_id)?;
        for file in &mut task.state.files {
            if file.file_id == *file_id {
                file.bytes_sent = file.size;
                file.speed = 0.0;
                file.status = TransferStatus::Completed;
            }
        }
        if task
            .state
            .files
            .iter()
            .all(|file| file.status == TransferStatus::Completed)
        {
            let record = build_record(&task.state, TransferStatus::Completed, None);
            self.active.remove(transfer_id);
            self.try_dequeue();
            return Some(record);
        }
        None
    }

    pub fn mark_file_failed(
        &mut self,
        transfer_id: &uuid::Uuid,
        file_id: &uuid::Uuid,
        error: String,
    ) -> Option<TransferRecord> {
        let task = self.active.get_mut(transfer_id)?;
        for file in &mut task.state.files {
            if file.file_id == *file_id {
                file.status = TransferStatus::Failed;
                file.speed = 0.0;
            }
        }
        task.state.status = TransferStatus::Failed;
        let record = build_record(&task.state, TransferStatus::Failed, Some(error));
        self.active.remove(transfer_id);
        self.try_dequeue();
        Some(record)
    }

    pub fn mark_transfer_cancelled(
        &mut self,
        transfer_id: &uuid::Uuid,
        reason: String,
    ) -> Option<TransferRecord> {
        let task = self.active.remove(transfer_id)?;
        let mut state = task.state;
        state.status = TransferStatus::Cancelled;
        for file in &mut state.files {
            if file.status != TransferStatus::Completed {
                file.status = TransferStatus::Cancelled;
                file.speed = 0.0;
            }
        }
        let record = build_record(&state, TransferStatus::Cancelled, Some(reason));
        self.try_dequeue();
        Some(record)
    }

    fn try_dequeue(&mut self) {
        while self.active.len() < self.config.max_concurrent {
            let Some(q) = self.queue.pop_front() else {
                break;
            };

            let (cancel_tx, _) = broadcast::channel(64);
            let progress_tx = self.progress_tx.clone();
            let data_channels = self.data_channels.clone();
            let mut cancel_rxs = Vec::new();
            for _ in q.files.iter() {
                cancel_rxs.push(cancel_tx.subscribe());
            }

            match q.direction {
                Direction::Send => {
                    for (i, meta) in q.files.iter().enumerate() {
                        let file_path = q.file_paths[i].clone();
                        let peer = q.peer.clone();
                        let pt = progress_tx.clone();
                        let cr = cancel_rxs.remove(0);
                        let file_id = meta.id;
                        let meta_clone = meta.clone();
                        let cfg = self.config.clone();
                        tokio::spawn(async move {
                            let _ = crate::transfer::sender::run_file_send(
                                q.id,
                                file_id,
                                &meta_clone,
                                &file_path,
                                peer,
                                cfg,
                                cr,
                                pt,
                            )
                            .await;
                        });
                    }
                }
                Direction::Receive => {
                    let chunk_size = self.config.chunk_size;
                    for meta in q.files.iter() {
                        let save_path = q
                            .save_dir
                            .as_ref()
                            .map(|d| d.join(&meta.name))
                            .unwrap_or_else(|| std::path::PathBuf::from(&meta.name));
                        let peer = q.peer.clone();
                        let pt = progress_tx.clone();
                        let cr = cancel_rxs.remove(0);
                        let file_meta = meta.clone();
                        let (data_tx, data_rx) = mpsc::channel(64);
                        let dc = data_channels.clone();

                        // 注册 data channel
                        let dc_clone = dc.clone();
                        let file_id = meta.id;
                        tokio::spawn(async move {
                            let mut channels = dc_clone.lock().await;
                            channels.insert(file_id, data_tx);
                        });

                        tokio::spawn(async move {
                            let result = crate::transfer::receiver::run_file_receive(
                                q.id, &file_meta, &save_path, peer, chunk_size, cr, data_rx, pt,
                            )
                            .await;
                            let mut channels = dc.lock().await;
                            channels.remove(&file_id);
                            if let Err(e) = result {
                                log::error!("file receive failed: {}", e);
                            }
                        });
                    }
                }
            }

            let file_progress: Vec<FileProgress> = q
                .files
                .iter()
                .map(|f| FileProgress {
                    file_id: f.id,
                    file_name: f.name.clone(),
                    size: f.size,
                    bytes_sent: 0,
                    speed: 0.0,
                    status: TransferStatus::Transferring,
                })
                .collect();

            self.active.insert(
                q.id,
                TransferTask {
                    state: TransferState {
                        id: q.id,
                        direction: q.direction,
                        peer_id: q.peer.peer_id(),
                        peer_name: q.peer_name,
                        transport: q.peer.transport(),
                        files: file_progress,
                        started_at: chrono::Utc::now(),
                        status: TransferStatus::Transferring,
                    },
                    cancel_tx,
                    file_paths: q.file_paths,
                    save_dir: q.save_dir,
                },
            );
        }
    }
}

fn build_record(
    state: &TransferState,
    status: TransferStatus,
    failure_reason: Option<String>,
) -> TransferRecord {
    TransferRecord {
        id: state.id,
        direction: state.direction.clone(),
        peer_id: state.peer_id,
        peer_name: state.peer_name.clone(),
        transport: state.transport.clone(),
        file_names: state
            .files
            .iter()
            .map(|file| file.file_name.clone())
            .collect(),
        total_size: state.files.iter().map(|file| file.size).sum(),
        started_at: state.started_at,
        completed_at: chrono::Utc::now(),
        status,
        failure_reason,
    }
}

impl Clone for TransferConfig {
    fn clone(&self) -> Self {
        Self {
            chunk_size: self.chunk_size,
            max_retries: self.max_retries,
            ack_timeout: self.ack_timeout,
            max_concurrent: self.max_concurrent,
            verify_timeout: self.verify_timeout,
        }
    }
}

impl Clone for PeerHandle {
    fn clone(&self) -> Self {
        match self {
            Self::Lan { conn, peer_id } => Self::Lan {
                conn: conn.clone(),
                peer_id: *peer_id,
            },
            Self::Relay { client, peer_id } => Self::Relay {
                client: client.clone(),
                peer_id: *peer_id,
            },
            Self::Both {
                conn,
                client,
                peer_id,
            } => Self::Both {
                conn: conn.clone(),
                client: client.clone(),
                peer_id: *peer_id,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::file::FileMeta;

    #[test]
    fn test_engine_create() {
        let (engine, _rx) = TransferEngine::new(TransferConfig::default());
        assert_eq!(engine.active.len(), 0);
        assert_eq!(engine.queue.len(), 0);
    }

    #[test]
    fn test_config_defaults() {
        let config = TransferConfig::default();
        assert_eq!(config.chunk_size, 65536);
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.max_concurrent, 3);
        assert_eq!(config.ack_timeout, std::time::Duration::from_secs(10));
        assert_eq!(config.verify_timeout, std::time::Duration::from_secs(30));
    }
}
