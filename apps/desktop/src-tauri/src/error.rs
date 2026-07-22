use serde::Serialize;
use specta::Type;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Persistence error: {0}")]
    Persistence(String),

    #[error("JSON error: {0}")]
    SerdeJson(#[from] serde_json::Error),

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("Store error: {0}")]
    Store(#[from] tauri_plugin_store::Error),

    #[error("Dialog error: {0}")]
    Dialog(#[from] tauri_plugin_dialog::Error),

    #[error("FS error: {0}")]
    Fs(#[from] tauri_plugin_fs::Error),

    #[error("Opener error: {0}")]
    Opener(#[from] tauri_plugin_opener::Error),

    #[error("Updater error: {0}")]
    Updater(#[from] tauri_plugin_updater::Error),

    #[error("Clipboard error: {0}")]
    Clipboard(#[from] tauri_plugin_clipboard_manager::Error),

    #[error("Shell error: {0}")]
    Shell(#[from] tauri_plugin_shell::Error),

    #[error("Notification error: {0}")]
    Notification(#[from] tauri_plugin_notification::Error),

    #[error("Window state error: {0}")]
    WindowState(#[from] tauri_plugin_window_state::Error),

    #[error("Global shortcut error: {0}")]
    GlobalShortcut(#[from] tauri_plugin_global_shortcut::Error),

    #[error("Log error: {0}")]
    Log(#[from] tauri_plugin_log::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Plugin error: {0}")]
    Plugin(String),

    #[error("Collaboration error: {0}")]
    Collaboration(String),

    #[error("Export error: {0}")]
    Export(String),

    #[error("Import error: {0}")]
    Import(String),

    #[error("Asset error: {0}")]
    Asset(String),

    #[error("File error: {0}")]
    File(String),
}

#[derive(Clone, Copy, Debug, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum IpcErrorCode {
    Validation,
    NotFound,
    PermissionDenied,
    Persistence,
    Plugin,
    Asset,
    ImportExport,
    Platform,
}

#[derive(Clone, Copy, Debug, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum IpcOperation {
    File,
    Plugin,
    Asset,
    ImportExport,
    Platform,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: IpcErrorCode,
    pub message: String,
    pub operation: IpcOperation,
    pub recoverable: bool,
}

impl Error {
    fn code(&self) -> IpcErrorCode {
        match self {
            Self::Validation(_) => IpcErrorCode::Validation,
            Self::NotFound(_) => IpcErrorCode::NotFound,
            Self::PermissionDenied(_) => IpcErrorCode::PermissionDenied,
            Self::Persistence(_) | Self::File(_) | Self::Io(_) => IpcErrorCode::Persistence,
            Self::Plugin(_) => IpcErrorCode::Plugin,
            Self::Asset(_) => IpcErrorCode::Asset,
            Self::Import(_) | Self::Export(_) => IpcErrorCode::ImportExport,
            _ => IpcErrorCode::Platform,
        }
    }

    fn operation(&self) -> IpcOperation {
        match self {
            Self::Persistence(_) | Self::File(_) | Self::Io(_) => IpcOperation::File,
            Self::Plugin(_) => IpcOperation::Plugin,
            Self::Asset(_) => IpcOperation::Asset,
            Self::Import(_) | Self::Export(_) => IpcOperation::ImportExport,
            _ => IpcOperation::Platform,
        }
    }

    fn recoverable(&self) -> bool {
        matches!(
            self,
            Self::Io(_)
                | Self::Persistence(_)
                | Self::PermissionDenied(_)
                | Self::File(_)
                | Self::NotFound(_)
        )
    }
}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        IpcError {
            code: self.code(),
            message: self.to_string(),
            operation: self.operation(),
            recoverable: self.recoverable(),
        }
        .serialize(serializer)
    }
}

impl From<hybrid_canvas_file_native::Error> for Error {
    fn from(error: hybrid_canvas_file_native::Error) -> Self {
        Self::Persistence(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

#[cfg(test)]
mod tests {
    use super::{Error, IpcErrorCode, IpcOperation};

    #[test]
    fn import_error_uses_import_message() {
        let error = Error::Import("invalid document".to_owned());

        assert_eq!(
            error.to_string(),
            "Import error: invalid document"
        );
    }

    #[test]
    fn export_error_uses_export_message() {
        let error = Error::Export("unsupported target".to_owned());

        assert_eq!(
            error.to_string(),
            "Export error: unsupported target"
        );
    }

    #[test]
    fn validation_error_has_validation_ipc_mapping() {
        let error = Error::Validation("invalid input".to_owned());

        assert!(matches!(error.code(), IpcErrorCode::Validation));
        assert!(matches!(error.operation(), IpcOperation::Platform));
        assert!(!error.recoverable());
    }

    #[test]
    fn import_error_has_import_export_operation() {
        let error = Error::Import("invalid document".to_owned());

        assert!(matches!(
            error.code(),
            IpcErrorCode::ImportExport
        ));
        assert!(matches!(
            error.operation(),
            IpcOperation::ImportExport
        ));
        assert!(!error.recoverable());
    }

    #[test]
    fn io_error_is_recoverable_persistence_error() {
        let error = Error::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "denied",
        ));

        assert!(matches!(
            error.code(),
            IpcErrorCode::Persistence
        ));
        assert!(matches!(
            error.operation(),
            IpcOperation::File
        ));
        assert!(error.recoverable());
    }

    #[test]
    fn serialized_error_preserves_ipc_contract() {
        let value = serde_json::to_value(
            Error::Validation("invalid settings".to_owned()),
        )
        .expect("error should serialize");

        assert_eq!(value["code"], "validation");
        assert_eq!(value["operation"], "platform");
        assert_eq!(
            value["message"],
            "Validation error: invalid settings"
        );
        assert_eq!(value["recoverable"], false);
    }
}

