#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const mode = process.argv[2]
if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node refactor.mjs --check | --apply')
  process.exit(2)
}

const root = process.cwd()

const paths = {
  document: 'apps/desktop/src-tauri/src/commands/document.rs',
  asset: 'apps/desktop/src-tauri/src/commands/asset.rs',
  cargo: 'apps/desktop/src-tauri/Cargo.toml',
  cargoLock: 'Cargo.lock',
  bindings: 'platforms/desktop-ipc/src/generated/ipc-bindings.ts',
  gateway: 'platforms/desktop-runtime/src/adapters/file/file-system.ts',
  editor: 'editor/core/src/runtime/editor-session.ts',
  service: 'editor/document/src/application/canvas-document-service.ts',
  fileApi: 'editor/persistence/src/public-api.ts',
  domainFile: 'editor/persistence/src/domain/file.ts',
  snapshot: 'editor/persistence/src/application/snapshot-service.ts',
  snapshotTest: 'editor/persistence/src/application/snapshot-service.test.ts',
  lifecycleTest:
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
  registryTest:
    'tests/cross-domain-contract/document-lifecycle/editor-session-registry.test.ts',
}

function abs(path) {
  return resolve(root, path)
}

function read(path) {
  return readFileSync(abs(path), 'utf8')
}

function write(path, content) {
  writeFileSync(abs(path), content.replaceAll('\r\n', '\n'))
}

function removeIfExists(path) {
  if (existsSync(abs(path))) {
    unlinkSync(abs(path))
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  })

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }

  return (result.stdout ?? '').trim()
}

function replaceOnce(source, oldValue, newValue, label) {
  const first = source.indexOf(oldValue)
  if (first < 0) {
    throw new Error(`Expected source fragment was not found: ${label}`)
  }
  if (source.indexOf(oldValue, first + oldValue.length) >= 0) {
    throw new Error(`Unexpected source count: ${label}`)
  }
  return source.slice(0, first) + newValue + source.slice(first + oldValue.length)
}

function replaceRange(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  if (start < 0) {
    throw new Error(`Start marker not found: ${label}`)
  }
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (end < 0) {
    throw new Error(`End marker not found: ${label}`)
  }
  if (source.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`Unexpected start marker count: ${label}`)
  }
  return source.slice(0, start) + replacement + source.slice(end)
}

function replaceTail(source, startMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  if (start < 0) {
    throw new Error(`Tail marker not found: ${label}`)
  }
  if (source.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`Unexpected tail marker count: ${label}`)
  }
  return source.slice(0, start) + replacement
}

function replaceRegexOnce(source, regex, replacement, label) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  const matches = [...source.matchAll(new RegExp(regex.source, flags))]
  if (matches.length === 0) {
    throw new Error(`Expected source fragment was not found: ${label}`)
  }
  if (matches.length > 1) {
    throw new Error(`Unexpected source count: ${label}`)
  }
  return source.replace(regex, replacement)
}

function assertIncludes(source, fragment, label) {
  if (!source.includes(fragment)) {
    throw new Error(`Audited baseline is missing: ${label}`)
  }
}

function backupFiles(filePaths) {
  const backups = new Map()
  const missing = []

  for (const path of filePaths) {
    if (existsSync(abs(path))) {
      backups.set(path, readFileSync(abs(path)))
    } else {
      missing.push(path)
    }
  }

  return { backups, missing }
}

function rollback(snapshot) {
  for (const [path, bytes] of snapshot.backups) {
    writeFileSync(abs(path), bytes)
  }

  for (const path of snapshot.missing) {
    if (existsSync(abs(path))) {
      unlinkSync(abs(path))
    }
  }
}

function isFinalState() {
  if (!existsSync(abs(paths.document))) return false
  if (!existsSync(abs(paths.gateway))) return false
  if (!existsSync(abs(paths.editor))) return false
  if (!existsSync(abs(paths.service))) return false
  if (!existsSync(abs(paths.domainFile))) return false

  const document = read(paths.document)
  const gateway = read(paths.gateway)
  const editor = read(paths.editor)
  const service = read(paths.service)
  const domainFile = read(paths.domainFile)

  return (
    document.includes('encode_draw_document_v2') &&
    document.includes('decode_draw_document_v2') &&
    document.includes('asset_session_token: Option<String>') &&
    gateway.includes('assetPersistenceToken') &&
    editor.includes('readonly initialSnapshot?: TLStoreSnapshot') &&
    service.includes('captureAssetPersistenceToken()') &&
    !editor.includes('captureLegacyEditorSnapshot') &&
    !service.includes('serializeDrawDocument') &&
    !domainFile.includes('TLEditorSnapshot') &&
    !existsSync(abs(paths.snapshot)) &&
    !existsSync(abs(paths.snapshotTest))
  )
}

function validateBaseline() {
  const document = read(paths.document)
  const service = read(paths.service)
  const editor = read(paths.editor)

  assertIncludes(
    document,
    'canonicalize_draw_document(content.as_bytes())',
    'native v1 writer',
  )
  assertIncludes(
    service,
    'serializeDrawDocument(legacyEditorSnapshot)',
    'renderer v1 writer',
  )
  assertIncludes(
    editor,
    'captureLegacyEditorSnapshot',
    'legacy snapshot bridge',
  )
}

function patchDocumentRs() {
  let source = read(paths.document)

  source = replaceOnce(
    source,
    `use crate::error::{Error, IpcError, Result};
use hybrid_canvas_file_native::{
    atomic_write, canonicalize_draw_document, document_revision,
    DocumentRevision,
};`,
    `use crate::asset_protocol::{
    AssetProtocolError, AssetProtocolRegistry, AssetSessionSnapshotEntry,
};
use crate::error::{Error, IpcError, Result};
use hybrid_canvas_file_native::{
    atomic_write, canonicalize_draw_document, decode_draw_document_v2,
    document_revision, encode_draw_document_v2, DocumentRevision,
    DrawAssetInput, DrawDocumentV2Input,
};`,
    'document imports',
  )

  source = replaceOnce(
    source,
    `use std::sync::{Arc, RwLock};`,
    `use std::sync::{Arc, RwLock};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};`,
    'time imports',
  )

  source = replaceOnce(
    source,
    `const MAX_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;`,
    `const MAX_LOGICAL_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;
const MAX_CONTAINER_BYTES: u64 = 320 * 1024 * 1024;`,
    'document size constants',
  )

  source = replaceOnce(
    source,
    `struct DocumentHandle {
    path: PathBuf,
    revision: DocumentRevision,
}`,
    `struct DocumentHandle {
    path: PathBuf,
    revision: DocumentRevision,
    created_at: String,
    asset_session_token: Option<String>,
}`,
    'document handle state',
  )

  source = replaceRange(
    source,
    `impl DocumentRegistry {`,
    `#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentOpenResult`,
    `impl DocumentRegistry {
    fn insert(
        &self,
        path: PathBuf,
        revision: DocumentRevision,
        created_at: String,
        asset_session_token: Option<String>,
    ) -> Result<DocumentId> {
        let document_id = DocumentId::new();
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        documents.insert(
            document_id,
            DocumentHandle {
                path,
                revision,
                created_at,
                asset_session_token,
            },
        );

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
        asset_session_token: Option<String>,
        assets: &[AssetSessionSnapshotEntry],
    ) -> Result<DocumentRevision> {
        ensure_logical_document_size(content.len() as u64)?;
        ensure_draw_document_path(&path)?;

        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        let handle = documents
            .get_mut(&document_id)
            .ok_or_else(|| Error::NotFound("document session does not exist".into()))?;

        validate_asset_session_transition(
            handle.asset_session_token.as_deref(),
            asset_session_token.as_deref(),
        )?;

        let encoded = encode_document(content, &handle.created_at, assets)?;
        atomic_write(&path, &encoded)?;

        let revision = document_revision(&encoded);

        handle.path = path;
        handle.revision.clone_from(&revision);
        handle.asset_session_token = asset_session_token;

        Ok(revision)
    }

    fn save_existing(
        &self,
        document_id: DocumentId,
        expected_revision: &str,
        content: &str,
        asset_session_token: Option<String>,
        assets: &[AssetSessionSnapshotEntry],
    ) -> Result<DocumentRevision> {
        ensure_logical_document_size(content.len() as u64)?;

        let expected_revision = DocumentRevision::parse(expected_revision).ok_or_else(|| {
            Error::Validation("expected revision must be canonical SHA-256".into())
        })?;

        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        let handle = documents
            .get_mut(&document_id)
            .ok_or_else(|| Error::NotFound("document session does not exist".into()))?;

        if handle.revision != expected_revision {
            return Err(Error::FileConflict(
                "renderer document revision is stale".into(),
            ));
        }

        validate_asset_session_transition(
            handle.asset_session_token.as_deref(),
            asset_session_token.as_deref(),
        )?;

        ensure_draw_document_path(&handle.path)?;

        let disk_bytes = match std::fs::read(&handle.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(Error::FileConflict(
                    "document was removed outside Canvas".into(),
                ));
            }
            Err(error) => return Err(error.into()),
        };

        ensure_container_size(disk_bytes.len() as u64)?;

        let actual_revision = document_revision(&disk_bytes);

        if actual_revision != expected_revision {
            return Err(Error::FileConflict(
                "document changed outside Canvas".into(),
            ));
        }

        let encoded = encode_document(content, &handle.created_at, assets)?;
        atomic_write(&handle.path, &encoded)?;

        let next_revision = document_revision(&encoded);

        handle.revision.clone_from(&next_revision);
        handle.asset_session_token = asset_session_token;

        Ok(next_revision)
    }

    fn remove(&self, document_id: DocumentId) -> Result<DocumentHandle> {
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        documents
            .remove(&document_id)
            .ok_or_else(|| Error::NotFound("document session does not exist".into()))
    }

    fn restore(&self, document_id: DocumentId, handle: DocumentHandle) -> Result<()> {
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        documents.insert(document_id, handle);
        Ok(())
    }
}

`,
    'DocumentRegistry implementation',
  )

  source = replaceOnce(
    source,
    `pub struct DocumentOpenResult {
    pub document_id: DocumentId,
    pub display_name: String,
    pub content: String,
    pub revision: String,
}`,
    `pub struct DocumentOpenResult {
    pub document_id: DocumentId,
    pub display_name: String,
    pub content: String,
    pub revision: String,
    pub asset_session_token: Option<String>,
}`,
    'DocumentOpenResult asset token',
  )

  source = replaceOnce(
    source,
    `pub struct DocumentSaveRequest {
    pub document_id: DocumentId,
    pub expected_revision: String,
    pub content: String,
}`,
    `pub struct DocumentSaveRequest {
    pub document_id: DocumentId,
    pub expected_revision: String,
    pub content: String,
    pub asset_session_token: Option<String>,
}`,
    'DocumentSaveRequest asset token',
  )

  source = replaceOnce(
    source,
    `pub struct DocumentSaveAsRequest {
    /// None creates a new native document session.
    ///
    /// Some(document_id) moves the existing session to the newly selected file.
    pub document_id: Option<DocumentId>,
    pub content: String,
    pub suggested_name: Option<String>,
}`,
    `pub struct DocumentSaveAsRequest {
    /// None creates a new native document session.
    ///
    /// Some(document_id) moves the existing session to the newly selected file.
    pub document_id: Option<DocumentId>,
    pub content: String,
    pub asset_session_token: Option<String>,
    pub suggested_name: Option<String>,
}`,
    'DocumentSaveAsRequest asset token',
  )

  source = replaceRange(
    source,
    `/// Opens one .draw file selected by the native file dialog.`,
    `async fn select_open_document(app: &AppHandle) -> Result<Option<FilePath>> {`,
    `/// Opens one .draw file selected by the native file dialog.
///
/// No caller-controlled path is accepted.
#[command]
#[specta::specta]
pub async fn document_open(
    app: AppHandle,
    documents: State<'_, DocumentRegistry>,
    assets: State<'_, AssetProtocolRegistry>,
) -> DocumentCommandResult<DocumentOpenResponse> {
    let selected = select_open_document(&app).await?;

    let Some(selected) = selected else {
        return Ok(DocumentOpenResponse { document: None });
    };

    let path = selected_native_path(selected)?;
    ensure_draw_document_path(&path)?;

    let (decoded, revision) = read_document(path.clone()).await?;

    let asset_session_token = if decoded.assets.is_empty() {
        None
    } else {
        let token = Uuid::now_v7().simple().to_string();

        assets
            .restore_session(&token, decoded.assets)
            .map_err(map_asset_error)?;

        Some(token)
    };

    let document_id = match documents.insert(
        path.clone(),
        revision.clone(),
        decoded.created_at,
        asset_session_token.clone(),
    ) {
        Ok(document_id) => document_id,
        Err(error) => {
            if let Some(token) = &asset_session_token {
                let _ = assets.remove_session(token);
            }

            return Err(error.into());
        }
    };

    Ok(DocumentOpenResponse {
        document: Some(DocumentOpenResult {
            document_id,
            display_name: display_name(&path),
            content: decoded.content,
            revision: revision.into_string(),
            asset_session_token,
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
    assets: State<'_, AssetProtocolRegistry>,
    request: DocumentSaveAsRequest,
) -> DocumentCommandResult<DocumentSaveAsResult> {
    ensure_logical_document_size(request.content.len() as u64)?;

    if let Some(document_id) = request.document_id {
        let _ = documents.path(document_id)?;
    }

    let asset_snapshot = snapshot_assets(&assets, request.asset_session_token.as_deref())?;
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
            let asset_session_token = request.asset_session_token;

            let revision = tokio::task::spawn_blocking(move || {
                registry.save_as_existing(
                    document_id,
                    save_path,
                    &content,
                    asset_session_token,
                    &asset_snapshot,
                )
            })
            .await
            .map_err(|_| Error::Internal("document Save As task terminated unexpectedly".into()))??;

            (document_id, revision)
        }
        None => {
            let created_at = now_timestamp()?;

            let revision = write_document(
                path.clone(),
                request.content,
                created_at.clone(),
                asset_snapshot,
            )
            .await?;

            let document_id = documents.insert(
                path.clone(),
                revision.clone(),
                created_at,
                request.asset_session_token,
            )?;

            (document_id, revision)
        }
    };

    Ok(DocumentSaveAsResult {
        document: Some(DocumentDescriptor {
            document_id,
            display_name: display_name(&path),
            revision: revision.into_string(),
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
    assets: State<'_, AssetProtocolRegistry>,
    request: DocumentSaveRequest,
) -> DocumentCommandResult<DocumentSaveResult> {
    let asset_snapshot = snapshot_assets(&assets, request.asset_session_token.as_deref())?;
    let registry = documents.inner().clone();

    let revision = tokio::task::spawn_blocking(move || {
        registry.save_existing(
            request.document_id,
            &request.expected_revision,
            &request.content,
            request.asset_session_token,
            &asset_snapshot,
        )
    })
    .await
    .map_err(|_| Error::Internal("document CAS save task terminated unexpectedly".into()))??;

    Ok(DocumentSaveResult {
        revision: revision.into_string(),
    })
}

/// Ends the native document session and releases its private file handle.
#[command]
#[specta::specta]
pub fn document_close(
    documents: State<'_, DocumentRegistry>,
    assets: State<'_, AssetProtocolRegistry>,
    request: DocumentCloseRequest,
) -> DocumentCommandResult<()> {
    let handle = documents.remove(request.document_id)?;

    if let Some(token) = &handle.asset_session_token {
        if let Err(error) = assets.remove_session(token) {
            documents.restore(request.document_id, handle)?;
            return Err(map_asset_error(error).into());
        }
    }

    Ok(())
}

`,
    'document commands',
  )

  source = replaceRange(
    source,
    `async fn read_document(
    path: PathBuf,
) -> Result<(String, DocumentRevision)> {`,
    `fn selected_native_path(selected: FilePath) -> Result<PathBuf> {`,
    `struct DecodedDocument {
    content: String,
    created_at: String,
    assets: Vec<AssetSessionSnapshotEntry>,
}

async fn read_document(path: PathBuf) -> Result<(DecodedDocument, DocumentRevision)> {
    let metadata = tokio::fs::metadata(&path).await?;
    ensure_container_size(metadata.len())?;

    let bytes = tokio::fs::read(&path).await?;
    ensure_container_size(bytes.len() as u64)?;

    tokio::task::spawn_blocking(move || {
        let revision = document_revision(&bytes);
        let decoded = decode_document(&bytes)?;
        Ok((decoded, revision))
    })
    .await
    .map_err(|_| Error::Internal("document decode task terminated unexpectedly".into()))?
}

async fn write_document(
    path: PathBuf,
    content: String,
    created_at: String,
    assets: Vec<AssetSessionSnapshotEntry>,
) -> Result<DocumentRevision> {
    tokio::task::spawn_blocking(move || {
        let encoded = encode_document(&content, &created_at, &assets)?;
        atomic_write(&path, &encoded)?;
        Ok(document_revision(&encoded))
    })
    .await
    .map_err(|_| Error::Internal("document save task terminated unexpectedly".into()))?
}

fn decode_document(bytes: &[u8]) -> Result<DecodedDocument> {
    if bytes.starts_with(b"PK\\x03\\x04") {
        let decoded = decode_draw_document_v2(bytes)?;

        let assets = decoded
            .assets
            .into_iter()
            .map(|asset| AssetSessionSnapshotEntry {
                content_hash: asset.content_hash,
                content_type: asset.content_type,
                bytes: Arc::from(asset.bytes),
            })
            .collect::<Vec<_>>();

        return Ok(DecodedDocument {
            content: serde_json::to_string(&decoded.document)?,
            created_at: decoded.created_at,
            assets,
        });
    }

    ensure_logical_document_size(bytes.len() as u64)?;

    let canonical = canonicalize_draw_document(bytes)?;
    let legacy: serde_json::Value = serde_json::from_str(&canonical)?;

    let created_at = legacy
        .get("header")
        .and_then(|header| header.get("createdAt"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| Error::Validation("v1 document has no createdAt".into()))?
        .to_owned();

    let document = legacy
        .get("content")
        .and_then(|content| content.get("document"))
        .filter(|value| value.is_object())
        .ok_or_else(|| Error::Validation("v1 document has no store snapshot".into()))?;

    Ok(DecodedDocument {
        content: serde_json::to_string(document)?,
        created_at,
        assets: Vec::new(),
    })
}

fn encode_document(
    content: &str,
    created_at: &str,
    assets: &[AssetSessionSnapshotEntry],
) -> Result<Vec<u8>> {
    ensure_logical_document_size(content.len() as u64)?;

    let saved_at = now_timestamp()?;

    let asset_inputs = assets
        .iter()
        .map(|asset| DrawAssetInput {
            content_hash: &asset.content_hash,
            content_type: &asset.content_type,
            bytes: asset.bytes.as_ref(),
        })
        .collect::<Vec<_>>();

    Ok(encode_draw_document_v2(DrawDocumentV2Input {
        created_at,
        saved_at: &saved_at,
        document_json: content.as_bytes(),
        application_json: br#"{}"#,
        assets: &asset_inputs,
    })?)
}

fn snapshot_assets(
    assets: &AssetProtocolRegistry,
    token: Option<&str>,
) -> Result<Vec<AssetSessionSnapshotEntry>> {
    match token {
        Some(token) => assets.snapshot_session(token).map_err(map_asset_error),
        None => Ok(Vec::new()),
    }
}

fn validate_asset_session_transition(
    current: Option<&str>,
    next: Option<&str>,
) -> Result<()> {
    if current.is_some() && current != next {
        return Err(Error::Validation(
            "document asset-session capability changed unexpectedly".into(),
        ));
    }

    Ok(())
}

fn map_asset_error(error: AssetProtocolError) -> Error {
    match error {
        AssetProtocolError::NotFound => Error::NotFound("asset session does not exist".into()),
        AssetProtocolError::Internal => Error::Internal("asset registry unavailable".into()),
        _ => Error::Asset("asset registry rejected document resources".into()),
    }
}

fn now_timestamp() -> Result<String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|_| Error::Internal("failed to format document timestamp".into()))
}

`,
    'document io helpers',
  )

  source = source.replaceAll(
    'fn ensure_document_size(size: u64)',
    'fn ensure_logical_document_size(size: u64)',
  )
  source = source.replaceAll(
    'if size <= MAX_DOCUMENT_BYTES',
    'if size <= MAX_LOGICAL_DOCUMENT_BYTES',
  )
  source = source.replaceAll('ensure_document_size(', 'ensure_logical_document_size(')

  source = replaceOnce(
    source,
    `fn ensure_draw_document_path(path: &Path) -> Result<()> {`,
    `fn ensure_container_size(size: u64) -> Result<()> {
    if size <= MAX_CONTAINER_BYTES {
        return Ok(());
    }

    Err(Error::Validation(
        "document container exceeds the supported size limit".into(),
    ))
}

fn ensure_draw_document_path(path: &Path) -> Result<()> {`,
    'container size validator',
  )

  source = replaceTail(
    source,
    `#[cfg(test)]
mod tests {`,
    `#[cfg(test)]
mod tests {
    use super::*;

    fn store_snapshot(marker: &str) -> String {
        serde_json::json!({
            "schema": {},
            "store": { "marker": marker }
        })
        .to_string()
    }

    fn legacy_v1(marker: &str) -> Vec<u8> {
        serde_json::json!({
            "header": {
                "format": "hybrid-canvas/draw",
                "version": 1,
                "createdAt": "2026-07-23T00:00:00.000Z"
            },
            "content": {
                "document": {
                    "schema": {},
                    "store": { "marker": marker }
                },
                "session": {}
            }
        })
        .to_string()
        .into_bytes()
    }

    #[test]
    fn explicitly_migrates_v1_to_document_only_snapshot() {
        let decoded = decode_document(&legacy_v1("legacy"))
            .expect("v1 migration should succeed");

        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&decoded.content)
                .expect("logical snapshot"),
            serde_json::json!({
                "schema": {},
                "store": { "marker": "legacy" }
            }),
        );
        assert!(decoded.assets.is_empty());
    }

    #[test]
    fn canonical_writer_always_emits_v2_zip() {
        let bytes = encode_document(
            &store_snapshot("v2"),
            "2026-07-23T00:00:00.000Z",
            &[],
        )
        .expect("v2 document should encode");

        assert!(bytes.starts_with(b"PK\\x03\\x04"));

        let decoded = decode_draw_document_v2(&bytes)
            .expect("written v2 container should decode");

        assert_eq!(decoded.document["store"]["marker"], "v2");
    }

    #[test]
    fn cas_save_writes_v2_and_advances_revision() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("cas.draw");
        let created_at = "2026-07-23T00:00:00.000Z";

        let original = encode_document(
            &store_snapshot("original"),
            created_at,
            &[],
        )
        .expect("fixture should encode");

        std::fs::write(&path, &original).expect("fixture should write");

        let original_revision = document_revision(&original);
        let registry = DocumentRegistry::default();

        let document_id = registry
            .insert(
                path.clone(),
                original_revision.clone(),
                created_at.to_owned(),
                None,
            )
            .expect("document should register");

        let next_revision = registry
            .save_existing(
                document_id,
                &original_revision,
                &store_snapshot("replacement"),
                None,
                &[],
            )
            .expect("CAS save should succeed");

        assert_ne!(next_revision, original_revision);

        let stored = std::fs::read(path).expect("stored document should read");
        assert!(stored.starts_with(b"PK\\x03\\x04"));
        assert_eq!(document_revision(&stored), next_revision);
    }

    #[test]
    fn cas_rejects_external_change_without_overwriting() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("conflict.draw");
        let created_at = "2026-07-23T00:00:00.000Z";

        let original = encode_document(
            &store_snapshot("original"),
            created_at,
            &[],
        )
        .expect("fixture should encode");

        std::fs::write(&path, &original).expect("fixture should write");

        let original_revision = document_revision(&original);
        let registry = DocumentRegistry::default();

        let document_id = registry
            .insert(
                path.clone(),
                original_revision.clone(),
                created_at.to_owned(),
                None,
            )
            .expect("document should register");

        std::fs::write(&path, b"external change")
            .expect("external edit should write");

        let result = registry.save_existing(
            document_id,
            &original_revision,
            &store_snapshot("replacement"),
            None,
            &[],
        );

        assert!(matches!(result, Err(Error::FileConflict(_))));
        assert_eq!(
            std::fs::read(path).expect("file should remain"),
            b"external change",
        );
    }

    #[test]
    fn suggested_name_never_accepts_path() {
        assert!(normalize_suggested_name(Some("../secret.draw")).is_err());
        assert!(normalize_suggested_name(Some("folder/document.draw")).is_err());
        assert!(normalize_suggested_name(Some("folder\\\\document.draw")).is_err());
    }
}
`,
    'document tests',
  )

  write(paths.document, source)
}

function patchAssetRs() {
  let source = read(paths.asset)

  source = replaceOnce(
    source,
    `    if !removed {
        return Err(Error::NotFound(
            "asset session does not exist".into(),
        )
        .into());
    }

    Ok(())`,
    `    // Document close owns restored asset sessions and may release one
    // before the renderer-side adapter disposes. Close is idempotent here.
    let _ = removed;
    Ok(())`,
    'asset session close idempotence',
  )

  write(paths.asset, source)
}

function patchCargoToml() {
  let source = read(paths.cargo)

  if (!source.includes('time = { version = "0.3", features = ["formatting"] }')) {
    source = replaceOnce(
      source,
      `thiserror.workspace = true`,
      `thiserror.workspace = true
time = { version = "0.3", features = ["formatting"] }`,
      'time dependency',
    )
  }

  write(paths.cargo, source)
}

function patchGatewayTs() {
  let source = read(paths.gateway)

  source = replaceOnce(
    source,
    `export interface OpenedDocument {
  readonly id: DocumentId
  readonly displayName: string
  readonly content: string
  readonly revision: string
}`,
    `export interface OpenedDocument {
  readonly id: DocumentId
  readonly displayName: string
  readonly content: string
  readonly revision: string
  readonly assetPersistenceToken: string | null
}`,
    'OpenedDocument asset token',
  )

  source = replaceOnce(
    source,
    `  readonly saveAs: (
    content: string,
    options?: {`,
    `  readonly saveAs: (
    content: string,
    assetPersistenceToken: string | null,
    options?: {`,
    'saveAs token parameter',
  )

  source = replaceOnce(
    source,
    `  readonly save: (
    documentId: DocumentId,
    expectedRevision: string,
    content: string,
  ) => Promise<{ readonly revision: string }>`,
    `  readonly save: (
    documentId: DocumentId,
    expectedRevision: string,
    content: string,
    assetPersistenceToken: string | null,
  ) => Promise<{ readonly revision: string }>`,
    'save token parameter',
  )

  source = replaceOnce(
    source,
    `        revision: response.document.revision,`,
    `        revision: response.document.revision,
        assetPersistenceToken: response.document.assetSessionToken,`,
    'map open asset token',
  )

  source = replaceOnce(
    source,
    `    async saveAs(content, options) {`,
    `    async saveAs(content, assetPersistenceToken, options) {`,
    'saveAs implementation signature',
  )

  source = replaceOnce(
    source,
    `      const request: DocumentSaveAsRequest = {
        documentId: options?.documentId ?? null,
        content,
        suggestedName: options?.suggestedName ?? null,
      }`,
    `      const request: DocumentSaveAsRequest = {
        documentId: options?.documentId ?? null,
        content,
        assetSessionToken: assetPersistenceToken,
        suggestedName: options?.suggestedName ?? null,
      }`,
    'saveAs request payload',
  )

  source = replaceOnce(
    source,
    `    async save(documentId, expectedRevision, content) {`,
    `    async save(documentId, expectedRevision, content, assetPersistenceToken) {`,
    'save implementation signature',
  )

  source = replaceOnce(
    source,
    `      const request: DocumentSaveRequest = {
        documentId,
        expectedRevision,
        content,
      }`,
    `      const request: DocumentSaveRequest = {
        documentId,
        expectedRevision,
        content,
        assetSessionToken: assetPersistenceToken,
      }`,
    'save request payload',
  )

  write(paths.gateway, source)
}

function patchEditorSessionTs() {
  let source = read(paths.editor)

  source = source.replace('  type TLEditorSnapshot,\n', '')

  source = replaceOnce(
    source,
    `  readonly initialSnapshot?: TLEditorSnapshot`,
    `  readonly initialSnapshot?: TLStoreSnapshot`,
    'initial snapshot type',
  )

  source = replaceOnce(
    source,
    `  readonly getSnapshot: () => TLEditorSnapshot

  /**
   * Explicit document persistence adapter consumed structurally by
   * editor/document's EditorDocumentPort.
   */`,
    `  /**
   * Explicit document persistence adapter consumed structurally by
   * editor/document's EditorDocumentPort.
   */`,
    'remove legacy getSnapshot API',
  )

  source = replaceRange(
    source,
    `  function captureLegacyEditorSnapshot(): TLEditorSnapshot {`,
    `  function createSessionSnapshot(): EditorSessionSnapshot {`,
    ``,
    'remove legacy snapshot function',
  )

  source = replaceOnce(
    source,
    `    getSnapshot: captureLegacyEditorSnapshot,`,
    ``,
    'remove getSnapshot binding',
  )

  source = replaceOnce(
    source,
    `  initialSnapshot: TLEditorSnapshot | undefined,`,
    `  initialSnapshot: TLStoreSnapshot | undefined,`,
    'validated store snapshot type',
  )

  write(paths.editor, source)
}

function patchCanvasDocumentServiceTs() {
  let source = read(paths.service)

  source = replaceOnce(
    source,
    `import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'`,
    `import type { TLStoreSnapshot } from 'tldraw'`,
    'remove v1 file codec import',
  )

  source = replaceOnce(
    source,
    `export interface OpenedNativeDocument {
  readonly id: string
  readonly displayName: string
  readonly content: string
  readonly revision: string
}`,
    `export interface OpenedNativeDocument {
  readonly id: string
  readonly displayName: string
  readonly content: string
  readonly revision: string
  readonly assetPersistenceToken: string | null
}`,
    'OpenedNativeDocument asset token',
  )

  source = replaceOnce(
    source,
    `  readonly save: (
    documentId: string,
    expectedRevision: string,
    content: string,
  ) => Promise<{ readonly revision: string }>`,
    `  readonly save: (
    documentId: string,
    expectedRevision: string,
    content: string,
    assetPersistenceToken: string | null,
  ) => Promise<{ readonly revision: string }>`,
    'DocumentPersistencePort save token',
  )

  source = replaceOnce(
    source,
    `  readonly saveAs: (
    content: string,
    options: {`,
    `  readonly saveAs: (
    content: string,
    assetPersistenceToken: string | null,
    options: {`,
    'DocumentPersistencePort saveAs token',
  )

  source = replaceOnce(
    source,
    `      const editor = await editorSessions.create({
        documentId: canvasId,
        sessionId,
        initialSnapshot,
        extensions,
      })`,
    `      const editor = await editorSessions.create({
        documentId: canvasId,
        sessionId,
        initialSnapshot,
        assetStoreRestore: opened.assetPersistenceToken
          ? { persistenceToken: opened.assetPersistenceToken }
          : undefined,
        extensions,
      })`,
    'restore asset store capability on open',
  )

  source = replaceRegexOnce(
    source,
    /(?:[ \t]*\/\*[\s\S]*?\*\/\n)?[ \t]*const legacyEditorSnapshot = owned\.editor\.getSnapshot\(\)\n[ \t]*const content = serializeDrawDocument\(legacyEditorSnapshot\)\n[ \t]*const currentDocumentId = owned\.document\.getDocumentId\(\)/m,
    `      const content = JSON.stringify(documentSnapshot)
      const assetPersistenceToken =
        await owned.editor.captureAssetPersistenceToken()
      const currentDocumentId = owned.document.getDocumentId()`,
    'replace v1 save bridge',
  )

  source = replaceOnce(
    source,
    `            content,
          )`,
    `            content,
            assetPersistenceToken,
          )`,
    'save existing asset token handoff',
  )

  source = replaceOnce(
    source,
    `        : await persistence.saveAs(content, {
            suggestedName: '未命名画布.draw',
          })`,
    `        : await persistence.saveAs(
            content,
            assetPersistenceToken,
            {
              suggestedName: '未命名画布.draw',
            },
          )`,
    'saveAs asset token handoff',
  )

  source = replaceOnce(
    source,
    `  async function saveExistingDocument(
    documentId: string,
    expectedRevision: string,
    content: string,
  ): Promise<SavedNativeDocument> {`,
    `  async function saveExistingDocument(
    documentId: string,
    expectedRevision: string,
    content: string,
    assetPersistenceToken: string | null,
  ): Promise<SavedNativeDocument> {`,
    'saveExistingDocument signature',
  )

  source = replaceOnce(
    source,
    `    const saved = await persistence.save(
      documentId,
      expectedRevision,
      content,
    )`,
    `    const saved = await persistence.save(
      documentId,
      expectedRevision,
      content,
      assetPersistenceToken,
    )`,
    'saveExistingDocument persistence call',
  )

  source = replaceTail(
    source,
    `function parseEditorSnapshot(json: string):`,
    `function parseEditorSnapshot(json: string): TLStoreSnapshot {
  const parsed: unknown = JSON.parse(json)

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !('schema' in parsed) ||
    !('store' in parsed)
  ) {
    throw new Error('DRAW_INVALID_STORE_SNAPSHOT')
  }

  return parsed as TLStoreSnapshot
}
`,
    'logical store snapshot parser',
  )

  write(paths.service, source)
}

function patchFilePackage() {
  write(
    paths.fileApi,
    `export type { FileReference, FileVersion } from './domain/file'
export type {
  ArchivePayload,
  AtomicDocumentStorage,
  CommitRequest,
  CommitResult,
  ExternalChangeEvent,
  OpenedArchive,
  RecoveryRequest,
  StorageError,
} from './ports/file-system'
`,
  )

  write(
    paths.domainFile,
    `export type FileVersion = number

export interface FileReference {
  readonly id: string
  readonly name: string
}
`,
  )

  removeIfExists(paths.snapshot)
  removeIfExists(paths.snapshotTest)
}

function patchLifecycleTest() {
  write(
    paths.lifecycleTest,
    `import type {
  EditorDocumentEvent,
  EditorSession,
} from '@hybrid-canvas/canvas/application'
import { createCanvasDocumentService } from '@hybrid-canvas/document'
import {
  createTLStore,
  type TLStoreSnapshot,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

function validSnapshot(): TLStoreSnapshot {
  return createTLStore({}).getStoreSnapshot()
}

function snapshot(documentValue: unknown): TLStoreSnapshot {
  void documentValue
  return validSnapshot()
}

function createHarness() {
  let currentSnapshot = snapshot({ shapes: [] })

  const documentListeners = new Set<(event: EditorDocumentEvent) => void>()
  const closeEditorSession = vi
    .fn()
    .mockResolvedValue(undefined)

  const persistence = {
    open: vi.fn(),
    save: vi.fn().mockResolvedValue({
      revision: 'revision-next',
    }),
    saveAs: vi.fn(),
    close: vi.fn(),
  }

  const editor = {
    sessionId: 'editor-session',
    documentId: 'editor-document',

    captureDocument() {
      return currentSnapshot
    },

    captureAssetPersistenceToken() {
      return Promise.resolve(null)
    },

    subscribeDocumentEvents(listener: (event: EditorDocumentEvent) => void) {
      documentListeners.add(listener)

      return () => {
        documentListeners.delete(listener)
      }
    },
  } as unknown as EditorSession

  const service = createCanvasDocumentService({
    editorSessions: {
      create: () => editor,
      close: closeEditorSession,
      dispose: vi.fn().mockResolvedValue(undefined),
    },
    persistence,
    extensions: [],
  })

  return {
    service,
    persistence,
    closeEditorSession,

    ready() {
      for (const listener of documentListeners) {
        listener({ kind: 'ready' })
      }
    },

    change(nextSnapshot: TLStoreSnapshot) {
      currentSnapshot = nextSnapshot

      for (const listener of documentListeners) {
        listener({ kind: 'changed' })
      }
    },
  }
}

describe('Canvas document native-release contract', () => {
  it('releases a clean unsaved canvas without invoking native document_close', async () => {
    const harness = createHarness()
    const opened = await harness.service.create(
      '未命名画布',
    )

    harness.ready()

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.persistence.close).not.toHaveBeenCalled()
    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
    expect(harness.service.getEditorSession(opened.sessionId)).toBeNull()
  })

  it('requires an explicit discard intent for dirty canvases', async () => {
    const harness = createHarness()
    const opened = await harness.service.create(
      '未命名画布',
    )

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }] }))

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'confirmation-required',
    })

    expect(harness.service.getEditorSession(opened.sessionId)).not.toBeNull()

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'discard'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
  })

  it('rejects an unwrapped tldraw snapshot instead of guessing a legacy format', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-unwrapped-snapshot',
      displayName: 'legacy.draw',
      revision: 'revision-current',
      content: JSON.stringify({
        document: {
          shapes: [],
        },
        session: {},
      }),
      assetPersistenceToken: null,
    })

    await expect(harness.service.open()).rejects.toThrow('DRAW_INVALID_STORE_SNAPSHOT')
  })

  it('opens through the native gateway without exposing a filesystem path', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-opened',
      displayName: 'architecture.draw',
      revision: 'revision-current',
      content: JSON.stringify(snapshot({ shapes: [] })),
      assetPersistenceToken: null,
    })

    await expect(harness.service.open()).resolves.toEqual({
      canvasId: expect.any(String),
      sessionId: expect.any(String),
      title: 'architecture.draw',
    })
  })

  it('uses Save As once and retains only an opaque native document ID', async () => {
    const harness = createHarness()
    const opened = await harness.service.create(
      '未命名画布',
    )

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }] }))

    harness.persistence.saveAs.mockResolvedValue({
      id: 'native-document-created',
      displayName: 'untitled.draw',
      revision: 'revision-current',
    })

    await harness.service.save(opened.sessionId)

    expect(harness.persistence.saveAs).toHaveBeenCalledWith(
      expect.any(String),
      null,
      {
        suggestedName: '未命名画布.draw',
      },
    )

    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })
  })

  it('uses native document_save for an opened native document', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-existing',
      displayName: 'existing.draw',
      revision: 'revision-current',
      content: JSON.stringify(snapshot({ shapes: [] })),
      assetPersistenceToken: null,
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }] }))

    await harness.service.save(opened.sessionId)

    expect(harness.persistence.save).toHaveBeenCalledWith(
      'native-document-existing',
      'revision-current',
      expect.any(String),
      null,
    )
  })

  it('advances the owned revision after every successful save', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-revision-advance',
      displayName: 'revision-advance.draw',
      revision: 'revision-current',
      content: JSON.stringify(snapshot({ shapes: [] })),
      assetPersistenceToken: null,
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()

    harness.persistence.save
      .mockResolvedValueOnce({
        revision: 'revision-second',
      })
      .mockResolvedValueOnce({
        revision: 'revision-third',
      })

    await harness.service.save(opened.sessionId)
    await harness.service.save(opened.sessionId)

    expect(harness.persistence.save).toHaveBeenNthCalledWith(
      1,
      'native-document-revision-advance',
      'revision-current',
      expect.any(String),
      null,
    )

    expect(harness.persistence.save).toHaveBeenNthCalledWith(
      2,
      'native-document-revision-advance',
      'revision-second',
      expect.any(String),
      null,
    )

    expect(
      harness.service.getSessionSnapshot(opened.sessionId),
    ).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })
  })

  it('keeps a file-conflict save failed and requires close confirmation', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-conflict',
      displayName: 'conflict.draw',
      revision: 'revision-current',
      content: JSON.stringify(snapshot({ shapes: [] })),
      assetPersistenceToken: null,
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:conflict' }] }))

    const conflict = Object.assign(
      new Error('document save conflict'),
      {
        details: {
          code: 'file-conflict',
          operation: 'file',
          recoverable: true,
        },
      },
    )

    harness.persistence.save.mockRejectedValue(conflict)

    await expect(
      harness.service.save(opened.sessionId),
    ).rejects.toBe(conflict)

    expect(
      harness.service.getSessionSnapshot(opened.sessionId),
    ).toEqual({
      sessionId: opened.sessionId,
      persistence: 'failed',
    })

    await expect(
      harness.service.releaseCanvas(
        opened.sessionId,
        'normal',
      ),
    ).resolves.toEqual({
      kind: 'confirmation-required',
    })

    expect(harness.persistence.close).not.toHaveBeenCalled()
    expect(harness.closeEditorSession).not.toHaveBeenCalled()
  })

  it('settles an active save inside the same release transaction', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-saving',
      displayName: 'saving.draw',
      revision: 'revision-current',
      content: JSON.stringify(snapshot({ shapes: [] })),
      assetPersistenceToken: null,
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }] }))

    let resolveSave

    const pendingSave = new Promise((resolve) => {
      resolveSave = () =>
        resolve({ revision: 'revision-next' })
    })

    harness.persistence.save.mockImplementation(() => pendingSave)

    const saving = harness.service.save(opened.sessionId)
    const releasing = harness.service.releaseCanvas(
      opened.sessionId,
      'discard',
    )

    expect(harness.persistence.close).not.toHaveBeenCalled()

    resolveSave()

    await saving

    await expect(releasing).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.persistence.close).toHaveBeenCalledWith(
      'native-document-saving',
    )
  })

  it('requires confirmation after a save fails before normal close', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-save-failure',
      displayName: 'save-failure.draw',
      revision: 'revision-current',
      content: JSON.stringify(snapshot({ shapes: [] })),
      assetPersistenceToken: null,
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }] }))

    harness.persistence.save.mockRejectedValue(
      new Error('native document_save rejected'),
    )

    await expect(harness.service.save(opened.sessionId)).rejects.toThrow(
      'native document_save rejected',
    )

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'confirmation-required',
    })

    expect(harness.persistence.close).not.toHaveBeenCalled()
    expect(harness.closeEditorSession).not.toHaveBeenCalled()
  })

  it('keeps the editor and document session alive after native release failure', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-release-failure',
      displayName: 'failure.draw',
      revision: 'revision-current',
      content: JSON.stringify(snapshot({ shapes: [] })),
      assetPersistenceToken: null,
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()

    harness.persistence.close.mockRejectedValue(
      Object.assign(new Error('native document_close rejected'), {
        details: {
          code: 'permission-denied',
          recoverable: true,
        },
      }),
    )

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'release-failed',
      failure: {
        code: 'permission-denied',
        recoverable: true,
      },
    })

    expect(harness.closeEditorSession).not.toHaveBeenCalled()
    expect(harness.service.getEditorSession(opened.sessionId)).not.toBeNull()
    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })

    harness.persistence.close.mockResolvedValue(undefined)

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
  })
})
`,
  )
}

function patchRegistryTest() {
  write(
    paths.registryTest,
    `import {
  PersistedSnapshotLoadError,
  createEditorSessionRegistry,
  type EditorAssetStoreSessionFactory,
} from '@hybrid-canvas/canvas/application'
import type {
  TLAssetStore,
  TLStoreSnapshot,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

function invalidPersistedSnapshot(): TLStoreSnapshot {
  return {
    schema: null,
    store: null,
  } as unknown as TLStoreSnapshot
}

function createAssetStoreHarness() {
  const dispose = vi.fn().mockResolvedValue(undefined)

  const getPersistenceToken = vi
    .fn()
    .mockResolvedValue(null)

  const factory: EditorAssetStoreSessionFactory = () => ({
    assets: {
      upload: vi.fn(),
    } as unknown as TLAssetStore,
    getPersistenceToken,
    dispose,
  })

  return {
    factory,
    dispose,
  }
}

describe('EditorSessionRegistry persisted snapshot boundary', () => {
  it('does not register a session when tldraw rejects persisted data', async () => {
    const assets = createAssetStoreHarness()
    const registry = createEditorSessionRegistry(
      assets.factory,
    )
    const sessionId = 'invalid-persisted-session'

    await expect(
      registry.create({
        sessionId,
        documentId: 'invalid-persisted-document',
        initialSnapshot: invalidPersistedSnapshot(),
        extensions: [],
      }),
    ).rejects.toThrow(PersistedSnapshotLoadError)

    expect(registry.get(sessionId)).toBeNull()
    expect(assets.dispose).toHaveBeenCalledTimes(1)
  })

  it('remains usable after a rejected persisted snapshot', async () => {
    const assets = createAssetStoreHarness()
    const registry = createEditorSessionRegistry(
      assets.factory,
    )

    await expect(
      registry.create({
        sessionId: 'rejected-session',
        documentId: 'rejected-document',
        initialSnapshot: invalidPersistedSnapshot(),
        extensions: [],
      }),
    ).rejects.toThrow('DRAW_INVALID_SNAPSHOT')

    expect(registry.get('rejected-session')).toBeNull()

    const valid = await registry.create({
      sessionId: 'valid-session',
      documentId: 'valid-document',
      extensions: [],
    })

    expect(valid.sessionId).toBe('valid-session')
    expect(registry.get('valid-session')).toBe(valid)

    await registry.close('valid-session')

    expect(registry.get('valid-session')).toBeNull()
    expect(assets.dispose).toHaveBeenCalledTimes(2)
  })

  it('binds restored resources and persistence capture to the same session', async () => {
    const persistenceToken =
      'restored-native-session'

    const getPersistenceToken = vi
      .fn()
      .mockResolvedValue(persistenceToken)

    const factory: EditorAssetStoreSessionFactory =
      vi.fn((restore) => ({
        assets: {
          upload: vi.fn(),
        } as unknown as TLAssetStore,
        getPersistenceToken,
        dispose: vi.fn().mockResolvedValue(undefined),
      }))

    const registry =
      createEditorSessionRegistry(factory)

    const session = await registry.create({
      sessionId: 'restored-editor-session',
      documentId: 'restored-document',
      assetStoreRestore: {
        persistenceToken,
      },
      extensions: [],
    })

    expect(factory).toHaveBeenCalledWith({
      persistenceToken,
    })

    await expect(
      session.captureAssetPersistenceToken(),
    ).resolves.toBe(persistenceToken)

    expect(getPersistenceToken)
      .toHaveBeenCalledTimes(1)

    await registry.close(session.sessionId)
  })

  it('waits for owned asset disposal before close settles', async () => {
    let releaseAssetStore = () => {}

    const dispose = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseAssetStore = resolve
        }),
    )

    const registry = createEditorSessionRegistry(() => ({
      assets: {
        upload: vi.fn(),
      } as unknown as TLAssetStore,
      getPersistenceToken: vi
        .fn()
        .mockResolvedValue(null),
      dispose,
    }))

    const session = await registry.create({
      sessionId: 'asset-owned-session',
      documentId: 'asset-owned-document',
      extensions: [],
    })

    const closing = registry.close(session.sessionId)
    let settled = false

    void closing.then(() => {
      settled = true
    })

    await Promise.resolve()

    expect(registry.get(session.sessionId)).toBeNull()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)

    releaseAssetStore()
    await closing

    expect(settled).toBe(true)
  })
})
`,
  )
}

function finalValidate() {
  if (!isFinalState()) {
    throw new Error('Final validation failed: v2 vertical cutover markers are incomplete')
  }

  const document = read(paths.document)
  const editor = read(paths.editor)
  const service = read(paths.service)

  if (document.includes('canonicalize_draw_document(content.as_bytes())')) {
    throw new Error('Obsolete native v1 writer remains')
  }
  if (editor.includes('captureLegacyEditorSnapshot')) {
    throw new Error('Obsolete legacy snapshot bridge remains')
  }
  if (service.includes('serializeDrawDocument')) {
    throw new Error('Obsolete renderer v1 writer remains')
  }
}

function apply() {
  const trackedPaths = Object.values(paths)
  const snapshot = backupFiles(trackedPaths)

  try {
    patchDocumentRs()
    patchAssetRs()
    patchCargoToml()
    patchGatewayTs()
    patchEditorSessionTs()
    patchCanvasDocumentServiceTs()
    patchFilePackage()
    patchLifecycleTest()
    patchRegistryTest()

    run('cargo', ['fmt', '--all'])
    run('cargo', ['run', '-p', 'hybrid-canvas-desktop', '--bin', 'export-ipc-bindings'])
    run('cargo', ['check', '-p', 'hybrid-canvas-desktop', '--all-targets'])

    finalValidate()

    console.log(
      'P0-B.2 applied: v2 ZIP is now the only writer; v1 is an explicit native migration reader; assets participate in open/save/close transactions.',
    )
    console.log(
      'Next: run pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm check:ipc && pnpm tauri dev',
    )
  } catch (error) {
    rollback(snapshot)
    throw error
  }
}

try {
  if (isFinalState()) {
    console.log('P0-B.2 vertical v2 cutover is already applied.')
    process.exit(0)
  }

  validateBaseline()

  if (mode === '--check') {
    console.log(
      'P0-B.2 preflight passed. The repository is ready for the vertical v2 cutover.',
    )
    process.exit(0)
  }

  apply()
} catch (error) {
  console.error(
    `P0-B.2 vertical v2 cutover failed:\n${error instanceof Error ? error.stack : String(error)}`,
  )
  process.exit(1)
}