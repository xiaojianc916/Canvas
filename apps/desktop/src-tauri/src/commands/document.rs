use crate::error::{Error, IpcError, Result};
use hybrid_canvas_file_native::atomic_write;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use tauri::{command, AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use uuid::Uuid;

const MAX_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;
const DRAW_EXTENSION: &str = "draw";
const DEFAULT_DOCUMENT_NAME: &str = "untitled.draw";

type DocumentCommandResult<T> = std::result::Result<T, IpcError>;

/// Opaque document identity exposed to the renderer.
///
/// The renderer never receives or submits filesystem paths. The native process
/// owns the mapping between this ID and the selected local file.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize, Type)]
#[serde(transparent)]
pub struct DocumentId(Uuid);

impl DocumentId {
    fn new() -> Self {
        Self(Uuid::now_v7())
    }
}

/// Native-only document handle.
///
/// This type deliberately does not implement Serialize or Type. A filesystem
/// path is an implementation detail and must not cross the IPC boundary.
#[derive(Clone, Debug)]
struct DocumentHandle {
    path: PathBuf,
}

#[derive(Debug, Default)]
pub struct DocumentRegistry {
    documents: RwLock<HashMap<DocumentId, DocumentHandle>>,
}

impl DocumentRegistry {
    fn insert(&self, path: PathBuf) -> Result<DocumentId> {
        let document_id = DocumentId::new();
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        documents.insert(document_id, DocumentHandle { path });
        Ok(document_id)
    }

    fn path(&self, document_id: DocumentId) -> Result<PathBuf> {
        let documents = self
            .documents
            .read()
            .map_err(|_| Error::Internal("document registry read lock poisoned".into()))?;

        documents
            .get(&document_id)
            .map(|handle| handle.path.clone())
            .ok_or_else(|| Error::NotFound("document session does not exist".into()))
    }

    fn replace_path(&self, document_id: DocumentId, path: PathBuf) -> Result<()> {
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        let handle = documents
            .get_mut(&document_id)
            .ok_or_else(|| Error::NotFound("document session does not exist".into()))?;

        handle.path = path;
        Ok(())
    }

    fn remove(&self, document_id: DocumentId) -> Result<()> {
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        if documents.remove(&document_id).is_some() {
            Ok(())
        } else {
            Err(Error::NotFound("document session does not exist".into()))
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentOpenResult {
    pub document_id: DocumentId,
    pub display_name: String,
    pub content: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentOpenResponse {
    pub document: Option<DocumentOpenResult>,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSaveRequest {
    pub document_id: DocumentId,
    pub content: String,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSaveAsRequest {
    /// None creates a new native document session.
    ///
    /// Some(document_id) moves the existing session to the newly selected file.
    pub document_id: Option<DocumentId>,
    pub content: String,
    pub suggested_name: Option<String>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSaveAsResult {
    pub document: Option<DocumentDescriptor>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDescriptor {
    pub document_id: DocumentId,
    pub display_name: String,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentCloseRequest {
    pub document_id: DocumentId,
}

/// Opens one .draw file selected by the native file dialog.
///
/// No caller-controlled path is accepted.
#[command]
#[specta::specta]
pub async fn document_open(
    app: AppHandle,
    documents: State<'_, DocumentRegistry>,
) -> DocumentCommandResult<DocumentOpenResponse> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Hybrid Canvas document", &[DRAW_EXTENSION])
        .blocking_pick_file();

    let Some(selected) = selected else {
        return Ok(DocumentOpenResponse { document: None });
    };

    let path = selected_native_path(selected)?;
    ensure_draw_document_path(&path)?;

    let content = read_document(path.clone()).await?;
    let document_id = documents.insert(path.clone())?;

    Ok(DocumentOpenResponse {
        document: Some(DocumentOpenResult {
            document_id,
            display_name: display_name(&path),
            content,
        }),
    })
}

/// Creates a new document session or moves an existing session through a native
/// Save As dialog. No filesystem path is accepted from the renderer.
#[command]
#[specta::specta]
pub async fn document_save_as(
    app: AppHandle,
    documents: State<'_, DocumentRegistry>,
    request: DocumentSaveAsRequest,
) -> DocumentCommandResult<DocumentSaveAsResult> {
    ensure_document_size(request.content.len() as u64)?;

    if let Some(document_id) = request.document_id {
        // Validate the document before displaying a dialog. An invalid document
        // ID must not be able to trigger a native file picker.
        let _ = documents.path(document_id)?;
    }

    let suggested_name = normalize_suggested_name(request.suggested_name.as_deref())?;

    let selected = app
        .dialog()
        .file()
        .add_filter("Hybrid Canvas document", &[DRAW_EXTENSION])
        .set_file_name(&suggested_name)
        .blocking_save_file();

    let Some(selected) = selected else {
        return Ok(DocumentSaveAsResult { document: None });
    };

    let path = selected_native_path(selected)?;
    ensure_draw_document_path(&path)?;

    write_document(path.clone(), request.content).await?;

    let document_id = match request.document_id {
        Some(document_id) => {
            documents.replace_path(document_id, path.clone())?;
            document_id
        }
        None => documents.insert(path.clone())?,
    };

    Ok(DocumentSaveAsResult {
        document: Some(DocumentDescriptor {
            document_id,
            display_name: display_name(&path),
        }),
    })
}

/// Saves content to the document already selected by a native dialog.
///
/// The renderer supplies an opaque document ID, never a local path.
#[command]
#[specta::specta]
pub async fn document_save(
    documents: State<'_, DocumentRegistry>,
    request: DocumentSaveRequest,
) -> DocumentCommandResult<()> {
    ensure_document_size(request.content.len() as u64)?;

    let path = documents.path(request.document_id)?;
    ensure_draw_document_path(&path)?;

    write_document(path, request.content).await
}

/// Ends the native document session and releases its private file handle.
#[command]
#[specta::specta]
pub fn document_close(
    documents: State<'_, DocumentRegistry>,
    request: DocumentCloseRequest,
) -> DocumentCommandResult<()> {
    documents.remove(request.document_id)
}

async fn read_document(path: PathBuf) -> Result<String> {
    let metadata = tokio::fs::metadata(&path).await?;
    ensure_document_size(metadata.len())?;

    let content = tokio::fs::read_to_string(&path).await?;
    ensure_document_size(content.len() as u64)?;

    Ok(content)
}

async fn write_document(path: PathBuf, content: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        atomic_write(path, content.as_bytes())
    })
    .await
    .map_err(|_| Error::Internal("document save task terminated unexpectedly".into()))?
    .map_err(Error::from)
}

fn selected_native_path(selected: FilePath) -> Result<PathBuf> {
    match selected {
        FilePath::Path(path) => Ok(path),
        FilePath::Url(_) => Err(Error::Validation(
            "selected document must be a local filesystem path".into(),
        )),
    }
}

fn ensure_document_size(size: u64) -> Result<()> {
    if size <= MAX_DOCUMENT_BYTES {
        return Ok(());
    }

    Err(Error::Validation("document exceeds the supported size limit".into()))
}

fn ensure_draw_document_path(path: &Path) -> Result<()> {
    let is_draw_document = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case(DRAW_EXTENSION));

    if is_draw_document {
        return Ok(());
    }

    Err(Error::Validation(
        "selected file must use the .draw extension".into(),
    ))
}

fn normalize_suggested_name(value: Option<&str>) -> Result<String> {
    let name = value.unwrap_or(DEFAULT_DOCUMENT_NAME).trim();

    if name.is_empty() {
        return Ok(DEFAULT_DOCUMENT_NAME.to_owned());
    }

    if name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
        || Path::new(name).components().count() != 1
    {
        return Err(Error::Validation(
            "suggested document name must not contain a path".into(),
        ));
    }

    if name
        .rsplit_once('.')
        .is_some_and(|(_, extension)| extension.eq_ignore_ascii_case(DRAW_EXTENSION))
    {
        return Ok(name.to_owned());
    }

    Ok(format!("{name}.{DRAW_EXTENSION}"))
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("untitled.draw")
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_keeps_path_private_behind_document_id() {
        let registry = DocumentRegistry::default();
        let path = PathBuf::from("/private/example.draw");

        let document_id = registry.insert(path.clone()).expect("document should register");

        assert_eq!(registry.path(document_id).expect("path should resolve"), path);
    }

    #[test]
    fn registry_rejects_unknown_document_id() {
        let registry = DocumentRegistry::default();
        let result = registry.path(DocumentId::new());

        assert!(matches!(result, Err(Error::NotFound(_))));
    }

    #[test]
    fn registry_removes_closed_document() {
        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(PathBuf::from("/private/example.draw"))
            .expect("document should register");

        registry.remove(document_id).expect("document should close");

        assert!(matches!(registry.path(document_id), Err(Error::NotFound(_))));
    }

    #[test]
    fn suggested_name_never_accepts_a_path() {
        assert!(normalize_suggested_name(Some("../secret.draw")).is_err());
        assert!(normalize_suggested_name(Some("folder/document.draw")).is_err());
        assert!(normalize_suggested_name(Some("folder\\document.draw")).is_err());
    }

    #[test]
    fn suggested_name_normalizes_draw_extension() {
        assert_eq!(
            normalize_suggested_name(Some("diagram")).expect("name should normalize"),
            "diagram.draw",
        );
        assert_eq!(
            normalize_suggested_name(Some("diagram.DRAW")).expect("name should normalize"),
            "diagram.DRAW",
        );
    }
}
