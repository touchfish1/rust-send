use crate::AppError;
use crate::core::file::FileMeta;

#[tauri::command]
pub async fn pick_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app
        .dialog()
        .file()
        .add_filter("All", &["*"])
        .blocking_pick_files();
    Ok(files
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| {
            let p = f.into_path().ok()?;
            Some(p.to_string_lossy().to_string())
        })
        .collect())
}

#[tauri::command]
pub async fn pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let dir = app.dialog().file().blocking_pick_folder();
    Ok(dir.and_then(|d| {
        let p = d.into_path().ok()?;
        Some(p.to_string_lossy().to_string())
    }))
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
