use crate::error::{Error, Result};
use crate::security::ApprovedPathRegistry;
use hybrid_canvas_file_native::atomic_write;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State, command};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FilePath;
use tauri_plugin_store::StoreExt;

const MAX_DRAW_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Deserialize, Type)]
pub struct OpenFileOptions {
    pub title: Option<String>,
    pub filters: Option<Vec<FileFilter>>,
    pub multiple: Option<bool>,
    pub directory: Option<bool>,
    pub default_path: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Type)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct OpenFileResult {
    pub paths: Vec<String>,
    pub cancelled: bool,
}

#[command]
pub async fn file_open(
    app: AppHandle,
    registry: State<'_, ApprovedPathRegistry>,
    options: Option<OpenFileOptions>,
) -> Result<OpenFileResult> {
    let mut dialog = app.dialog().file();

    if let Some(ref opts) = options {
        if let Some(ref title) = opts.title {
            dialog = dialog.set_title(title);
        }
        if let Some(ref filters) = opts.filters {
            for filter in filters {
                let extensions: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
                dialog = dialog.add_filter(&filter.name, &extensions);
            }
        }
        if let Some(ref default_path) = opts.default_path {
            dialog = dialog.set_directory(default_path);
        }
    }

    let multiple = options.as_ref().and_then(|o| o.multiple).unwrap_or(false);
    let directory = options.as_ref().and_then(|o| o.directory).unwrap_or(false);

    let result = if directory {
        if multiple {
            dialog.blocking_pick_folders()
        } else {
            dialog.blocking_pick_folder().map(|p| vec![p])
        }
    } else if multiple {
        dialog.blocking_pick_files()
    } else {
        dialog.blocking_pick_file().map(|p| vec![p])
    };

    match result {
        Some(paths) => {
            let mut approved_paths = Vec::with_capacity(paths.len());

            for path in paths {
                if let FilePath::Path(ref native_path) = path {
                    registry.approve(native_path)?;
                }

                approved_paths.push(file_path_to_string(path));
            }

            Ok(OpenFileResult {
                paths: approved_paths,
                cancelled: false,
            })
        }
        None => Ok(OpenFileResult {
            paths: vec![],
            cancelled: true,
        }),
    }
}

fn file_path_to_string(p: FilePath) -> String {
    match p {
        FilePath::Path(p) => p.to_string_lossy().to_string(),
        FilePath::Url(u) => u.to_string(),
    }
}

#[derive(Debug, Deserialize, Type)]
pub struct SaveFileOptions {
    pub title: Option<String>,
    pub filters: Option<Vec<FileFilter>>,
    pub default_path: Option<String>,
    pub default_name: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct SaveFileResult {
    pub path: Option<String>,
    pub cancelled: bool,
}

#[command]
pub async fn file_save(
    app: AppHandle,
    registry: State<'_, ApprovedPathRegistry>,
    options: Option<SaveFileOptions>,
) -> Result<SaveFileResult> {
    let mut dialog = app.dialog().file();

    if let Some(ref opts) = options {
        if let Some(ref title) = opts.title {
            dialog = dialog.set_title(title);
        }
        if let Some(ref filters) = opts.filters {
            for filter in filters {
                let extensions: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
                dialog = dialog.add_filter(&filter.name, &extensions);
            }
        }
        if let Some(ref default_path) = opts.default_path {
            dialog = dialog.set_directory(default_path);
        }
        if let Some(ref default_name) = opts.default_name {
            dialog = dialog.set_file_name(default_name);
        }
    }

    let result = dialog.blocking_save_file();

    match result {
        Some(path) => {
            if let FilePath::Path(ref native_path) = path {
                registry.approve(native_path)?;
            }

            Ok(SaveFileResult {
                path: Some(file_path_to_string(path)),
                cancelled: false,
            })
        }
        None => Ok(SaveFileResult {
            path: None,
            cancelled: true,
        }),
    }
}

#[command]
pub async fn file_save_as(
    app: AppHandle,
    registry: State<'_, ApprovedPathRegistry>,
    options: SaveFileOptions,
) -> Result<SaveFileResult> {
    file_save(app, registry, Some(options)).await
}

#[derive(Debug, Deserialize, Serialize, Type)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub last_opened: String,
    pub size: u64,
}

#[command]
pub async fn file_recent_list(app: AppHandle) -> Result<Vec<RecentFile>> {
    let store = app.store("recent-files.json")?;

    match store.get("files") {
        None => Ok(Vec::new()),
        Some(value) => serde_json::from_value(value)
            .map_err(|error| Error::Validation(format!("invalid recent files: {error}"))),
    }
}

#[command]
pub async fn file_close(app: AppHandle, path: String) -> Result<()> {
    let store = app.store("recent-files.json")?;
    let mut files: Vec<RecentFile> = store
        .get("files")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    files.retain(|f| f.path != path);
    store.set("files", serde_json::to_value(files)?);
    store.save()?;
    Ok(())
}

#[derive(Debug, Deserialize, Serialize, Type)]
pub struct DrawSaveRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize, Serialize, Type)]
pub struct DrawReadResult {
    pub content: String,
}

#[command]
pub async fn file_save_draw(
    registry: State<'_, ApprovedPathRegistry>,
    request: DrawSaveRequest,
) -> Result<()> {
    ensure_draw_size(request.content.len() as u64)?;

    let path = registry.require(Path::new(&request.path))?;
    ensure_draw_path(&path)?;

    write_draw_file(path, request.content).await?;
    Ok(())
}

#[command]
pub async fn file_read_draw(
    registry: State<'_, ApprovedPathRegistry>,
    path: String,
) -> Result<DrawReadResult> {
    let path = registry.require(Path::new(&path))?;
    ensure_draw_path(&path)?;

    let metadata = tokio::fs::metadata(&path).await?;
    ensure_draw_size(metadata.len())?;

    let content = tokio::fs::read_to_string(&path).await?;
    Ok(DrawReadResult { content })
}

#[command]
pub async fn file_create_draw(
    registry: State<'_, ApprovedPathRegistry>,
    path: String,
    content: String,
) -> Result<DrawReadResult> {
    ensure_draw_size(content.len() as u64)?;

    let file_path = registry.require(Path::new(&path))?;
    ensure_draw_path(&file_path)?;

    let content = write_draw_file(file_path, content).await?;
    Ok(DrawReadResult { content })
}


async fn write_draw_file(
    path: PathBuf,
    content: String,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        atomic_write(&path, content.as_bytes())?;
        Ok(content)
    })
    .await
    .map_err(|error| {
        Error::Internal(format!(
            "draw file write task failed: {error}"
        ))
    })?
}

fn ensure_draw_size(size: u64) -> Result<()> {
    if size <= MAX_DRAW_FILE_BYTES {
        return Ok(());
    }

    Err(Error::Validation(format!(
        "draw file exceeds {MAX_DRAW_FILE_BYTES} bytes"
    )))
}

fn ensure_draw_path(path: &Path) -> Result<()> {
    let is_draw = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("draw"));

    if is_draw {
        return Ok(());
    }

    Err(Error::Validation(format!(
        "expected a .draw file path: {}",
        path.display()
    )))
}
