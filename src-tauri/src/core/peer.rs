use crate::relay::client::RelayClient;
use base64::Engine;
use bytes::Bytes;
use std::sync::Arc;

/// DataChannel 发送 trait（实际由 webrtc-rs 或浏览器 WebRTC 实现）
pub trait DataChannelSender: Send + Sync {
    fn send(&self, data: Bytes) -> Result<(), String>;
}

/// 对端连接抽象，优先走 LAN DataChannel，失败 fallback 到 Relay
pub enum PeerHandle {
    Lan {
        conn: Arc<dyn DataChannelSender>,
        peer_id: uuid::Uuid,
    },
    Relay {
        client: Arc<RelayClient>,
        peer_id: uuid::Uuid,
    },
    Both {
        conn: Arc<dyn DataChannelSender>,
        client: Arc<RelayClient>,
        peer_id: uuid::Uuid,
    },
}

impl PeerHandle {
    pub async fn send(&self, data: Bytes) -> Result<(), String> {
        let data_clone = data.clone();
        match self {
            Self::Lan { conn, .. } | Self::Both { conn, .. } => {
                conn.send(data)?;
            }
            _ => {}
        }
        if let Self::Relay { client, peer_id } | Self::Both { client, peer_id, .. } = self {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&data_clone);
            let payload = serde_json::json!({
                "type": "relay_data",
                "target_id": peer_id,
                "data": b64,
            });
            client.send_raw(payload.to_string())?;
        }
        Ok(())
    }

    pub fn peer_id(&self) -> uuid::Uuid {
        match self {
            Self::Lan { peer_id, .. }
            | Self::Relay { peer_id, .. }
            | Self::Both { peer_id, .. } => *peer_id,
        }
    }
}
