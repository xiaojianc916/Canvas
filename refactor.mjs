#!/usr/bin/env node

/**
 * P0-C.6.1 — Content-addressed Native asset registry.
 *
 * Required base:
 *   fffbbcc50d846d978f81a633ca622ef28e90214d
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --check D:\path\to\hybrid-canvas
 */

import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')

const unknownOptions = argv.filter(
  (argument) =>
    argument.startsWith('--') &&
    argument !== '--apply' &&
    argument !== '--check',
)

const rootArguments = argv.filter(
  (argument) => !argument.startsWith('--'),
)

function fail(message) {
  console.error(
    `\nP0-C.6.1 content-addressed asset registry failed:\n${message}\n`,
  )
  process.exit(1)
}

if (unknownOptions.length > 0) {
  fail(`Unknown option: ${unknownOptions.join(', ')}`)
}

if (rootArguments.length > 1) {
  fail('Only one optional repository root is accepted.')
}

if (apply && check) {
  fail('Use either --check or --apply, not both.')
}

if (!apply && !check) {
  fail('Missing mode. Use --check or --apply.')
}

const root = resolve(rootArguments[0] ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),

  assetProtocol: join(
    root,
    'apps/desktop/src-tauri/src/asset_protocol.rs',
  ),

  assetCommands: join(
    root,
    'apps/desktop/src-tauri/src/commands/asset.rs',
  ),

  nativeAssetAdapter: join(
    root,
    'platforms/desktop-runtime/src/adapters/assets/native-tl-asset-store.ts',
  ),
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

function replaceExact(
  source,
  baseline,
  final,
  description,
) {
  if (source.includes(final)) {
    return source
  }

  const occurrences = count(source, baseline)

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

  return source.replace(baseline, final)
}

function updateAssetProtocol(source) {
  if (
    source.includes(
      'pub fn snapshot_session(',
    ) &&
    source.includes(
      'references: u32',
    ) &&
    source.includes(
      'validate_content_hash(content_hash)?;',
    )
  ) {
    return source
  }

  let result = source

  result = replaceExact(
    result,
    `#[derive(Clone, Debug)]
struct RegisteredAsset {
    bytes: Arc<[u8]>,
    content_type: String,
}

#[derive(Debug, Default)]
struct RegistryState {`,
    `#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetSessionSnapshotEntry {
    pub content_hash: String,
    pub content_type: String,
    pub bytes: Arc<[u8]>,
}

#[derive(Clone, Debug)]
struct RegisteredAsset {
    bytes: Arc<[u8]>,
    content_type: String,
    references: u32,
}

#[derive(Debug, Default)]
struct RegistryState {`,
    'declare durable asset snapshot and reference count',
  )

  result = replaceExact(
    result,
    `pub enum AssetProtocolError {
    InvalidToken,
    UnsupportedContentType,
    AssetTooLarge,
    RegistryBudgetExceeded,
    DuplicateAsset,
    NotFound,
    Internal,
}`,
    `pub enum AssetProtocolError {
    InvalidToken,
    InvalidContentHash,
    UnsupportedContentType,
    AssetTooLarge,
    RegistryBudgetExceeded,
    DuplicateAsset,
    ReferenceOverflow,
    NotFound,
    Internal,
}`,
    'extend asset registry errors',
  )

  const oldInsert = `    pub fn insert(
        &self,
        session_token: &str,
        asset_token: &str,
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<(), AssetProtocolError> {
        validate_token(session_token)?;
        validate_token(asset_token)?;
        validate_content_type(content_type)?;

        if bytes.len() > MAX_ASSET_BYTES {
            return Err(AssetProtocolError::AssetTooLarge);
        }

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        let session = state
            .sessions
            .get(session_token)
            .ok_or(AssetProtocolError::NotFound)?;

        if session.contains_key(asset_token) {
            return Err(AssetProtocolError::DuplicateAsset);
        }

        let next_total = state
            .total_bytes
            .checked_add(bytes.len())
            .ok_or(AssetProtocolError::RegistryBudgetExceeded)?;

        if next_total > MAX_REGISTRY_BYTES {
            return Err(AssetProtocolError::RegistryBudgetExceeded);
        }

        let registered = RegisteredAsset {
            bytes: Arc::from(bytes),
            content_type: content_type.to_owned(),
        };

        state
            .sessions
            .get_mut(session_token)
            .ok_or(AssetProtocolError::NotFound)?
            .insert(asset_token.to_owned(), registered);

        state.total_bytes = next_total;

        Ok(())
    }`

  const finalInsert = `    pub fn insert(
        &self,
        session_token: &str,
        asset_token: &str,
        content_hash: &str,
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<(), AssetProtocolError> {
        validate_token(session_token)?;
        validate_token(asset_token)?;
        validate_content_hash(content_hash)?;
        validate_content_type(content_type)?;

        /*
         * Runtime asset identity is the canonical lowercase SHA-256 digest.
         * Session tokens remain opaque, but asset tokens are deliberately
         * content-addressed so the same binary has one Native identity.
         */
        if asset_token != content_hash {
            return Err(AssetProtocolError::InvalidContentHash);
        }

        if bytes.len() > MAX_ASSET_BYTES {
            return Err(AssetProtocolError::AssetTooLarge);
        }

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        let session = state
            .sessions
            .get_mut(session_token)
            .ok_or(AssetProtocolError::NotFound)?;

        if let Some(existing) = session.get_mut(asset_token) {
            if existing.content_type != content_type
                || existing.bytes.as_ref() != bytes.as_slice()
            {
                /*
                 * A SHA-256 identity must never resolve to different bytes or
                 * metadata within one session.
                 */
                return Err(AssetProtocolError::DuplicateAsset);
            }

            existing.references = existing
                .references
                .checked_add(1)
                .ok_or(AssetProtocolError::ReferenceOverflow)?;

            return Ok(());
        }

        let next_total = state
            .total_bytes
            .checked_add(bytes.len())
            .ok_or(AssetProtocolError::RegistryBudgetExceeded)?;

        if next_total > MAX_REGISTRY_BYTES {
            return Err(AssetProtocolError::RegistryBudgetExceeded);
        }

        let registered = RegisteredAsset {
            bytes: Arc::from(bytes),
            content_type: content_type.to_owned(),
            references: 1,
        };

        state
            .sessions
            .get_mut(session_token)
            .ok_or(AssetProtocolError::NotFound)?
            .insert(asset_token.to_owned(), registered);

        state.total_bytes = next_total;

        Ok(())
    }`

  result = replaceExact(
    result,
    oldInsert,
    finalInsert,
    'replace asset insertion with content addressing',
  )

  const oldRemove = `    pub fn remove(
        &self,
        session_token: &str,
        asset_token: &str,
    ) -> Result<bool, AssetProtocolError> {
        validate_token(session_token)?;
        validate_token(asset_token)?;

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        let Some(session) = state.sessions.get_mut(session_token) else {
            return Ok(false);
        };

        let removed = session.remove(asset_token);

        if let Some(removed) = removed {
            state.total_bytes = state
                .total_bytes
                .saturating_sub(removed.bytes.len());

            return Ok(true);
        }

        Ok(false)
    }`

  const finalRemove = `    pub fn remove(
        &self,
        session_token: &str,
        asset_token: &str,
    ) -> Result<bool, AssetProtocolError> {
        validate_token(session_token)?;
        validate_token(asset_token)?;

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        let Some(session) = state.sessions.get_mut(session_token) else {
            return Ok(false);
        };

        let Some(asset) = session.get_mut(asset_token) else {
            return Ok(false);
        };

        if asset.references > 1 {
            asset.references -= 1;
            return Ok(true);
        }

        let removed = session
            .remove(asset_token)
            .ok_or(AssetProtocolError::Internal)?;

        state.total_bytes = state
            .total_bytes
            .saturating_sub(removed.bytes.len());

        Ok(true)
    }`

  result = replaceExact(
    result,
    oldRemove,
    finalRemove,
    'make asset removal reference-counted',
  )

  result = replaceExact(
    result,
    `    pub fn contains(
        &self,
        session_token: &str,
        asset_token: &str,
    ) -> Result<bool, AssetProtocolError> {`,
    `    pub fn snapshot_session(
        &self,
        session_token: &str,
    ) -> Result<Vec<AssetSessionSnapshotEntry>, AssetProtocolError> {
        validate_token(session_token)?;

        let state = self
            .state
            .read()
            .map_err(|_| AssetProtocolError::Internal)?;

        let session = state
            .sessions
            .get(session_token)
            .ok_or(AssetProtocolError::NotFound)?;

        let mut snapshot = session
            .iter()
            .map(|(content_hash, asset)| {
                AssetSessionSnapshotEntry {
                    content_hash: content_hash.clone(),
                    content_type: asset.content_type.clone(),
                    bytes: Arc::clone(&asset.bytes),
                }
            })
            .collect::<Vec<_>>();

        /*
         * Hash ordering makes the handoff deterministic for the v2 ZIP writer
         * regardless of HashMap iteration order.
         */
        snapshot.sort_unstable_by(|left, right| {
            left.content_hash.cmp(&right.content_hash)
        });

        Ok(snapshot)
    }

    pub fn contains(
        &self,
        session_token: &str,
        asset_token: &str,
    ) -> Result<bool, AssetProtocolError> {`,
    'add deterministic Native session snapshot',
  )

  result = replaceExact(
    result,
    `                AssetProtocolError::InvalidToken
                | AssetProtocolError::UnsupportedContentType
                | AssetProtocolError::AssetTooLarge
                | AssetProtocolError::RegistryBudgetExceeded
                | AssetProtocolError::DuplicateAsset,`,
    `                AssetProtocolError::InvalidToken
                | AssetProtocolError::InvalidContentHash
                | AssetProtocolError::UnsupportedContentType
                | AssetProtocolError::AssetTooLarge
                | AssetProtocolError::RegistryBudgetExceeded
                | AssetProtocolError::DuplicateAsset
                | AssetProtocolError::ReferenceOverflow,`,
    'map new registry errors to protocol response',
  )

  result = replaceExact(
    result,
    `fn validate_content_type(
    content_type: &str,
) -> Result<(), AssetProtocolError> {`,
    `fn validate_content_hash(
    content_hash: &str,
) -> Result<(), AssetProtocolError> {
    if content_hash.len() != 64
        || !content_hash.bytes().all(|byte| {
            byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')
        })
    {
        return Err(AssetProtocolError::InvalidContentHash);
    }

    Ok(())
}

fn validate_content_type(
    content_type: &str,
) -> Result<(), AssetProtocolError> {`,
    'validate canonical SHA-256 identity',
  )

  const testsStart = result.indexOf('#[cfg(test)]')

  if (testsStart < 0) {
    throw new Error(
      'asset_protocol.rs test module was not found.',
    )
  }

  const finalTests = `#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn request(uri: &str) -> Request<()> {
        Request::builder()
            .uri(uri)
            .body(())
            .expect("request should be valid")
    }

    fn hash(bytes: &[u8]) -> String {
        hex::encode(Sha256::digest(bytes))
    }

    fn insert(
        registry: &AssetProtocolRegistry,
        session: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> String {
        let content_hash = hash(bytes);

        registry
            .insert(
                session,
                &content_hash,
                &content_hash,
                content_type,
                bytes.to_vec(),
            )
            .expect("asset should register");

        content_hash
    }

    #[test]
    fn serves_content_addressed_asset_without_exposing_a_path() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        let asset = insert(
            &registry,
            "session-1",
            "image/png",
            &[1, 2, 3, 4],
        );

        let response = registry.response(&request(&format!(
            "hybrid-canvas-asset://asset/session-1/{asset}"
        )));

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CONTENT_TYPE),
            Some(&"image/png".parse().expect("header value")),
        );
        assert_eq!(response.body(), &vec![1, 2, 3, 4]);
    }

    #[test]
    fn rejects_path_traversal_and_extra_components() {
        let registry = AssetProtocolRegistry::default();

        for uri in [
            "hybrid-canvas-asset://asset/../asset",
            "hybrid-canvas-asset://asset/session/asset/extra",
            "hybrid-canvas-asset://asset/session\\\\escape/asset",
            "hybrid-canvas-asset://asset/session/asset?path=secret",
        ] {
            let response = registry.response(&request(uri));

            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        }
    }

    #[test]
    fn removing_session_invalidates_all_urls() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        let asset = insert(
            &registry,
            "session-1",
            "image/png",
            &[1, 2, 3],
        );

        assert!(
            registry
                .remove_session("session-1")
                .expect("session should close")
        );

        let response = registry.response(&request(&format!(
            "hybrid-canvas-asset://asset/session-1/{asset}"
        )));

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn deduplicates_equal_content_and_tracks_references() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        let asset = insert(
            &registry,
            "session-1",
            "image/png",
            &[1, 2, 3],
        );

        let duplicate = insert(
            &registry,
            "session-1",
            "image/png",
            &[1, 2, 3],
        );

        assert_eq!(asset, duplicate);

        let snapshot = registry
            .snapshot_session("session-1")
            .expect("snapshot should succeed");

        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot[0].content_hash, asset);

        assert!(
            registry
                .remove("session-1", &asset)
                .expect("first reference should be removed")
        );

        assert!(
            registry
                .contains("session-1", &asset)
                .expect("asset should remain")
        );

        assert!(
            registry
                .remove("session-1", &asset)
                .expect("final reference should be removed")
        );

        assert!(
            !registry
                .contains("session-1", &asset)
                .expect("asset should be gone")
        );
    }

    #[test]
    fn rejects_non_canonical_content_identity() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        let bytes = vec![1, 2, 3];
        let content_hash = hash(&bytes);

        let result = registry.insert(
            "session-1",
            "different-token",
            &content_hash,
            "image/png",
            bytes,
        );

        assert_eq!(
            result,
            Err(AssetProtocolError::InvalidContentHash),
        );
    }

    #[test]
    fn snapshot_is_sorted_by_content_hash() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        insert(
            &registry,
            "session-1",
            "image/png",
            &[3],
        );
        insert(
            &registry,
            "session-1",
            "image/png",
            &[1],
        );
        insert(
            &registry,
            "session-1",
            "image/png",
            &[2],
        );

        let snapshot = registry
            .snapshot_session("session-1")
            .expect("snapshot should succeed");

        let hashes = snapshot
            .iter()
            .map(|asset| asset.content_hash.as_str())
            .collect::<Vec<_>>();

        assert!(hashes.windows(2).all(|pair| {
            pair[0] < pair[1]
        }));
    }

    #[test]
    fn rejects_active_or_unknown_content_types() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session")
            .expect("session should open");

        for content_type in [
            "image/svg+xml",
            "text/html",
            "application/javascript",
            "application/octet-stream",
        ] {
            let bytes = vec![1];
            let content_hash = hash(&bytes);

            let result = registry.insert(
                "session",
                &content_hash,
                &content_hash,
                content_type,
                bytes,
            );

            assert_eq!(
                result,
                Err(AssetProtocolError::UnsupportedContentType),
            );
        }
    }
}
`

  result = `${result.slice(0, testsStart)}${finalTests}`

  return result
}

function updateAssetCommands(source) {
  if (
    source.includes(
      'let asset_token = content_hash.clone();',
    ) &&
    source.includes(
      '&content_hash,\n            &request.content_type,',
    )
  ) {
    return source
  }

  let result = source

  result = replaceExact(
    result,
    `) -> CommandResult<AssetUploadResult> {
    let asset_token = Uuid::now_v7().simple().to_string();
    let byte_length = u32::try_from(request.bytes.len())`,
    `) -> CommandResult<AssetUploadResult> {
    let byte_length = u32::try_from(request.bytes.len())`,
    'remove random asset identity',
  )

  result = replaceExact(
    result,
    `    let content_hash =
        hex::encode(Sha256::digest(&request.bytes));

    assets`,
    `    let content_hash =
        hex::encode(Sha256::digest(&request.bytes));
    let asset_token = content_hash.clone();

    assets`,
    'derive asset token from SHA-256',
  )

  result = replaceExact(
    result,
    `            &request.session_token,
            &asset_token,
            &request.content_type,
            request.bytes,`,
    `            &request.session_token,
            &asset_token,
            &content_hash,
            &request.content_type,
            request.bytes,`,
    'register content hash with Native asset',
  )

  result = replaceExact(
    result,
    `        AssetProtocolError::InvalidToken
        | AssetProtocolError::UnsupportedContentType
        | AssetProtocolError::AssetTooLarge => {`,
    `        AssetProtocolError::InvalidToken
        | AssetProtocolError::InvalidContentHash
        | AssetProtocolError::UnsupportedContentType
        | AssetProtocolError::AssetTooLarge => {`,
    'map invalid content hash',
  )

  result = replaceExact(
    result,
    `        AssetProtocolError::RegistryBudgetExceeded
        | AssetProtocolError::DuplicateAsset => {`,
    `        AssetProtocolError::RegistryBudgetExceeded
        | AssetProtocolError::DuplicateAsset
        | AssetProtocolError::ReferenceOverflow => {`,
    'map reference overflow',
  )

  return result
}

function validateAdapter(source) {
  for (const fragment of [
    'uploaded.assetToken',
    'uploaded.contentHash',
    'assetTokens.set(',
    'removeUploadedAsset(',
  ]) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Native TLAssetStore adapter prerequisite is missing: ${fragment}`,
      )
    }
  }

  if (
    source.includes(
      'crypto.randomUUID',
    ) ||
    source.includes(
      'URL.createObjectURL',
    ) ||
    source.includes(
      'FileReader',
    )
  ) {
    throw new Error(
      'The asset adapter contains an unsupported fallback or renderer-generated identity.',
    )
  }
}

function validateFinal(protocol, commands) {
  const protocolFragments = [
    'pub struct AssetSessionSnapshotEntry',
    'references: u32',
    'pub fn snapshot_session(',
    'validate_content_hash(content_hash)?;',
    'if asset_token != content_hash',
    'existing.references = existing',
    'snapshot.sort_unstable_by',
  ]

  for (const fragment of protocolFragments) {
    if (!protocol.includes(fragment)) {
      throw new Error(
        `Final asset registry is missing: ${fragment}`,
      )
    }
  }

  const commandFragments = [
    'let asset_token = content_hash.clone();',
    '&content_hash,\n            &request.content_type,',
    'AssetProtocolError::InvalidContentHash',
    'AssetProtocolError::ReferenceOverflow',
  ]

  for (const fragment of commandFragments) {
    if (!commands.includes(fragment)) {
      throw new Error(
        `Final asset command is missing: ${fragment}`,
      )
    }
  }

  const forbidden = [
    [
      commands,
      'let asset_token = Uuid::now_v7().simple().to_string();',
      'random asset token generation',
    ],
    [
      protocol,
      'if session.contains_key(asset_token) {\n            return Err(AssetProtocolError::DuplicateAsset);',
      'non-deduplicating duplicate rejection',
    ],
  ]

  for (const [source, fragment, description] of forbidden) {
    if (source.includes(fragment)) {
      throw new Error(
        `Obsolete asset behavior remains: ${description}`,
      )
    }
  }
}

async function restoreFiles(originals) {
  const results = await Promise.allSettled(
    [...originals].map(([path, content]) =>
      writeFile(path, content, 'utf8'),
    ),
  )

  if (
    results.some((result) => result.status === 'rejected')
  ) {
    throw new Error(
      [
        'Rollback failed.',
        'Inspect these files immediately:',
        ...originals.keys(),
      ].join('\n'),
    )
  }
}

async function main() {
  for (const path of Object.values(paths)) {
    if (!(await exists(path))) {
      throw new Error(
        `Required file was not found: ${path}`,
      )
    }
  }

  const packageJson = JSON.parse(
    (
      await readFile(paths.packageJson, 'utf8')
    ).replace(/^\uFEFF/, ''),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected package name: ${String(
        packageJson.name,
      )}`,
    )
  }

  const [
    protocolOriginal,
    commandsOriginal,
    adapter,
  ] = await Promise.all([
    readFile(paths.assetProtocol, 'utf8'),
    readFile(paths.assetCommands, 'utf8'),
    readFile(paths.nativeAssetAdapter, 'utf8'),
  ])

  validateAdapter(adapter)

  const protocolFinal =
    updateAssetProtocol(protocolOriginal)

  const commandsFinal =
    updateAssetCommands(commandsOriginal)

  validateFinal(protocolFinal, commandsFinal)

  const originals = new Map([
    [paths.assetProtocol, protocolOriginal],
    [paths.assetCommands, commandsOriginal],
  ])

  const outputs = new Map([
    [paths.assetProtocol, protocolFinal],
    [paths.assetCommands, commandsFinal],
  ])

  const changed = [...outputs].filter(
    ([path, content]) => originals.get(path) !== content,
  )

  if (changed.length === 0) {
    console.log(
      'P0-C.6.1 content-addressed Native asset registry is already applied.',
    )
    return
  }

  console.log('P0-C.6.1 will update:')

  for (const [path] of changed) {
    console.log(`- ${path.slice(root.length + 1)}`)
  }

  if (check) {
    console.log('')
    console.log('It will:')
    console.log(
      '- use canonical SHA-256 as the Native asset token;',
    )
    console.log(
      '- deduplicate identical binary resources per session;',
    )
    console.log(
      '- maintain references for shared tldraw assets;',
    )
    console.log(
      '- release bytes only after the final reference is removed;',
    )
    console.log(
      '- expose a deterministic Native-only session snapshot;',
    )
    console.log(
      '- keep all binary persistence handoff outside the Renderer;',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the changes.',
    )
    return
  }

  try {
    for (const [path, content] of changed) {
      await writeFile(path, content, 'utf8')
    }
  } catch (error) {
    console.error(
      '\nApply failed. Restoring original files...',
    )

    await restoreFiles(originals)
    throw error
  }

  console.log('')
  console.log(
    'Applied P0-C.6.1 content-addressed Native asset registry.',
  )
  console.log('')
  console.log('Required verification:')
  console.log('  cargo fmt --all')
  console.log('  cargo check --workspace --all-targets')
  console.log('  cargo test --workspace --all-targets')
  console.log(
    '  cargo clippy --workspace --all-targets -- -D warnings',
  )
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm check:ipc')
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})