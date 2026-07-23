use crate::error::{Error, IpcError, Result};
use hybrid_canvas_file_native::{
    atomic_write, canonicalize_draw_document, document_revision,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
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
    revision: String,
}

#[derive(Clone, Debug, Default)]
pub struct DocumentRegistry {
    documents: Arc<RwLock<HashMap<DocumentId, DocumentHandle>>>,
}

impl DocumentRegistry {
    fn insert(&self, path: PathBuf, revision: String) -> Result<DocumentId> {
        let document_id = DocumentId::new();
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        documents.insert(document_id, DocumentHandle { path, revision });
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

    fn save_as_existing(
        &self,
        document_id: DocumentId,
        path: PathBuf,
        content: &str,
    ) -> Result<String> {
        ensure_document_size(content.len() as u64)?;
        ensure_draw_document_path(&path)?;

        /*
         * Save As must revalidate and retain the native document handle while
         * producing the new file. If the document was closed after the dialog
         * opened, fail before touching the selected destination.
         *
         * Holding the same write lock used by ordinary CAS saves and close
         * prevents Save, Save As and Close from interleaving for this registry.
         */
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal(
                "document registry write lock poisoned".into(),
            ))?;

        let handle = documents
            .get_mut(&document_id)
            .ok_or_else(|| Error::NotFound(
                "document session does not exist".into(),
            ))?;

        let canonical_content =
            canonicalize_draw_document(content.as_bytes())?;

        atomic_write(&path, canonical_content.as_bytes())?;

        let revision =
            document_revision(canonical_content.as_bytes());

        handle.path = path;
        handle.revision.clone_from(&revision);

        Ok(revision)
    }

    fn save_existing(
        &self,
        document_id: DocumentId,
        expected_revision: &str,
        content: &str,
    ) -> Result<String> {
        ensure_document_size(content.len() as u64)?;

        /*
         * Hold the registry write lock across verification and replacement.
         * This serializes all Canvas save commands for this native handle.
         */
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal(
                "document registry write lock poisoned".into(),
            ))?;

        let handle = documents
            .get_mut(&document_id)
            .ok_or_else(|| Error::NotFound(
                "document session does not exist".into(),
            ))?;

        if handle.revision != expected_revision {
            return Err(Error::FileConflict(
                "renderer document revision is stale".into(),
            ));
        }

        ensure_draw_document_path(&handle.path)?;

        let disk_bytes = match std::fs::read(&handle.path) {
            Ok(bytes) => bytes,
            Err(error)
                if error.kind() == std::io::ErrorKind::NotFound =>
            {
                /*
                 * An opened document disappearing from disk is an external
                 * state change. Recreating it through ordinary Save would
                 * silently discard the deletion decision.
                 */
                return Err(Error::FileConflict(
                    "document was removed outside Canvas".into(),
                ));
            }
            Err(error) => return Err(error.into()),
        };

        ensure_document_size(disk_bytes.len() as u64)?;

        let actual_revision = document_revision(&disk_bytes);

        if actual_revision != expected_revision {
            return Err(Error::FileConflict(
                "document changed outside Canvas".into(),
            ));
        }

        let canonical_content =
            canonicalize_draw_document(content.as_bytes())?;

        atomic_write(
            &handle.path,
            canonical_content.as_bytes(),
        )?;

        let next_revision =
            document_revision(canonical_content.as_bytes());

        handle.revision.clone_from(&next_revision);

        Ok(next_revision)
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
    pub revision: String,
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
    pub expected_revision: String,
    pub content: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSaveResult {
    pub revision: String,
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
    pub revision: String,
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
    let selected = select_open_document(&app).await?;

    let Some(selected) = selected else {
        return Ok(DocumentOpenResponse { document: None });
    };

    let path = selected_native_path(selected)?;
    ensure_draw_document_path(&path)?;

    let (content, revision) = read_document(path.clone()).await?;
    let document_id =
        documents.insert(path.clone(), revision.clone())?;

    Ok(DocumentOpenResponse {
        document: Some(DocumentOpenResult {
            document_id,
            display_name: display_name(&path),
            content,
            revision,
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

    let selected = select_save_document(&app, suggested_name).await?;

    let Some(selected) = selected else {
        return Ok(DocumentSaveAsResult { document: None });
    };

    let path = selected_native_path(selected)?;
    ensure_draw_document_path(&path)?;

    let (document_id, revision) = match request.document_id {
        Some(document_id) => {
            let registry = documents.inner().clone();
            let save_path = path.clone();
            let content = request.content;

            let revision = tokio::task::spawn_blocking(move || {
                registry.save_as_existing(
                    document_id,
                    save_path,
                    &content,
                )
            })
            .await
            .map_err(|_| Error::Internal(
                "document Save As task terminated unexpectedly".into(),
            ))??;

            (document_id, revision)
        }
        None => {
            let revision =
                write_document(path.clone(), request.content).await?;

            let document_id = documents.insert(
                path.clone(),
                revision.clone(),
            )?;

            (document_id, revision)
        }
    };

    Ok(DocumentSaveAsResult {
        document: Some(DocumentDescriptor {
            document_id,
            display_name: display_name(&path),
            revision,
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
) -> DocumentCommandResult<DocumentSaveResult> {
    let registry = documents.inner().clone();

    let revision = tokio::task::spawn_blocking(move || {
        registry.save_existing(
            request.document_id,
            &request.expected_revision,
            &request.content,
        )
    })
    .await
    .map_err(|_| Error::Internal(
        "document CAS save task terminated unexpectedly".into(),
    ))??;

    Ok(DocumentSaveResult { revision })
}

/// Ends the native document session and releases its private file handle.
#[command]
#[specta::specta]
pub fn document_close(
    documents: State<'_, DocumentRegistry>,
    request: DocumentCloseRequest,
) -> DocumentCommandResult<()> {
    Ok(documents.remove(request.document_id)?)
}

async fn select_open_document(app: &AppHandle) -> Result<Option<FilePath>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.dialog()
        .file()
        .add_filter("Hybrid Canvas document", &[DRAW_EXTENSION])
        .pick_file(move |selected| {
            let _ = sender.send(selected);
        });

    receiver
        .await
        .map_err(|_| Error::Internal("document open dialog callback was dropped".into()))
}

async fn select_save_document(
    app: &AppHandle,
    suggested_name: String,
) -> Result<Option<FilePath>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.dialog()
        .file()
        .add_filter("Hybrid Canvas document", &[DRAW_EXTENSION])
        .set_file_name(suggested_name)
        .save_file(move |selected| {
            let _ = sender.send(selected);
        });

    receiver
        .await
        .map_err(|_| Error::Internal("document save dialog callback was dropped".into()))
}

async fn read_document(path: PathBuf) -> Result<(String, String)> {
    let metadata = tokio::fs::metadata(&path).await?;
    ensure_document_size(metadata.len())?;

    let bytes = tokio::fs::read(&path).await?;
    ensure_document_size(bytes.len() as u64)?;

    tokio::task::spawn_blocking(move || {
        let revision = document_revision(&bytes);
        let content = canonicalize_draw_document(&bytes)?;

        Ok((content, revision))
    })
    .await
    .map_err(|_| Error::Internal(
        "document decode task terminated unexpectedly".into(),
    ))?
}

async fn write_document(
    path: PathBuf,
    content: String,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let canonical_content =
            canonicalize_draw_document(content.as_bytes())?;

        atomic_write(&path, canonical_content.as_bytes())?;

        Ok(document_revision(canonical_content.as_bytes()))
    })
    .await
    .map_err(|_| Error::Internal(
        "document save task terminated unexpectedly".into(),
    ))?
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

    fn valid_document(marker: &str) -> String {
        format!(
            r#"{{
                "header": {{
                    "format": "hybrid-canvas/draw",
                    "version": 1,
                    "createdAt": "2026-07-23T00:00:00.000Z"
                }},
                "content": {{
                    "document": {{}},
                    "session": {{}},
                    "marker": "{marker}"
                }}
            }}"#,
        )
    }

    #[test]
    fn registry_keeps_path_private_behind_document_id() {
        let registry = DocumentRegistry::default();
        let path = PathBuf::from("/private/example.draw");

        let document_id = registry.insert(path.clone(), "revision".to_owned()).expect("document should register");

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
            .insert(
                PathBuf::from("/private/example.draw"),
                "revision".to_owned(),
            )
            .expect("document should register");

        registry.remove(document_id).expect("document should close");

        assert!(matches!(registry.path(document_id), Err(Error::NotFound(_))));
    }

    #[test]
    fn rejects_stale_renderer_revision_before_writing() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("stale.draw");
        let original = valid_document("original");

        std::fs::write(&path, &original)
            .expect("fixture should be written");

        let current_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(path.clone(), current_revision)
            .expect("document should register");

        let replacement = valid_document("replacement");

        let result = registry.save_existing(
            document_id,
            "stale-renderer-revision",
            &replacement,
        );

        assert!(matches!(result, Err(Error::FileConflict(_))));
        assert_eq!(
            std::fs::read_to_string(&path)
                .expect("original file should remain readable"),
            original,
        );
    }

    #[test]
    fn rejects_save_when_document_was_removed_externally() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("removed.draw");
        let original = valid_document("original");

        std::fs::write(&path, &original)
            .expect("fixture should be written");

        let current_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(
                path.clone(),
                current_revision.clone(),
            )
            .expect("document should register");

        std::fs::remove_file(&path)
            .expect("external deletion should succeed");

        let replacement = valid_document("replacement");

        let result = registry.save_existing(
            document_id,
            &current_revision,
            &replacement,
        );

        assert!(matches!(result, Err(Error::FileConflict(_))));
        assert!(!path.exists());
    }

    #[test]
    fn successful_save_advances_revision_and_rejects_old_revision() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("advance.draw");
        let original = valid_document("original");

        std::fs::write(&path, &original)
            .expect("fixture should be written");

        let original_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(
                path.clone(),
                original_revision.clone(),
            )
            .expect("document should register");

        let replacement = valid_document("replacement");

        let next_revision = registry
            .save_existing(
                document_id,
                &original_revision,
                &replacement,
            )
            .expect("first CAS save should succeed");

        assert_ne!(next_revision, original_revision);

        let stored_bytes = std::fs::read(&path)
            .expect("saved file should be readable");

        assert_eq!(
            document_revision(&stored_bytes),
            next_revision,
        );

        let second_replacement =
            valid_document("second-replacement");

        let stale_result = registry.save_existing(
            document_id,
            &original_revision,
            &second_replacement,
        );

        assert!(matches!(
            stale_result,
            Err(Error::FileConflict(_)),
        ));

        assert_eq!(
            document_revision(
                &std::fs::read(&path)
                    .expect("saved file should remain readable"),
            ),
            next_revision,
        );
    }

    #[test]
    fn rejects_save_when_disk_revision_changed() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("conflict.draw");
        let original = r#"{"format":"hybrid-canvas/draw","version":1,"content":{}}"#;

        std::fs::write(&path, original)
            .expect("fixture should be written");

        let original_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(path.clone(), original_revision.clone())
            .expect("document should register");

        std::fs::write(&path, b"external change")
            .expect("external edit should be written");

        let result = registry.save_existing(
            document_id,
            &original_revision,
            original,
        );

        assert!(matches!(result, Err(Error::FileConflict(_))));
        assert_eq!(
            std::fs::read(&path).expect("file should remain readable"),
            b"external change",
        );
    }

    #[test]
    fn save_as_unknown_document_does_not_write_destination() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let destination =
            directory.path().join("must-not-exist.draw");
        let content = valid_document("save-as");

        let registry = DocumentRegistry::default();

        let result = registry.save_as_existing(
            DocumentId::new(),
            destination.clone(),
            &content,
        );

        assert!(matches!(result, Err(Error::NotFound(_))));
        assert!(!destination.exists());
    }

    #[test]
    fn save_as_updates_path_and_revision_together() {
        let directory =
            tempfile::tempdir().expect("temporary directory");

        let original_path =
            directory.path().join("original.draw");
        let destination =
            directory.path().join("renamed.draw");

        let original = valid_document("original");

        std::fs::write(&original_path, &original)
            .expect("original document should be written");

        let original_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(
                original_path,
                original_revision.clone(),
            )
            .expect("document should register");

        let replacement = valid_document("replacement");

        let next_revision = registry
            .save_as_existing(
                document_id,
                destination.clone(),
                &replacement,
            )
            .expect("Save As should succeed");

        assert_ne!(next_revision, original_revision);

        assert_eq!(
            registry
                .path(document_id)
                .expect("updated path should resolve"),
            destination,
        );

        let stored_bytes = std::fs::read(
            registry
                .path(document_id)
                .expect("updated path should remain registered"),
        )
        .expect("saved document should be readable");

        assert_eq!(
            document_revision(&stored_bytes),
            next_revision,
        );
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
