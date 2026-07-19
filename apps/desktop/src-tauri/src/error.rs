use serde::Serialize;
use std::fmt;

#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    SerdeJson(serde_json::Error),
    Tauri(tauri::Error),
    Store(tauri_plugin_store::Error),
    Dialog(tauri_plugin_dialog::Error),
    Fs(tauri_plugin_fs::Error),
    Opener(tauri_plugin_opener::Error),
    Updater(tauri_plugin_updater::Error),
    Clipboard(tauri_plugin_clipboard_manager::Error),
    Shell(tauri_plugin_shell::Error),
    Notification(tauri_plugin_notification::Error),
    WindowState(tauri_plugin_window_state::Error),
    GlobalShortcut(tauri_plugin_global_shortcut::Error),
    Log(tauri_plugin_log::Error),
    Validation(String),
    NotFound(String),
    PermissionDenied(String),
    Internal(String),
    Plugin(String),
    Collaboration(String),
    Export(String),
    Import(String),
    Asset(String),
    File(String),
}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(e) => write!(f, "IO error: {}", e),
            Error::SerdeJson(e) => write!(f, "JSON error: {}", e),
            Error::Tauri(e) => write!(f, "Tauri error: {}", e),
            Error::Store(e) => write!(f, "Store error: {}", e),
            Error::Dialog(e) => write!(f, "Dialog error: {}", e),
            Error::Fs(e) => write!(f, "FS error: {}", e),
            Error::Opener(e) => write!(f, "Opener error: {}", e),
            Error::Updater(e) => write!(f, "Updater error: {}", e),
            Error::Clipboard(e) => write!(f, "Clipboard error: {}", e),
            Error::Shell(e) => write!(f, "Shell error: {}", e),
            Error::Notification(e) => write!(f, "Notification error: {}", e),
            Error::WindowState(e) => write!(f, "Window state error: {}", e),
            Error::GlobalShortcut(e) => write!(f, "Global shortcut error: {}", e),
            Error::Log(e) => write!(f, "Log error: {}", e),
            Error::Validation(e) => write!(f, "Validation error: {}", e),
            Error::NotFound(e) => write!(f, "Not found: {}", e),
            Error::PermissionDenied(e) => write!(f, "Permission denied: {}", e),
            Error::Internal(e) => write!(f, "Internal error: {}", e),
            Error::Plugin(e) => write!(f, "Plugin error: {}", e),
            Error::Collaboration(e) => write!(f, "Collaboration error: {}", e),
            Error::Export(e) => write!(f, "Export error: {}", e),
            Error::Import(e) => write!(f, "Export error: {}", e),
            Error::Asset(e) => write!(f, "Asset error: {}", e),
            Error::File(e) => write!(f, "File error: {}", e),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io(e) => Some(e),
            Error::SerdeJson(e) => Some(e),
            Error::Tauri(e) => Some(e),
            Error::Store(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self { Error::Io(e) }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self { Error::SerdeJson(e) }
}

impl From<tauri::Error> for Error {
    fn from(e: tauri::Error) -> Self { Error::Tauri(e) }
}

impl From<tauri_plugin_store::Error> for Error {
    fn from(e: tauri_plugin_store::Error) -> Self { Error::Store(e) }
}

impl From<tauri_plugin_dialog::Error> for Error {
    fn from(e: tauri_plugin_dialog::Error) -> Self { Error::Dialog(e) }
}

impl From<tauri_plugin_fs::Error> for Error {
    fn from(e: tauri_plugin_fs::Error) -> Self { Error::Fs(e) }
}

impl From<tauri_plugin_opener::Error> for Error {
    fn from(e: tauri_plugin_opener::Error) -> Self { Error::Opener(e) }
}

impl From<tauri_plugin_updater::Error> for Error {
    fn from(e: tauri_plugin_updater::Error) -> Self { Error::Updater(e) }
}

impl From<tauri_plugin_clipboard_manager::Error> for Error {
    fn from(e: tauri_plugin_clipboard_manager::Error) -> Self { Error::Clipboard(e) }
}

impl From<tauri_plugin_shell::Error> for Error {
    fn from(e: tauri_plugin_shell::Error) -> Self { Error::Shell(e) }
}

impl From<tauri_plugin_notification::Error> for Error {
    fn from(e: tauri_plugin_notification::Error) -> Self { Error::Notification(e) }
}

impl From<tauri_plugin_window_state::Error> for Error {
    fn from(e: tauri_plugin_window_state::Error) -> Self { Error::WindowState(e) }
}

impl From<tauri_plugin_global_shortcut::Error> for Error {
    fn from(e: tauri_plugin_global_shortcut::Error) -> Self { Error::GlobalShortcut(e) }
}

impl From<tauri_plugin_log::Error> for Error {
    fn from(e: tauri_plugin_log::Error) -> Self { Error::Log(e) }
}

pub type Result<T> = std::result::Result<T, Error>;