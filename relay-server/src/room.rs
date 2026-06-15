use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::{mpsc, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: uuid::Uuid,
    pub name: String,
    pub device_type: String,
    pub ip_address: Option<String>,
    pub connected_at: String,
    pub last_seen: String,
}

#[derive(Debug, Clone)]
pub struct WsSession {
    pub session_id: uuid::Uuid,
    pub device_id: uuid::Uuid,
    pub device_name: String,
    pub device_type: String,
    pub ip_address: Option<String>,
    pub connected_at: String,
    pub sender: mpsc::UnboundedSender<String>,
}

pub struct RoomState {
    sessions: RwLock<HashMap<uuid::Uuid, WsSession>>,
}

impl RoomState {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    pub async fn add(
        &self,
        session_id: uuid::Uuid,
        device_id: uuid::Uuid,
        device_name: String,
        device_type: String,
        ip_address: Option<String>,
        sender: mpsc::UnboundedSender<String>,
    ) -> Vec<DeviceInfo> {
        let mut sessions = self.sessions.write().await;
        let connected_at = chrono::Utc::now().to_rfc3339();

        // 相同 device_id 的旧会话踢掉
        if let Some(old) = sessions.get(&device_id) {
            let _ = old.sender.send(r#"{"type":"error","code":"duplicate","message":"新连接取代了旧连接"}"#.into());
        }

        sessions.insert(
            device_id,
            WsSession {
                session_id,
                device_id,
                device_name,
                device_type,
                ip_address,
                connected_at,
                sender,
            },
        );

        self.build_device_list(&sessions)
    }

    pub async fn remove(&self, device_id: &uuid::Uuid, session_id: &uuid::Uuid) {
        let mut sessions = self.sessions.write().await;
        if sessions
            .get(device_id)
            .is_some_and(|session| &session.session_id == session_id)
        {
            sessions.remove(device_id);
        }
    }

    pub async fn route(&self, target_id: &uuid::Uuid, message: &str) -> Result<(), ()> {
        let sessions = self.sessions.read().await;
        match sessions.get(target_id) {
            Some(session) => session.sender.send(message.to_string()).map_err(|_| ()),
            None => Err(()),
        }
    }

    pub async fn get_device_list(&self) -> Vec<DeviceInfo> {
        let sessions = self.sessions.read().await;
        self.build_device_list(&sessions)
    }

    pub async fn broadcast_device_list(&self) {
        let devices = self.get_device_list().await;
        let msg = serde_json::json!({"type": "device_list", "devices": devices});
        let msg_str = msg.to_string();

        let sessions = self.sessions.read().await;
        for session in sessions.values() {
            let _ = session.sender.send(msg_str.clone());
        }
    }

    fn build_device_list(
        &self,
        sessions: &std::collections::HashMap<uuid::Uuid, WsSession>,
    ) -> Vec<DeviceInfo> {
        sessions
            .values()
            .map(|s| DeviceInfo {
                id: s.device_id,
                name: s.device_name.clone(),
                device_type: s.device_type.clone(),
                ip_address: s.ip_address.clone(),
                connected_at: s.connected_at.clone(),
                last_seen: chrono::Utc::now().to_rfc3339(),
            })
            .collect()
    }
}
