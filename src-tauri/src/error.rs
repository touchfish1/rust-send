use serde::Serialize;
use std::fmt;

#[derive(Debug)]
pub enum ErrorCode {
    ChecksumMismatch,
    DiskFull,
    FileNotFound,
    PermissionDenied,
    Timeout,
    Cancelled,
    DeviceOffline,
    ProtocolError,
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ChecksumMismatch => write!(f, "checksum_mismatch"),
            Self::DiskFull => write!(f, "disk_full"),
            Self::FileNotFound => write!(f, "file_not_found"),
            Self::PermissionDenied => write!(f, "permission_denied"),
            Self::Timeout => write!(f, "timeout"),
            Self::Cancelled => write!(f, "cancelled"),
            Self::DeviceOffline => write!(f, "device_offline"),
            Self::ProtocolError => write!(f, "protocol_error"),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("WebSocket error: {0}")]
    Ws(#[from] tokio_tungstenite::tungstenite::Error),

    #[error("UUID error: {0}")]
    Uuid(#[from] uuid::Error),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },

    #[error("Device offline: {0}")]
    DeviceOffline(String),

    #[error("Transfer cancelled: {0}")]
    Cancelled(String),

    #[error("Peer error: {_0} - {_1}")]
    PeerError(String, String),

    #[error("Relay disconnected")]
    RelayDisconnected,

    #[error("Transfer not found: {0}")]
    TransferNotFound(uuid::Uuid),

    #[error("Disk full: {0}")]
    DiskFull(String),

    #[error("Max retries exhausted for {0}")]
    RetriesExhausted(String),

    #[error("Reconnection timeout")]
    ReconnectTimeout,

    #[error("Verification timeout")]
    VerifyTimeout,

    #[error("mDNS error: {0}")]
    Mdns(String),

    #[error("{0}")]
    Other(String),
}

impl From<mdns_sd::Error> for AppError {
    fn from(e: mdns_sd::Error) -> Self {
        AppError::Mdns(e.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Other(s)
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
