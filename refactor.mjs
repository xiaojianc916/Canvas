#!/usr/bin/env node

/**
 * P0-D — Revision/CAS document save cutover.
 *
 * Audited base:
 *   21499af63509293e05b12cd9fda89250b9cc6724
 *
 * This is a direct contract replacement:
 *
 *   open() -> { ..., revision }
 *
 *   save(documentId, expectedRevision, content)
 *     -> verify registry revision
 *     -> verify on-disk SHA-256 revision
 *     -> reject conflict without writing
 *     -> atomic_write
 *     -> return nextRevision
 *
 * There is no revision-less save overload or fallback.
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply D:/xiaojianc/hybrid-canvas
 */

import {
  access,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')
const rootArgument = argv.find(
  (argument) => !argument.startsWith('--'),
)
const root = resolve(rootArgument ?? process.cwd())

if (apply && check) {
  fail('Use either --check or --apply, not both.')
}

if (!apply && !check) {
  fail('Missing mode. Use --check or --apply.')
}

const paths = {
  packageJson: join(root, 'package.json'),
  cargoLock: join(root, 'Cargo.lock'),

  nativeCargo: join(
    root,
    'editor/persistence/native/Cargo.toml',
  ),
  nativeLib: join(
    root,
    'editor/persistence/native/src/lib.rs',
  ),
  revision: join(
    root,
    'editor/persistence/native/src/revision.rs',
  ),

  documentCommand: join(
    root,
    'apps/desktop/src-tauri/src/commands/document.rs',
  ),
  desktopError: join(
    root,
    'apps/desktop/src-tauri/src/error.rs',
  ),

  fileSystem: join(
    root,
    'platforms/desktop-runtime/src/adapters/file/file-system.ts',
  ),
  documentService: join(
    root,
    'editor/document/src/application/canvas-document-service.ts',
  ),

  ipcBindings: join(
    root,
    'platforms/desktop-ipc/src/generated/ipc-bindings.ts',
  ),

  serviceTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
  ),
  rollbackTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/canvas-document-open-rollback.test.ts',
  ),
}

const requiredPaths = [
  paths.packageJson,
  paths.nativeCargo,
  paths.nativeLib,
  paths.documentCommand,
  paths.desktopError,
  paths.fileSystem,
  paths.documentService,
  paths.ipcBindings,
  paths.serviceTest,
  paths.rollbackTest,
]

const revisionSource = `//! Strong content identity for optimistic document concurrency.
//!
//! Revisions are calculated from the exact bytes currently stored on disk.
//! They are opaque outside Native and must never be interpreted as timestamps.

use sha2::{Digest, Sha256};

const SHA256_BYTES: usize = 32;
const SHA256_HEX_LENGTH: usize = SHA256_BYTES * 2;

/// Returns the lowercase SHA-256 identity of an exact byte sequence.
pub fn document_revision(content: &[u8]) -> String {
    let digest = Sha256::digest(content);
    let revision = hex::encode(digest);

    debug_assert_eq!(revision.len(), SHA256_HEX_LENGTH);

    revision
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revision_is_stable_for_identical_bytes() {
        let first = document_revision(b"canvas");
        let second = document_revision(b"canvas");

        assert_eq!(first, second);
        assert_eq!(first.len(), SHA256_HEX_LENGTH);
    }

    #[test]
    fn revision_changes_when_any_byte_changes() {
        assert_ne!(
            document_revision(b"canvas-a"),
            document_revision(b"canvas-b"),
        );
    }

    #[test]
    fn revision_uses_the_exact_stored_bytes() {
        assert_ne!(
            document_revision(b"{\\"value\\":1}"),
            document_revision(b"{ \\"value\\": 1 }"),
        );
    }
}
`

function fail(message) {
  console.error(
    `\nP0-D revision/CAS refactor failed:\n${message}\n`,
  )
  process.exitCode = 1
}

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function count(source, fragment) {
  return source.split(fragment).length - 1
}

function replaceOnce(
  source,
  oldText,
  newText,
  description,
) {
  const occurrences = count(source, oldText)

  if (occurrences !== 1) {
    throw new Error(
      [
        `Unexpected source count: ${description}`,
        'Expected: 1',
        `Actual: ${occurrences}`,
        'Refusing a partial or ambiguous refactor.',
      ].join('\n'),
    )
  }

  return source.replace(oldText, newText)
}

function insertBeforeOnce(
  source,
  marker,
  content,
  description,
) {
  return replaceOnce(
    source,
    marker,
    `${content}${marker}`,
    description,
  )
}

function updateNativeCargo(source) {
  let next = source

  if (!/^sha2\.workspace = true$/m.test(next)) {
    next = replaceOnce(
      next,
      `serde_json.workspace = true
tempfile.workspace = true`,
      `serde_json.workspace = true
tempfile.workspace = true
hex.workspace = true
sha2.workspace = true`,
      'add revision hashing dependencies',
    )
  }

  if (!/^hex\.workspace = true$/m.test(next)) {
    throw new Error(
      'hex workspace dependency was not installed.',
    )
  }

  return next
}

function updateNativeLib(source) {
  let next = source

  if (!next.includes('mod revision;')) {
    next = replaceOnce(
      next,
      `mod document_codec;
mod error;`,
      `mod document_codec;
mod error;
mod revision;`,
      'register native revision module',
    )
  }

  if (
    !next.includes(
      'pub use revision::document_revision;',
    )
  ) {
    next = replaceOnce(
      next,
      `pub use document_codec::canonicalize_draw_document;
pub use error::{Error, Result};`,
      `pub use document_codec::canonicalize_draw_document;
pub use error::{Error, Result};
pub use revision::document_revision;`,
      'export native revision function',
    )
  }

  return next
}

function updateDesktopError(source) {
  let next = source

  if (!next.includes('FileConflict(String)')) {
    next = replaceOnce(
      next,
      `    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Permission denied: {0}")]`,
      `    #[error("Not found: {0}")]
    NotFound(String),

    #[error("File conflict: {0}")]
    FileConflict(String),

    #[error("Permission denied: {0}")]`,
      'add native file-conflict error',
    )
  }

  if (!next.includes('FileConflict,')) {
    next = replaceOnce(
      next,
      `    Validation,
    NotFound,
    PermissionDenied,`,
      `    Validation,
    NotFound,
    FileConflict,
    PermissionDenied,`,
      'add file-conflict IPC code',
    )
  }

  next = replaceOnce(
    next,
    `            Self::NotFound(_) => IpcErrorCode::NotFound,
            Self::PermissionDenied(_) => IpcErrorCode::PermissionDenied,`,
    `            Self::NotFound(_) => IpcErrorCode::NotFound,
            Self::FileConflict(_) => IpcErrorCode::FileConflict,
            Self::PermissionDenied(_) => IpcErrorCode::PermissionDenied,`,
    'map file conflict to IPC code',
  )

  next = replaceOnce(
    next,
    `            Self::Persistence(_) | Self::File(_) | Self::Io(_) => IpcOperation::File,`,
    `            Self::Persistence(_)
            | Self::File(_)
            | Self::FileConflict(_)
            | Self::Io(_) => IpcOperation::File,`,
    'map conflict to file operation',
  )

  next = replaceOnce(
    next,
    `                | Self::File(_)
                | Self::NotFound(_)`,
    `                | Self::File(_)
                | Self::FileConflict(_)
                | Self::NotFound(_)`,
    'mark file conflict recoverable',
  )

  next = replaceOnce(
    next,
    `            Self::NotFound(_) => "请求的资源不存在",
            Self::PermissionDenied(_) => "该操作未获授权",`,
    `            Self::NotFound(_) => "请求的资源不存在",
            Self::FileConflict(_) => "文件已在其他位置被修改",
            Self::PermissionDenied(_) => "该操作未获授权",`,
    'add public conflict message',
  )

  if (
    !next.includes(
      'fn serialized_file_conflict_has_stable_contract()',
    )
  ) {
    next = insertBeforeOnce(
      next,
      `    #[test]
    fn serialized_io_error_does_not_leak_path_or_native_error() {`,
      `    #[test]
    fn serialized_file_conflict_has_stable_contract() {
        let value = serde_json::to_value(Error::FileConflict(
            "private conflict diagnostics".to_owned(),
        ))
        .expect("error should serialize");

        assert_eq!(value["code"], "file-conflict");
        assert_eq!(value["operation"], "file");
        assert_eq!(value["recoverable"], true);
        assert_eq!(value["message"], "文件已在其他位置被修改");
    }

`,
      'add IPC conflict contract test',
    )
  }

  return next
}

function updateDocumentCommand(source) {
  let next = source

  next = replaceOnce(
    next,
    `use hybrid_canvas_file_native::{
    atomic_write, canonicalize_draw_document,
};`,
    `use hybrid_canvas_file_native::{
    atomic_write, canonicalize_draw_document, document_revision,
};`,
    'import document revision',
  )

  next = replaceOnce(
    next,
    `use std::sync::RwLock;`,
    `use std::sync::{Arc, RwLock};`,
    'make document registry clonable for blocking CAS',
  )

  next = replaceOnce(
    next,
    `struct DocumentHandle {
    path: PathBuf,
}`,
    `struct DocumentHandle {
    path: PathBuf,
    revision: String,
}`,
    'store revision in native document handle',
  )

  next = replaceOnce(
    next,
    `#[derive(Debug, Default)]
pub struct DocumentRegistry {
    documents: RwLock<HashMap<DocumentId, DocumentHandle>>,
}`,
    `#[derive(Clone, Debug, Default)]
pub struct DocumentRegistry {
    documents: Arc<RwLock<HashMap<DocumentId, DocumentHandle>>>,
}`,
    'share registry with blocking save task',
  )

  next = replaceOnce(
    next,
    `    fn insert(&self, path: PathBuf) -> Result<DocumentId> {`,
    `    fn insert(&self, path: PathBuf, revision: String) -> Result<DocumentId> {`,
    'require revision on registry insertion',
  )

  next = replaceOnce(
    next,
    `        documents.insert(document_id, DocumentHandle { path });`,
    `        documents.insert(document_id, DocumentHandle { path, revision });`,
    'insert complete native handle',
  )

  next = replaceOnce(
    next,
    `    fn replace_path(&self, document_id: DocumentId, path: PathBuf) -> Result<()> {`,
    `    fn replace_path(
        &self,
        document_id: DocumentId,
        path: PathBuf,
        revision: String,
    ) -> Result<()> {`,
    'replace complete save-as handle',
  )

  next = replaceOnce(
    next,
    `        handle.path = path;
        Ok(())
    }

    fn remove(&self, document_id: DocumentId) -> Result<()> {`,
    `        handle.path = path;
        handle.revision = revision;
        Ok(())
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

        let disk_bytes = std::fs::read(&handle.path)?;
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

    fn remove(&self, document_id: DocumentId) -> Result<()> {`,
    'add serialized compare-and-swap save',
  )

  next = replaceOnce(
    next,
    `pub struct DocumentOpenResult {
    pub document_id: DocumentId,
    pub display_name: String,
    pub content: String,
}`,
    `pub struct DocumentOpenResult {
    pub document_id: DocumentId,
    pub display_name: String,
    pub content: String,
    pub revision: String,
}`,
    'return revision from open',
  )

  next = replaceOnce(
    next,
    `pub struct DocumentSaveRequest {
    pub document_id: DocumentId,
    pub content: String,
}`,
    `pub struct DocumentSaveRequest {
    pub document_id: DocumentId,
    pub expected_revision: String,
    pub content: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSaveResult {
    pub revision: String,
}`,
    'replace revision-less save request',
  )

  next = replaceOnce(
    next,
    `pub struct DocumentDescriptor {
    pub document_id: DocumentId,
    pub display_name: String,
}`,
    `pub struct DocumentDescriptor {
    pub document_id: DocumentId,
    pub display_name: String,
    pub revision: String,
}`,
    'return revision from save-as',
  )

  next = replaceOnce(
    next,
    `    let content = read_document(path.clone()).await?;
    let document_id = documents.insert(path.clone())?;`,
    `    let (content, revision) = read_document(path.clone()).await?;
    let document_id =
        documents.insert(path.clone(), revision.clone())?;`,
    'capture exact disk revision during open',
  )

  next = replaceOnce(
    next,
    `            display_name: display_name(&path),
            content,
        }),`,
    `            display_name: display_name(&path),
            content,
            revision,
        }),`,
    'include open revision',
  )

  next = replaceOnce(
    next,
    `    write_document(path.clone(), request.content).await?;

    let document_id = match request.document_id {
        Some(document_id) => {
            documents.replace_path(document_id, path.clone())?;
            document_id
        }
        None => documents.insert(path.clone())?,
    };`,
    `    let revision =
        write_document(path.clone(), request.content).await?;

    let document_id = match request.document_id {
        Some(document_id) => {
            documents.replace_path(
                document_id,
                path.clone(),
                revision.clone(),
            )?;
            document_id
        }
        None => documents.insert(
            path.clone(),
            revision.clone(),
        )?,
    };`,
    'advance save-as revision',
  )

  next = replaceOnce(
    next,
    `            document_id,
            display_name: display_name(&path),
        }),`,
    `            document_id,
            display_name: display_name(&path),
            revision,
        }),`,
    'return save-as revision',
  )

  next = replaceOnce(
    next,
    `) -> DocumentCommandResult<()> {
    ensure_document_size(request.content.len() as u64)?;

    let path = documents.path(request.document_id)?;
    ensure_draw_document_path(&path)?;

    Ok(write_document(path, request.content).await?)
}`,
    `) -> DocumentCommandResult<DocumentSaveResult> {
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
}`,
    'replace native save with CAS',
  )

  next = replaceOnce(
    next,
    `async fn read_document(path: PathBuf) -> Result<String> {`,
    `async fn read_document(path: PathBuf) -> Result<(String, String)> {`,
    'return revision from native read',
  )

  next = replaceOnce(
    next,
    `    tokio::task::spawn_blocking(move || canonicalize_draw_document(&bytes))
        .await
        .map_err(|_| Error::Internal("document decode task terminated unexpectedly".into()))?
        .map_err(Error::from)
}`,
    `    tokio::task::spawn_blocking(move || {
        let revision = document_revision(&bytes);
        let content = canonicalize_draw_document(&bytes)?;

        Ok((content, revision))
    })
    .await
    .map_err(|_| Error::Internal(
        "document decode task terminated unexpectedly".into(),
    ))?
}`,
    'calculate revision from exact opened bytes',
  )

  next = replaceOnce(
    next,
    `async fn write_document(path: PathBuf, content: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let canonical_content = canonicalize_draw_document(content.as_bytes())?;

        atomic_write(path, canonical_content.as_bytes())
    })
    .await
    .map_err(|_| Error::Internal("document save task terminated unexpectedly".into()))?
    .map_err(Error::from)
}`,
    `async fn write_document(
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
}`,
    'return next revision after save-as',
  )

  next = next.replaceAll(
    'registry.insert(path.clone())',
    'registry.insert(path.clone(), "revision".to_owned())',
  )

  next = next.replace(
    `let document_id = registry
            .insert(PathBuf::from("/private/example.draw"))`,
    `let document_id = registry
            .insert(
                PathBuf::from("/private/example.draw"),
                "revision".to_owned(),
            )`,
  )

  if (
    !next.includes(
      'fn rejects_save_when_disk_revision_changed()',
    )
  ) {
    next = insertBeforeOnce(
      next,
      `    #[test]
    fn suggested_name_never_accepts_a_path() {`,
      `    #[test]
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

`,
      'add external conflict regression test',
    )
  }

  return next
}

function updateFileSystem(source) {
  let next = source

  next = replaceOnce(
    next,
    `  type DocumentSaveRequest,`,
    `  type DocumentSaveRequest,
  type DocumentSaveResult,`,
    'import generated save result',
  )

  next = replaceOnce(
    next,
    `  readonly content: string
}`,
    `  readonly content: string
  readonly revision: string
}`,
    'expose opened revision',
  )

  next = replaceOnce(
    next,
    `  ) => Promise<{ readonly id: DocumentId; readonly displayName: string } | null>

  readonly save: (documentId: DocumentId, content: string) => Promise<void>`,
    `  ) => Promise<{
    readonly id: DocumentId
    readonly displayName: string
    readonly revision: string
  } | null>

  readonly save: (
    documentId: DocumentId,
    expectedRevision: string,
    content: string,
  ) => Promise<{ readonly revision: string }>`,
    'replace desktop persistence contract',
  )

  next = replaceOnce(
    next,
    `): { readonly id: DocumentId; readonly displayName: string } {`,
    `): {
  readonly id: DocumentId
  readonly displayName: string
  readonly revision: string
} {`,
    'return descriptor revision',
  )

  next = replaceOnce(
    next,
    `    displayName: descriptor.displayName,
  }`,
    `    displayName: descriptor.displayName,
    revision: descriptor.revision,
  }`,
    'map descriptor revision',
  )

  next = replaceOnce(
    next,
    `        content: response.document.content,
      }`,
    `        content: response.document.content,
        revision: response.document.revision,
      }`,
    'map open revision',
  )

  next = replaceOnce(
    next,
    `    async save(documentId, content) {
      const request: DocumentSaveRequest = {
        documentId,
        content,
      }

      await invokeDocumentCommand(() => commands.documentSave(request))
    },`,
    `    async save(documentId, expectedRevision, content) {
      const request: DocumentSaveRequest = {
        documentId,
        expectedRevision,
        content,
      }

      const response: DocumentSaveResult =
        await invokeDocumentCommand(() =>
          commands.documentSave(request),
        )

      return {
        revision: response.revision,
      }
    },`,
    'remove revision-less adapter save',
  )

  return next
}

function updateDocumentService(source) {
  let next = source

  next = replaceOnce(
    next,
    `export interface OpenedNativeDocument {
  readonly id: string
  readonly displayName: string
  readonly content: string
}`,
    `export interface OpenedNativeDocument {
  readonly id: string
  readonly displayName: string
  readonly content: string
  readonly revision: string
}`,
    'add opened native revision',
  )

  next = replaceOnce(
    next,
    `export interface SavedNativeDocument {
  readonly id: string
  readonly displayName: string
}`,
    `export interface SavedNativeDocument {
  readonly id: string
  readonly displayName: string
  readonly revision: string
}`,
    'add saved native revision',
  )

  next = replaceOnce(
    next,
    `  readonly save: (documentId: string, content: string) => Promise<void>`,
    `  readonly save: (
    documentId: string,
    expectedRevision: string,
    content: string,
  ) => Promise<{ readonly revision: string }>`,
    'replace persistence save port',
  )

  next = replaceOnce(
    next,
    `  saveOperation: Promise<void> | null
}`,
    `  saveOperation: Promise<void> | null
  revision: string | null
}`,
    'store one owned revision',
  )

  next = replaceOnce(
    next,
    `sessions.set(sessionId, createOwnedSession(editor, null))`,
    `sessions.set(
      sessionId,
      createOwnedSession(editor, null, null),
    )`,
    'initialize unsaved session without revision',
  )

  next = replaceOnce(
    next,
    `sessions.set(sessionId, createOwnedSession(editor, opened.id))`,
    `sessions.set(
        sessionId,
        createOwnedSession(
          editor,
          opened.id,
          opened.revision,
        ),
      )`,
    'retain revision from open',
  )

  next = replaceOnce(
    next,
    `  function createOwnedSession(
    editor: EditorSession,
    documentId: string | null,
  ): OwnedCanvasSession {`,
    `  function createOwnedSession(
    editor: EditorSession,
    documentId: string | null,
    revision: string | null,
  ): OwnedCanvasSession {`,
    'accept owned revision',
  )

  next = replaceOnce(
    next,
    `      saveOperation: null,
    }`,
    `      saveOperation: null,
      revision,
    }`,
    'initialize owned revision',
  )

  next = replaceOnce(
    next,
    `      const saved = currentDocumentId
        ? await saveExistingDocument(currentDocumentId, content)
        : await persistence.saveAs(content, {`,
    `      const saved = currentDocumentId
        ? await saveExistingDocument(
            currentDocumentId,
            requireRevision(owned),
            content,
          )
        : await persistence.saveAs(content, {`,
    'send expected revision on existing save',
  )

  next = replaceOnce(
    next,
    `      owned.document.completeSave(ticket, saved.id)
      emit()`,
    `      owned.revision = saved.revision
      owned.document.completeSave(ticket, saved.id)
      emit()`,
    'advance revision only after successful save',
  )

  next = replaceOnce(
    next,
    `  async function saveExistingDocument(
    documentId: string,
    content: string,
  ): Promise<SavedNativeDocument> {
    await persistence.save(documentId, content)

    return {
      id: documentId,
      displayName: '',
    }
  }`,
    `  function requireRevision(
    owned: OwnedCanvasSession,
  ): string {
    if (!owned.revision) {
      throw new Error('DOCUMENT_REVISION_MISSING')
    }

    return owned.revision
  }

  async function saveExistingDocument(
    documentId: string,
    expectedRevision: string,
    content: string,
  ): Promise<SavedNativeDocument> {
    const saved = await persistence.save(
      documentId,
      expectedRevision,
      content,
    )

    return {
      id: documentId,
      displayName: '',
      revision: saved.revision,
    }
  }`,
    'replace revision-less application save helper',
  )

  return next
}

function updateTestRevisions(source) {
  let next = source

  /*
   * Every mocked native descriptor/open result now needs a revision. Add one
   * only where id is immediately followed by displayName.
   */
  next = next.replace(
    /^(\s*)id: ([^,\n]+),\n\1displayName:/gm,
    `$1id: $2,
$1displayName:`,
  )

  next = next.replace(
    /^(\s*)displayName: ([^,\n]+),\n(\s*)content:/gm,
    `$1displayName: $2,
$1revision: 'revision-current',
$3content:`,
  )

  /*
   * Save-As descriptors do not contain content.
   */
  next = next.replace(
    /^(\s*)displayName: ([^,\n]+),\n(\s*)\}\)$/gm,
    `$1displayName: $2,
$1revision: 'revision-current',
$3})`,
  )

  next = next.replace(
    /^(\s*)displayName: ([^,\n]+),\n(\s*)\}$/gm,
    `$1displayName: $2,
$1revision: 'revision-current',
$3}`,
  )

  next = next.replace(
    `    save: vi.fn(),`,
    `    save: vi.fn().mockResolvedValue({
      revision: 'revision-next',
    }),`,
  )

  next = next.replace(
    `      'native-document-existing',
      expect.any(String),`,
    `      'native-document-existing',
      'revision-current',
      expect.any(String),`,
  )

  next = next.replace(
    `    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve
    })`,
    `    const pendingSave = new Promise<{
      readonly revision: string
    }>((resolve) => {
      resolveSave = () =>
        resolve({ revision: 'revision-next' })
    })`,
  )

  next = next.replace(
    `    let resolveSave!: () => void`,
    `    let resolveSave!: () => void`,
  )

  return next
}

async function run(command, args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.once('error', rejectPromise)

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} failed ` +
            `(code=${String(code)}, signal=${String(signal)})`,
        ),
      )
    })
  })
}

async function main() {
  for (const path of requiredPaths) {
    if (!(await exists(path))) {
      throw new Error(`Required file was not found: ${path}`)
    }
  }

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected package name: ${String(packageJson.name)}`,
    )
  }

  const revisionAlreadyExists = await exists(paths.revision)

  if (revisionAlreadyExists) {
    const existing = await readFile(paths.revision, 'utf8')

    if (existing !== revisionSource) {
      throw new Error(
        'revision.rs already exists with unaudited content.',
      )
    }
  }

  const sourcePaths = [
    paths.nativeCargo,
    paths.nativeLib,
    paths.documentCommand,
    paths.desktopError,
    paths.fileSystem,
    paths.documentService,
    paths.ipcBindings,
    paths.serviceTest,
    paths.rollbackTest,
  ]

  if (await exists(paths.cargoLock)) {
    sourcePaths.push(paths.cargoLock)
  }

  const originals = new Map()

  for (const path of sourcePaths) {
    originals.set(path, await readFile(path, 'utf8'))
  }

  const outputs = new Map([
    [
      paths.nativeCargo,
      updateNativeCargo(originals.get(paths.nativeCargo)),
    ],
    [
      paths.nativeLib,
      updateNativeLib(originals.get(paths.nativeLib)),
    ],
    [paths.revision, revisionSource],
    [
      paths.desktopError,
      updateDesktopError(
        originals.get(paths.desktopError),
      ),
    ],
    [
      paths.documentCommand,
      updateDocumentCommand(
        originals.get(paths.documentCommand),
      ),
    ],
    [
      paths.fileSystem,
      updateFileSystem(originals.get(paths.fileSystem)),
    ],
    [
      paths.documentService,
      updateDocumentService(
        originals.get(paths.documentService),
      ),
    ],
    [
      paths.serviceTest,
      updateTestRevisions(
        originals.get(paths.serviceTest),
      ),
    ],
    [
      paths.rollbackTest,
      updateTestRevisions(
        originals.get(paths.rollbackTest),
      ),
    ],
  ])

  const changed = [...outputs].filter(
    ([path, content]) =>
      !originals.has(path) ||
      originals.get(path) !== content,
  )

  if (changed.length === 0) {
    console.log(
      'P0-D revision/CAS cutover is already applied.',
    )
    return
  }

  console.log('P0-D revision/CAS files:')
  for (const [path] of changed) {
    console.log(`- ${path.slice(root.length + 1)}`)
  }

  if (check) {
    console.log('')
    console.log(
      'Revision/CAS cutover is safe to start from this source state.',
    )
    console.log(
      'Run again with --apply to write and regenerate IPC bindings.',
    )
    return
  }

  try {
    for (const [path, content] of outputs) {
      await writeFile(path, content, 'utf8')
    }

    await run('pnpm', ['generate:ipc'])

    console.log('')
    console.log(
      'Applied the revision/CAS document save cutover.',
    )
  } catch (error) {
    console.error(
      '\nApply failed. Restoring original files...',
    )

    for (const [path, content] of originals) {
      await writeFile(path, content, 'utf8')
    }

    if (!revisionAlreadyExists) {
      await rm(paths.revision, { force: true })
    }

    throw error
  }

  console.log('')
  console.log('Required verification:')
  console.log('  pnpm format')
  console.log('  pnpm check:ipc')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  cargo fmt --all')
  console.log(
    '  cargo check --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo test --workspace --all-features',
  )
  console.log(
    '  cargo clippy --workspace --all-targets --all-features -- -D warnings',
  )
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})