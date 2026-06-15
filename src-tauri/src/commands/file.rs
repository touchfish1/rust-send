use crate::AppError;
use crate::core::file::FileMeta;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Window;
use tokio::sync::oneshot;

#[tauri::command]
pub async fn pick_files(window: Window) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = oneshot::channel();
    let mut dialog = window.dialog().file();
    #[cfg(any(target_os = "macos", windows))]
    {
        dialog = dialog.set_parent(&window);
    }
    dialog.pick_files(move |files| {
        let _ = tx.send(files);
    });
    let files = rx
        .await
        .map_err(|_| "file dialog was interrupted".to_string())?
        .unwrap_or_default();
    Ok(files
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub async fn pick_directory(window: Window) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = oneshot::channel();
    let mut dialog = window.dialog().file();
    #[cfg(any(target_os = "macos", windows))]
    {
        dialog = dialog.set_parent(&window);
    }
    dialog.pick_folder(move |dir| {
        let _ = tx.send(dir);
    });
    let dir = rx
        .await
        .map_err(|_| "directory dialog was interrupted".to_string())?;
    Ok(dir.and_then(|d| d.into_path().ok().map(|p| p.to_string_lossy().to_string())))
}

#[tauri::command]
pub async fn get_file_meta(path: String) -> Result<FileMeta, AppError> {
    let meta = tokio::fs::metadata(&path).await?;
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let ext = std::path::Path::new(&path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let mime_type = match ext.as_str() {
        "pdf" => "application/pdf",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "zip" => "application/zip",
        "tar" | "gz" => "application/gzip",
        _ => "application/octet-stream",
    }
    .to_string();

    Ok(FileMeta {
        id: uuid::Uuid::new_v4(),
        name,
        size: meta.len(),
        mime_type,
    })
}

#[tauri::command]
pub fn get_downloads_dir(state: tauri::State<crate::AppState>) -> String {
    state
        .config
        .lock()
        .unwrap()
        .download_dir
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(format!("file does not exist: {}", path.display()));
    }

    reveal_path(&path)
}

#[cfg(target_os = "windows")]
fn reveal_path(path: &Path) -> Result<(), String> {
    Command::new("explorer.exe")
        .arg(format!("/select,\"{}\"", path.display()))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn reveal_path(path: &Path) -> Result<(), String> {
    Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_path(path: &Path) -> Result<(), String> {
    let dir = if path.is_dir() {
        path
    } else {
        path.parent()
            .ok_or_else(|| format!("file has no parent folder: {}", path.display()))?
    };

    Command::new("xdg-open")
        .arg(dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
