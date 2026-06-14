use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const CONFIG_FILE: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub device_id: uuid::Uuid,
    pub device_name: String,
    pub download_dir: PathBuf,
    pub chunk_size: u32,
    pub auto_accept_lan: bool,
    pub relay_url: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        let suffix = &uuid::Uuid::new_v4().to_string()[..6];
        Self {
            device_id: uuid::Uuid::new_v4(),
            device_name: format!("{}-{}", whoami::hostname(), suffix),
            download_dir: crate::platform::paths::get_downloads_dir().join("rust-send"),
            chunk_size: 65536,
            auto_accept_lan: false,
            relay_url: Some("ws://localhost:8080/ws".into()),
        }
    }
}

impl Config {
    pub fn load() -> Result<Self, crate::AppError> {
        let path = crate::platform::paths::get_config_dir().join(CONFIG_FILE);
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            Ok(serde_json::from_str(&content)?)
        } else {
            let config = Config::default();
            save(&config)?;
            Ok(config)
        }
    }
}

pub fn save(config: &Config) -> Result<(), crate::AppError> {
    let path = crate::platform::paths::get_config_dir().join(CONFIG_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}
