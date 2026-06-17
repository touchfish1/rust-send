mod commands;
mod core;
mod discovery;
pub mod error;
mod platform;
mod relay;
mod storage;
mod transfer;

pub use error::AppError;

use core::file::FileMeta;
use core::file::ProgressEvent;
use relay::client::RelayClient;
use std::collections::HashMap;
use std::sync::Arc;
use storage::{config::Config, history::TransferHistory};
use tauri::{Emitter, Manager};
use transfer::engine::{TransferConfig, TransferEngine};

use bytes::Bytes;
use tokio::sync::mpsc;

pub struct AppState {
    pub config: std::sync::Mutex<Config>,
    pub history: std::sync::Mutex<TransferHistory>,
    pub engine: Arc<tokio::sync::Mutex<TransferEngine>>,
    pub relay_client: Arc<tokio::sync::Mutex<Option<Arc<RelayClient>>>>,
    pub pending_outgoing: Arc<tokio::sync::Mutex<HashMap<String, PendingOutgoingTransfer>>>,
    /// file_id → data sender channel for routing incoming relay data to receivers
    pub receiver_data_channels:
        Arc<tokio::sync::Mutex<std::collections::HashMap<uuid::Uuid, mpsc::Sender<Bytes>>>>,
}

#[derive(Clone)]
pub struct PendingOutgoingTransfer {
    pub offer_id: String,
    pub target_id: uuid::Uuid,
    pub target_name: String,
    pub files: Vec<FileMeta>,
    pub paths: Vec<String>,
    pub client: Arc<RelayClient>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = Config::load().unwrap_or_default();
    let history = TransferHistory::load().unwrap_or_default();
    let engine_config = TransferConfig {
        chunk_size: config.chunk_size,
        max_concurrent: 3,
        ..Default::default()
    };
    let data_channels: Arc<
        tokio::sync::Mutex<std::collections::HashMap<uuid::Uuid, mpsc::Sender<Bytes>>>,
    > = Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));
    let (mut engine, progress_rx) = TransferEngine::new(engine_config);
    engine.set_data_channels(data_channels.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            receiver_data_channels: data_channels.clone(),
            config: std::sync::Mutex::new(config),
            history: std::sync::Mutex::new(history),
            engine: Arc::new(tokio::sync::Mutex::new(engine)),
            relay_client: Arc::new(tokio::sync::Mutex::new(None)),
            pending_outgoing: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        })
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let handle = app.handle().clone();

            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon().cloned() {
                    // macOS 开发态偶尔不会把 bundle 图标正确挂到窗口进程上，
                    // 这里显式设置一次，尽量避免 Dock 里退化成纯色块。
                    let _ = window.set_icon(icon);
                }
            }

            // mDNS 局域网发现（Tauri 桌面端）
            let app_state = app.state::<AppState>().inner();
            let device_id = app_state
                .config
                .lock()
                .ok()
                .map(|c| c.device_id)
                .unwrap_or_else(uuid::Uuid::new_v4);
            let device_name = app_state
                .config
                .lock()
                .ok()
                .map(|c| c.device_name.clone())
                .unwrap_or_else(whoami::hostname);
            match crate::discovery::mdns::MdnsDiscovery::start(device_id, &device_name) {
                Ok((_discovery, mdns_rx)) => {
                    let mdns_handle = handle.clone();
                    std::thread::spawn(move || {
                        while let Ok(event) = mdns_rx.recv() {
                            match event {
                                crate::discovery::mdns::DiscoveredEvent::Found(device) => {
                                    use tauri::Emitter;
                                    let _ = mdns_handle.emit("device:discovered", &device);
                                }
                                crate::discovery::mdns::DiscoveredEvent::Lost(device_id) => {
                                    use tauri::Emitter;
                                    let _ = mdns_handle.emit(
                                        "device:lost",
                                        serde_json::json!({"device_id": device_id}),
                                    );
                                }
                            }
                        }
                    });
                    tracing::info!("mDNS discovery started");
                }
                Err(e) => {
                    tracing::warn!("mDNS discovery failed: {}", e);
                }
            }

            // 进度事件循环
            tauri::async_runtime::spawn(async move {
                let mut rx = progress_rx;
                while let Some(event) = rx.recv().await {
                    use serde_json::json;
                    match event {
                        ProgressEvent::Progress {
                            transfer_id,
                            file_id,
                            file_name,
                            bytes_sent,
                            bytes_total,
                            speed,
                        } => {
                            handle
                                .emit(
                                    "transfer:progress",
                                    json!({
                                        "transfer_id": transfer_id, "file_id": file_id,
                                        "file_name": file_name, "bytes_sent": bytes_sent,
                                        "bytes_total": bytes_total, "speed": speed,
                                    }),
                                )
                                .ok();
                        }
                        ProgressEvent::Complete {
                            transfer_id,
                            file_id,
                            file_name,
                            saved_path,
                        } => {
                            if let Some(record) = {
                                let state = handle.state::<AppState>();
                                let mut engine = state.engine.lock().await;
                                engine.mark_file_completed(&transfer_id, &file_id)
                            } {
                                persist_history_record(&handle, record);
                            }
                            handle
                                .emit(
                                    "transfer:complete",
                                    json!({
                                        "transfer_id": transfer_id,
                                        "file_id": file_id,
                                        "file_name": file_name,
                                        "saved_path": saved_path,
                                    }),
                                )
                                .ok();
                        }
                        ProgressEvent::BatchComplete { transfer_id } => {
                            handle
                                .emit(
                                    "transfer:batch_complete",
                                    json!({"transfer_id": transfer_id}),
                                )
                                .ok();
                        }
                        ProgressEvent::Failed {
                            transfer_id,
                            file_id,
                            error,
                        } => {
                            if let Some(record) = {
                                let state = handle.state::<AppState>();
                                let mut engine = state.engine.lock().await;
                                engine.mark_file_failed(&transfer_id, &file_id, error.clone())
                            } {
                                persist_history_record(&handle, record);
                            }
                            handle.emit("transfer:failed", json!({
                                "transfer_id": transfer_id, "file_id": file_id, "error": error,
                            })).ok();
                        }
                        ProgressEvent::Paused { reason } => {
                            handle
                                .emit("transfer:paused", json!({"reason": reason}))
                                .ok();
                        }
                        ProgressEvent::Resumed { file_id } => {
                            handle
                                .emit("transfer:resumed", json!({"file_id": file_id}))
                                .ok();
                        }
                        ProgressEvent::Cancelled {
                            transfer_id,
                            reason,
                        } => {
                            if let Some(record) = {
                                let state = handle.state::<AppState>();
                                let mut engine = state.engine.lock().await;
                                engine.mark_transfer_cancelled(&transfer_id, reason.clone())
                            } {
                                persist_history_record(&handle, record);
                            }
                            handle
                                .emit(
                                    "transfer:cancelled",
                                    json!({"transfer_id": transfer_id, "reason": reason}),
                                )
                                .ok();
                        }
                        ProgressEvent::Queued {
                            transfer_id,
                            position,
                        } => {
                            handle
                                .emit(
                                    "transfer:queued",
                                    json!({"transfer_id": transfer_id, "position": position}),
                                )
                                .ok();
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::device::get_device_id,
            commands::device::get_device_name,
            commands::device::set_device_name,
            commands::device::get_device_info,
            commands::device::get_local_ip_addresses,
            commands::file::pick_files,
            commands::file::pick_directory,
            commands::file::get_file_meta,
            commands::file::get_downloads_dir,
            commands::file::reveal_file,
            commands::network::connect_relay,
            commands::network::disconnect_relay,
            commands::network::send_chat_message,
            commands::transfer::send_files,
            commands::transfer::accept_transfer,
            commands::transfer::reject_transfer,
            commands::transfer::cancel_transfer,
            commands::transfer::pause_transfer,
            commands::transfer::resume_transfer,
            commands::transfer::get_active_transfers,
            commands::transfer::get_history,
            commands::transfer::clear_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn persist_history_record(app: &tauri::AppHandle, record: core::file::TransferRecord) {
    let state = app.state::<AppState>();
    if let Ok(mut history) = state.history.lock() {
        history.add(record);
        if let Err(error) = crate::storage::history::save(&history) {
            tracing::warn!("save history failed: {}", error);
        }
    }
}
