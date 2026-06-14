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
    pub last_seen: DateTime<Utc>,
}
