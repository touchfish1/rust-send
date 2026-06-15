use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceType {
    Desktop,
    Web,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: uuid::Uuid,
    pub name: String,
    pub device_type: DeviceType,
    #[serde(default)]
    pub addr: Option<SocketAddr>,
    #[serde(default)]
    pub ip_address: Option<String>,
    #[serde(default)]
    pub connected_at: Option<DateTime<Utc>>,
    pub last_seen: DateTime<Utc>,
}
