use tauri::State;
use crate::AppState;
use crate::core::device::{DeviceInfo, DeviceType};

#[tauri::command]
pub fn get_device_id(state: State<AppState>) -> String {
    state.config.lock().unwrap().device_id.to_string()
}

#[tauri::command]
pub fn get_device_name(state: State<AppState>) -> String {
    state.config.lock().unwrap().device_name.clone()
}

#[tauri::command]
pub fn set_device_name(state: State<AppState>, name: String) -> Result<(), String> {
    if name.is_empty() || name.len() > 32 {
        return Err("名称长度必须在 1-32 个字符之间".into());
    }
    let mut config = state.config.lock().unwrap();
    config.device_name = name;
    crate::storage::config::save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_device_info(state: State<AppState>) -> DeviceInfo {
    let config = state.config.lock().unwrap();
    DeviceInfo {
        id: config.device_id,
        name: config.device_name.clone(),
        device_type: DeviceType::Desktop,
        addr: None,
        ip_address: None,
        connected_at: Some(chrono::Utc::now()),
        last_seen: chrono::Utc::now(),
    }
}
