#!/usr/bin/env node

/**
 * P0-C.2 — Add Native asset session/upload/remove IPC.
 *
 * Required base:
 *   782888a037d9899a4bef9b4c36df3259a12d180b
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
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')
const rootArgument = argv.find(
  (argument) => !argument.startsWith('--'),
)
const root = resolve(rootArgument ?? process.cwd())

if (apply && check) {
  console.error(
    '\nP0-C.2 Native asset IPC failed:\n' +
      'Use either --check or --apply, not both.\n',
  )
  process.exit(1)
}

if (!apply && !check) {
  console.error(
    '\nP0-C.2 Native asset IPC failed:\n' +
      'Missing mode. Use --check or --apply.\n',
  )
  process.exit(1)
}

const paths = {
  packageJson: join(root, 'package.json'),

  cargoToml: join(
    root,
    'apps/desktop/src-tauri/Cargo.toml',
  ),

  assetProtocol: join(
    root,
    'apps/desktop/src-tauri/src/asset_protocol.rs',
  ),

  assetCommand: join(
    root,
    'apps/desktop/src-tauri/src/commands/asset.rs',
  ),

  commandModule: join(
    root,
    'apps/desktop/src-tauri/src/commands/mod.rs',
  ),

  bootstrapApp: join(
    root,
    'apps/desktop/src-tauri/src/bootstrap/app.rs',
  ),

  exportBindings: join(
    root,
    'apps/desktop/src-tauri/src/ipc/export_bindings.rs',
  ),
}

const requiredPaths = [
  paths.packageJson,
  paths.cargoToml,
  paths.assetProtocol,
  paths.commandModule,
  paths.bootstrapApp,
  paths.exportBindings,
]

const assetCommandSource = `//! Native IPC boundary for document-session binary assets.
//!
//! The renderer provides bytes and MIME metadata. Native owns validation,
//! content hashing, opaque delivery identities and protocol registration.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use tauri::State;
use uuid::Uuid;

use crate::asset_protocol::{
    asset_protocol_url, AssetProtocolError, AssetProtocolRegistry,
};
use crate::error::{Error, IpcError, Result};

#[derive(Clone, Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetUploadRequest {
    pub session_token: String,
    pub content_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetSessionResult {
    pub session_token: String,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetUploadResult {
    pub asset_token: String,
    pub content_hash: String,
    pub source: String,
    pub byte_length: u64,
    pub content_type: String,
}

#[derive(Clone, Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetRemoveRequest {
    pub session_token: String,
    pub asset_token: String,
}

#[derive(Clone, Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetSessionCloseRequest {
    pub session_token: String,
}

#[tauri::command]
#[specta::specta]
pub async fn asset_session_open(
    assets: State<'_, AssetProtocolRegistry>,
) -> std::result::Result<AssetSessionResult, IpcError> {
    let session_token = Uuid::now_v7().simple().to_string();

    assets
        .open_session(&session_token)
        .map_err(map_asset_error)?;

    Ok(AssetSessionResult { session_token })
}

#[tauri::command]
#[specta::specta]
pub async fn asset_upload(
    request: AssetUploadRequest,
    assets: State<'_, AssetProtocolRegistry>,
) -> std::result::Result<AssetUploadResult, IpcError> {
    let asset_token = Uuid::now_v7().simple().to_string();
    let byte_length = u64::try_from(request.bytes.len())
        .map_err(|_| Error::Asset("asset length overflow".into()))?;

    let content_hash =
        hex::encode(Sha256::digest(&request.bytes));

    assets
        .insert(
            &request.session_token,
            &asset_token,
            &request.content_type,
            request.bytes,
        )
        .map_err(map_asset_error)?;

    let source = match asset_protocol_url(
        &request.session_token,
        &asset_token,
    ) {
        Ok(source) => source,
        Err(error) => {
            let _ = assets.remove(
                &request.session_token,
                &asset_token,
            );

            return Err(map_asset_error(error));
        }
    };

    Ok(AssetUploadResult {
        asset_token,
        content_hash,
        source,
        byte_length,
        content_type: request.content_type,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn asset_remove(
    request: AssetRemoveRequest,
    assets: State<'_, AssetProtocolRegistry>,
) -> std::result::Result<(), IpcError> {
    let removed = assets
        .remove(
            &request.session_token,
            &request.asset_token,
        )
        .map_err(map_asset_error)?;

    if !removed {
        return Err(Error::NotFound(
            "asset does not exist in session".into(),
        )
        .into());
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn asset_session_close(
    request: AssetSessionCloseRequest,
    assets: State<'_, AssetProtocolRegistry>,
) -> std::result::Result<(), IpcError> {
    let removed = assets
        .remove_session(&request.session_token)
        .map_err(map_asset_error)?;

    if !removed {
        return Err(Error::NotFound(
            "asset session does not exist".into(),
        )
        .into());
    }

    Ok(())
}

fn map_asset_error(error: AssetProtocolError) -> IpcError {
    let error = match error {
        AssetProtocolError::InvalidToken
        | AssetProtocolError::UnsupportedContentType
        | AssetProtocolError::AssetTooLarge => {
            Error::Validation("invalid asset request".into())
        }

        AssetProtocolError::NotFound => {
            Error::NotFound("asset session or asset not found".into())
        }

        AssetProtocolError::RegistryBudgetExceeded
        | AssetProtocolError::DuplicateAsset => {
            Error::Asset("asset registry rejected resource".into())
        }

        AssetProtocolError::Internal => {
            Error::Internal("asset registry unavailable".into())
        }
    };

    error.into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_hash_is_canonical_sha256() {
        let hash = hex::encode(Sha256::digest(b"canvas"));

        assert_eq!(hash.len(), 64);
        assert!(hash.bytes().all(|byte| {
            byte.is_ascii_digit()
                || matches!(byte, b'a'..=b'f')
        }));
    }

    #[test]
    fn asset_errors_do_not_expose_internal_details() {
        let ipc = map_asset_error(
            AssetProtocolError::RegistryBudgetExceeded,
        );

        assert_eq!(ipc.message, "资源处理失败");
    }
}
`

function fail(message) {
  console.error(
    `\nP0-C.2 Native asset IPC failed:\n${message}\n`,
  )
  process.exit(1)
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
        'Refusing an ambiguous or partial modification.',
      ].join('\n'),
    )
  }

  return source.replace(oldText, newText)
}

function updateCargoToml(source) {
  let next = source

  if (!next.includes('hex.workspace = true')) {
    next = replaceOnce(
      next,
      `log.workspace = true
serde.workspace = true`,
      `hex.workspace = true
log.workspace = true
serde.workspace = true`,
      'add hex dependency',
    )
  }

  if (!next.includes('sha2.workspace = true')) {
    next = replaceOnce(
      next,
      `serde_json.workspace = true
thiserror.workspace = true`,
      `serde_json.workspace = true
sha2.workspace = true
thiserror.workspace = true`,
      'add SHA-256 dependency',
    )
  }

  return next
}

function updateAssetProtocol(source) {
  const alreadyApplied =
    source.includes(
      'pub fn open_session(',
    ) &&
    source.includes(
      'let Some(session) = state.sessions.get_mut(session_token)',
    ) &&
    source.includes(
      ') -> Result<bool, AssetProtocolError> {',
    ) &&
    source.includes(
      'host == "hybrid-canvas-asset.localhost"',
    )

  if (alreadyApplied) {
    return source
  }

  let next = source

  next = replaceOnce(
    next,
    `impl AssetProtocolRegistry {
    pub fn insert(`,
    `impl AssetProtocolRegistry {
    pub fn open_session(
        &self,
        session_token: &str,
    ) -> Result<(), AssetProtocolError> {
        validate_token(session_token)?;

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        if state.sessions.contains_key(session_token) {
            return Err(AssetProtocolError::DuplicateAsset);
        }

        state
            .sessions
            .insert(session_token.to_owned(), HashMap::new());

        Ok(())
    }

    pub fn insert(`,
    'add explicit asset session creation',
  )

  next = replaceOnce(
    next,
    `        if state
            .sessions
            .get(session_token)
            .is_some_and(|assets| assets.contains_key(asset_token))
        {
            return Err(AssetProtocolError::DuplicateAsset);
        }

        let next_total = state`,
    `        let session = state
            .sessions
            .get(session_token)
            .ok_or(AssetProtocolError::NotFound)?;

        if session.contains_key(asset_token) {
            return Err(AssetProtocolError::DuplicateAsset);
        }

        let next_total = state`,
    'require an opened session before upload',
  )

  next = replaceOnce(
    next,
    `        state
            .sessions
            .entry(session_token.to_owned())
            .or_default()
            .insert(asset_token.to_owned(), registered);

        state.total_bytes = next_total;`,
    `        state
            .sessions
            .get_mut(session_token)
            .ok_or(AssetProtocolError::NotFound)?
            .insert(asset_token.to_owned(), registered);

        state.total_bytes = next_total;`,
    'insert only into existing session',
  )

  next = replaceOnce(
    next,
    `        let became_empty = session.is_empty();

        if became_empty {
            state.sessions.remove(session_token);
        }

        if let Some(removed) = removed {`,
    `        if let Some(removed) = removed {`,
    'keep empty session alive until explicit close',
  )

  next = replaceOnce(
    next,
    `    pub fn remove_session(
        &self,
        session_token: &str,
    ) -> Result<(), AssetProtocolError> {`,
    `    pub fn remove_session(
        &self,
        session_token: &str,
    ) -> Result<bool, AssetProtocolError> {`,
    'return whether session close removed a session',
  )

  next = replaceOnce(
    next,
    `        if let Some(assets) = state.sessions.remove(session_token) {
            let removed_bytes = assets
                .values()
                .map(|asset| asset.bytes.len())
                .sum::<usize>();

            state.total_bytes =
                state.total_bytes.saturating_sub(removed_bytes);
        }

        Ok(())
    }`,
    `        let Some(assets) = state.sessions.remove(session_token) else {
            return Ok(false);
        };

        let removed_bytes = assets
            .values()
            .map(|asset| asset.bytes.len())
            .sum::<usize>();

        state.total_bytes =
            state.total_bytes.saturating_sub(removed_bytes);

        Ok(true)
    }`,
    'make session close observable',
  )

  /*
   * Tauri custom protocols can arrive in either form:
   *
   *   hybrid-canvas-asset://asset/<session>/<asset>
   *
   * or, after WebView conversion:
   *
   *   http://hybrid-canvas-asset.localhost/asset/<session>/<asset>
   */
  next = replaceOnce(
    next,
    `        let host = uri.host().unwrap_or(ASSET_PROTOCOL_HOST);

        /*
         * On Windows and Android, Tauri may internally rewrite a custom scheme
         * to an HTTP origin. The registered handler still owns the request, but
         * the authority may be either "asset" or the generated localhost host.
         */
        if host != ASSET_PROTOCOL_HOST
            && host != "hybrid-canvas-asset.localhost"
        {
            return Err(AssetProtocolError::InvalidToken);
        }

        let mut components = uri
            .path()
            .split('/')
            .filter(|component| !component.is_empty());

        let session_token = components
            .next()
            .ok_or(AssetProtocolError::InvalidToken)?;

        let asset_token = components
            .next()
            .ok_or(AssetProtocolError::InvalidToken)?;`,
    `        let host = uri.host().unwrap_or(ASSET_PROTOCOL_HOST);

        let mut components = uri
            .path()
            .split('/')
            .filter(|component| !component.is_empty());

        if host == "hybrid-canvas-asset.localhost" {
            if components.next() != Some(ASSET_PROTOCOL_HOST) {
                return Err(AssetProtocolError::InvalidToken);
            }
        } else if host != ASSET_PROTOCOL_HOST {
            return Err(AssetProtocolError::InvalidToken);
        }

        let session_token = components
            .next()
            .ok_or(AssetProtocolError::InvalidToken)?;

        let asset_token = components
            .next()
            .ok_or(AssetProtocolError::InvalidToken)?;`,
    'support Tauri converted custom protocol URL',
  )

  /*
   * Existing protocol tests created assets without opening a session.
   */
  next = next.replaceAll(
    `        registry
            .insert(`,
    `        registry
            .open_session("session-1")
            .expect("session should open");

        registry
            .insert(`,
  )

  next = replaceOnce(
    next,
    `        registry
            .remove_session("session-1")
            .expect("session should be removed");`,
    `        assert!(
            registry
                .remove_session("session-1")
                .expect("session should close")
        );`,
    'update close-session test result',
  )

  if (
    !next.includes('pub fn open_session(') ||
    !next.includes(
      'host == "hybrid-canvas-asset.localhost"',
    )
  ) {
    throw new Error(
      'Native asset session invariants were not installed.',
    )
  }

  return next
}

function updateCommandModule(source) {
  if (source.includes('pub mod asset;')) {
    return source
  }

  return replaceOnce(
    source,
    `pub mod document;`,
    `pub mod asset;
pub mod document;`,
    'register asset command module',
  )
}

function updateBootstrapApp(source) {
  if (
    source.includes(
      'commands::asset::asset_session_open,',
    )
  ) {
    return source
  }

  return replaceOnce(
    source,
    `        .invoke_handler(tauri::generate_handler![
            commands::window::window_get,`,
    `        .invoke_handler(tauri::generate_handler![
            commands::asset::asset_session_open,
            commands::asset::asset_upload,
            commands::asset::asset_remove,
            commands::asset::asset_session_close,
            commands::window::window_get,`,
    'register Native asset commands',
  )
}

function updateExportBindings(source) {
  if (
    source.includes(
      'crate::commands::asset::asset_session_open,',
    )
  ) {
    return source
  }

  let next = source

  next = replaceOnce(
    next,
    `use crate::commands::{
    document::{`,
    `use crate::commands::{
    asset::{
        AssetRemoveRequest, AssetSessionCloseRequest,
        AssetSessionResult, AssetUploadRequest, AssetUploadResult,
    },
    document::{`,
    'import asset IPC DTOs',
  )

  next = replaceOnce(
    next,
    `        .commands(tauri_specta::collect_commands![
            crate::commands::document::document_open,`,
    `        .commands(tauri_specta::collect_commands![
            crate::commands::asset::asset_session_open,
            crate::commands::asset::asset_upload,
            crate::commands::asset::asset_remove,
            crate::commands::asset::asset_session_close,
            crate::commands::document::document_open,`,
    'export asset commands',
  )

  next = replaceOnce(
    next,
    `        ])
        .typ::<DocumentId>()`,
    `        ])
        .typ::<AssetSessionResult>()
        .typ::<AssetUploadRequest>()
        .typ::<AssetUploadResult>()
        .typ::<AssetRemoveRequest>()
        .typ::<AssetSessionCloseRequest>()
        .typ::<DocumentId>()`,
    'export asset DTO types',
  )

  return next
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

  const assetCommandExisted =
    await exists(paths.assetCommand)

  if (assetCommandExisted) {
    const existing = await readFile(
      paths.assetCommand,
      'utf8',
    )

    if (existing !== assetCommandSource) {
      throw new Error(
        'commands/asset.rs already exists with different content.',
      )
    }
  }

  const [
    cargoOriginal,
    protocolOriginal,
    commandModuleOriginal,
    bootstrapOriginal,
    exportOriginal,
  ] = await Promise.all([
    readFile(paths.cargoToml, 'utf8'),
    readFile(paths.assetProtocol, 'utf8'),
    readFile(paths.commandModule, 'utf8'),
    readFile(paths.bootstrapApp, 'utf8'),
    readFile(paths.exportBindings, 'utf8'),
  ])

  const outputs = new Map([
    [paths.assetCommand, assetCommandSource],
    [paths.cargoToml, updateCargoToml(cargoOriginal)],
    [
      paths.assetProtocol,
      updateAssetProtocol(protocolOriginal),
    ],
    [
      paths.commandModule,
      updateCommandModule(commandModuleOriginal),
    ],
    [
      paths.bootstrapApp,
      updateBootstrapApp(bootstrapOriginal),
    ],
    [
      paths.exportBindings,
      updateExportBindings(exportOriginal),
    ],
  ])

  const originals = new Map([
    [paths.cargoToml, cargoOriginal],
    [paths.assetProtocol, protocolOriginal],
    [paths.commandModule, commandModuleOriginal],
    [paths.bootstrapApp, bootstrapOriginal],
    [paths.exportBindings, exportOriginal],
  ])

  const changed = [...outputs].filter(
    ([path, content]) =>
      !originals.has(path) ||
      originals.get(path) !== content,
  )

  if (changed.length === 0) {
    console.log(
      'P0-C.2 Native asset IPC is already applied.',
    )
    return
  }

  console.log('P0-C.2 Native asset IPC files:')

  for (const [path] of changed) {
    console.log(`- ${path.slice(root.length + 1)}`)
  }

  if (check) {
    console.log('')
    console.log('It will:')
    console.log('- create explicit Native asset sessions;')
    console.log('- reject uploads to forged sessions;')
    console.log('- hash uploaded bytes with SHA-256;')
    console.log('- generate opaque Native asset identities;')
    console.log('- expose upload/remove/close IPC commands;')
    console.log(
      '- support Tauri converted custom protocol URLs;',
    )
    console.log(
      '- export all Rust DTOs to generated TypeScript bindings;',
    )
    console.log(
      '- add no Blob URL or Data URL fallback;',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the changes.',
    )
    return
  }

  try {
    for (const [path, content] of outputs) {
      await writeFile(path, content, 'utf8')
    }
  } catch (error) {
    for (const [path, content] of originals) {
      await writeFile(path, content, 'utf8')
    }

    if (!assetCommandExisted) {
      await rm(paths.assetCommand, { force: true })
    }

    throw error
  }

  console.log('')
  console.log('Applied P0-C.2 Native asset IPC.')
  console.log('')
  console.log('Required verification:')
  console.log('  cargo fmt --all')
  console.log(
    '  cargo check --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo test --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo clippy --workspace --all-targets --all-features -- -D warnings',
  )
  console.log('  pnpm generate:ipc')
  console.log('  pnpm check:ipc')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})