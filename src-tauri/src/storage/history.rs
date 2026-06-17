use crate::core::file::TransferRecord;
use serde::{Deserialize, Serialize};

const HISTORY_FILE: &str = "history.json";

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct TransferHistory {
    pub records: Vec<TransferRecord>,
}

impl TransferHistory {
    pub fn load() -> Result<Self, crate::AppError> {
        let path = crate::platform::paths::get_config_dir().join(HISTORY_FILE);
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            Ok(serde_json::from_str(&content)?)
        } else {
            Ok(Self {
                records: Vec::new(),
            })
        }
    }

    pub fn save(&self) -> Result<(), crate::AppError> {
        let path = crate::platform::paths::get_config_dir().join(HISTORY_FILE);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(&self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    pub fn add(&mut self, record: TransferRecord) {
        self.records.push(record);
        if self.records.len() > 500 {
            self.records.remove(0);
        }
    }

    pub fn clear(&mut self) {
        self.records.clear();
    }
}

pub fn save(history: &TransferHistory) -> Result<(), crate::AppError> {
    history.save()
}
