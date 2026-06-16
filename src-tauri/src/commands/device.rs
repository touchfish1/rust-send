use tauri::State;
use crate::AppState;
use crate::core::device::{DeviceInfo, DeviceType};
use std::net::IpAddr;

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

#[tauri::command]
pub fn get_local_ip_addresses() -> Result<Vec<String>, String> {
    let mut ips = if_addrs::get_if_addrs()
        .map_err(|e| e.to_string())?
        .into_iter()
        // 这里只返回更可能被手机访问到的 IPv4 私网地址；
        // 回环地址和公网地址都不适合作为开发态扫码入口。
        .filter_map(|iface| match iface.ip() {
            IpAddr::V4(ip) if !ip.is_loopback() && is_private_ipv4(ip) => Some(ip.to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();

    // 同一地址可能出现在多个接口别名上，去重后再交给前端挑选。
    ips.sort();
    ips.dedup();
    Ok(ips)
}

fn is_private_ipv4(ip: std::net::Ipv4Addr) -> bool {
    ip.is_private() || ip.is_link_local()
}
