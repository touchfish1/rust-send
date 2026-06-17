use crate::core::file::{FileMeta, TransferRecord, TransferState};
use crate::core::peer::PeerHandle;
use crate::{AppState, PendingOutgoingTransfer};
use tauri::State;

#[tauri::command]
pub async fn send_files(
    state: State<'_, AppState>,
    target_id: String,
    target_name: String,
    paths: Vec<String>,
    file_ids: Option<Vec<String>>,
    offer_id: Option<String>,
    expires_at: Option<String>,
) -> Result<(), String> {
    let target = uuid::Uuid::parse_str(&target_id).map_err(|e| e.to_string())?;
    let offer_id = offer_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let expires_at = expires_at
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(&value).ok())
        .map(|value| value.with_timezone(&chrono::Utc))
        .unwrap_or_else(|| chrono::Utc::now() + chrono::Duration::hours(2));
    let expires_at_text = expires_at.to_rfc3339();

    let mut files = Vec::new();
    for (index, p) in paths.iter().enumerate() {
        let meta = tokio::fs::metadata(p).await.map_err(|e| e.to_string())?;
        let name = std::path::Path::new(p)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let id = file_ids
            .as_ref()
            .and_then(|ids| ids.get(index))
            .and_then(|id| uuid::Uuid::parse_str(id).ok())
            .unwrap_or_else(uuid::Uuid::new_v4);
        files.push(FileMeta {
            id,
            name,
            size: meta.len(),
            mime_type: "application/octet-stream".into(),
        });
    }

    let client = {
        let relay = state.relay_client.lock().await;
        if let Some(ref c) = *relay {
            c.clone()
        } else {
            drop(relay);
            let url = {
                let config = state.config.lock().map_err(|e| e.to_string())?;
                config.relay_url.clone().unwrap_or_default()
            };
            return Err(if url.is_empty() {
                "relay not configured".into()
            } else {
                "relay not connected".into()
            });
        }
    };

    // 通过中继发送传输请求
    client
        .send_transfer_request(target, &offer_id, &expires_at_text, &files)
        .map_err(|e| e.to_string())?;

    let pending = PendingOutgoingTransfer {
        offer_id: offer_id.clone(),
        target_id: target,
        target_name,
        files,
        paths,
        client,
        expires_at,
    };
    state
        .pending_outgoing
        .lock()
        .await
        .insert(offer_id.clone(), pending);

    tracing::info!("send_files offered: target={} offer={}", target, offer_id);
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct FileInfo {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub mime_type: String,
}

#[tauri::command]
pub async fn accept_transfer(
    state: State<'_, AppState>,
    source_id: String,
    source_name: Option<String>,
    offer_id: Option<String>,
    expires_at: Option<String>,
    save_dir: String,
    files: Vec<FileInfo>,
) -> Result<(), String> {
    let source = uuid::Uuid::parse_str(&source_id).map_err(|e| e.to_string())?;
    let offer_id = offer_id.unwrap_or_default();
    if let Some(expires_at) = expires_at.as_deref() {
        let expires_at = chrono::DateTime::parse_from_rfc3339(expires_at)
            .map_err(|_| "invalid expiration time".to_string())?
            .with_timezone(&chrono::Utc);
        if chrono::Utc::now() >= expires_at {
            return Err("file offer expired".into());
        }
    }

    let client = {
        let relay = state.relay_client.lock().await;
        relay.as_ref().ok_or("relay not connected")?.clone()
    };

    let file_metas: Vec<FileMeta> = files
        .into_iter()
        .map(|f| FileMeta {
            id: uuid::Uuid::parse_str(&f.id).unwrap_or_else(|_| uuid::Uuid::new_v4()),
            name: f.name,
            size: f.size,
            mime_type: f.mime_type,
        })
        .collect();

    // 通知发送方：现在开始下载这些文件。
    client
        .send_transfer_response(source, &offer_id, true, &file_metas, None)
        .map_err(|e| e.to_string())?;

    let source_name = source_name.unwrap_or_else(|| source_id.clone());

    let peer = PeerHandle::Relay {
        client,
        peer_id: source,
    };

    let mut engine = state.engine.lock().await;
    engine.start_receive(peer, source_name, file_metas, save_dir.into());

    tracing::info!("accept_transfer: source={} offer={}", source, offer_id);
    Ok(())
}

#[tauri::command]
pub async fn reject_transfer(
    state: State<'_, AppState>,
    source_id: String,
    offer_id: Option<String>,
) -> Result<(), String> {
    let _source = uuid::Uuid::parse_str(&source_id).map_err(|e| e.to_string())?;

    let relay = state.relay_client.lock().await;
    if let Some(client) = relay.as_ref() {
        client
            .send_transfer_response(
                _source,
                offer_id.as_deref().unwrap_or_default(),
                false,
                &[],
                Some("rejected"),
            )
            .ok();
    }
    drop(relay);

    tracing::info!("reject_transfer: source={}", source_id);
    Ok(())
}

#[tauri::command]
pub async fn cancel_transfer(
    state: State<'_, AppState>,
    transfer_id: String,
) -> Result<(), String> {
    let id = uuid::Uuid::parse_str(&transfer_id).map_err(|e| e.to_string())?;
    let mut engine = state.engine.lock().await;
    engine.cancel(&id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pause_transfer(state: State<'_, AppState>, transfer_id: String) -> Result<(), String> {
    let id = uuid::Uuid::parse_str(&transfer_id).map_err(|e| e.to_string())?;
    let mut engine = state.engine.lock().await;
    engine.pause(&id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn resume_transfer(
    state: State<'_, AppState>,
    transfer_id: String,
) -> Result<(), String> {
    let id = uuid::Uuid::parse_str(&transfer_id).map_err(|e| e.to_string())?;
    let mut engine = state.engine.lock().await;
    engine.resume(&id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_active_transfers(
    state: State<'_, AppState>,
) -> Result<Vec<TransferState>, String> {
    let engine = state.engine.lock().await;
    Ok(engine.active_transfers())
}

#[tauri::command]
pub fn get_history(state: tauri::State<AppState>) -> Vec<TransferRecord> {
    state.history.lock().unwrap().records.clone()
}

#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let mut history = state.history.lock().unwrap();
    history.clear();
    crate::storage::history::save(&history).map_err(|e| e.to_string())?;
    Ok(())
}
