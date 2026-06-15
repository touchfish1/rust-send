use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMeta {
    pub id: uuid::Uuid,
    pub name: String,
    pub size: u64,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileProgress {
    pub file_id: uuid::Uuid,
    pub file_name: String,
    pub size: u64,
    pub bytes_sent: u64,
    pub speed: f64,
    pub status: TransferStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferState {
    pub id: uuid::Uuid,
    pub direction: Direction,
    pub peer_id: uuid::Uuid,
    pub peer_name: String,
    pub files: Vec<FileProgress>,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub status: TransferStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferRecord {
    pub id: uuid::Uuid,
    pub direction: Direction,
    pub peer_name: String,
    pub file_names: Vec<String>,
    pub total_size: u64,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: chrono::DateTime<chrono::Utc>,
    pub status: TransferStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Direction {
    Send,
    Receive,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TransferStatus {
    Queued,
    Transferring,
    Paused,
    Verifying,
    Completed,
    Failed,
    Cancelled,
    Expired,
}

#[derive(Debug, Clone)]
pub enum ProgressEvent {
    Progress {
        transfer_id: uuid::Uuid,
        file_id: uuid::Uuid,
        file_name: String,
        bytes_sent: u64,
        bytes_total: u64,
        speed: f64,
    },
    Complete {
        transfer_id: uuid::Uuid,
        file_id: uuid::Uuid,
        file_name: String,
        saved_path: Option<String>,
    },
    BatchComplete {
        transfer_id: uuid::Uuid,
    },
    Failed {
        transfer_id: uuid::Uuid,
        file_id: uuid::Uuid,
        error: String,
    },
    Paused {
        reason: String,
    },
    Resumed {
        file_id: uuid::Uuid,
    },
    Cancelled {
        transfer_id: uuid::Uuid,
        reason: String,
    },
    Queued {
        transfer_id: uuid::Uuid,
        position: usize,
    },
}
