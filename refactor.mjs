#!/usr/bin/env node

/**
 * P0-C.6.2 — Transactional Native asset-session restoration.
 *
 * Required base:
 *   c6d3c9b9452bfbcfeaeaa3d7ac158b0db12e9b48
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --check D:\xiaojianc\hybrid-canvas
 *   node refactor.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const STEP_NAME =
  'P0-C.6.2 transactional Native asset restoration'

function fail(message) {
  console.error(`\n${STEP_NAME} failed:\n${message}\n`)
  process.exit(1)
}

function parseArguments(argv) {
  let mode = null
  let rootArgument = null

  for (const argument of argv) {
    if (
      argument === '--check' ||
      argument === '--apply'
    ) {
      if (mode !== null) {
        fail(
          [
            'Exactly one execution mode is required.',
            `Received both "${mode}" and "${argument}".`,
          ].join('\n'),
        )
      }

      mode = argument
      continue
    }

    if (argument.startsWith('--')) {
      fail(`Unknown argument: ${argument}`)
    }

    if (rootArgument !== null) {
      fail(
        [
          'Only one repository path may be supplied.',
          `Unexpected argument: ${argument}`,
        ].join('\n'),
      )
    }

    rootArgument = argument
  }

  if (mode === null) {
    fail(
      [
        'Missing execution mode.',
        'Use either --check or --apply.',
      ].join('\n'),
    )
  }

  return {
    mode,
    root: resolve(
      rootArgument ?? process.cwd(),
    ),
  }
}

const { mode, root } = parseArguments(
  process.argv.slice(2),
)

const paths = {
  packageJson: join(root, 'package.json'),

  assetProtocol: join(
    root,
    'apps',
    'desktop',
    'src-tauri',
    'src',
    'asset_protocol.rs',
  ),

  codec: join(
    root,
    'editor',
    'persistence',
    'native',
    'src',
    'document_codec_v2.rs',
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

function countOccurrences(source, fragment) {
  if (fragment.length === 0) {
    throw new Error(
      'Cannot count an empty source fragment.',
    )
  }

  let count = 0
  let offset = 0

  while (true) {
    const index = source.indexOf(
      fragment,
      offset,
    )

    if (index < 0) {
      return count
    }

    count += 1
    offset = index + fragment.length
  }
}

function replaceExact(
  source,
  baseline,
  final,
  description,
) {
  const baselineCount =
    countOccurrences(source, baseline)

  const finalCount =
    countOccurrences(source, final)

  if (
    baselineCount === 1 &&
    finalCount === 0
  ) {
    return source.replace(baseline, final)
  }

  if (
    baselineCount === 0 &&
    finalCount === 1
  ) {
    return source
  }

  throw new Error(
    [
      `Unexpected source count: ${description}`,
      'Expected either one audited baseline or one final implementation.',
      `Baseline count: ${baselineCount}`,
      `Final count: ${finalCount}`,
      'Refusing an ambiguous or partial modification.',
    ].join('\n'),
  )
}

const importBaseline = `use std::collections::HashMap;
use std::sync::{Arc, RwLock};`

const importFinal = `use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};`

const snapshotMethodStart = `    pub fn snapshot_session(
        &self,
        session_token: &str,
    ) -> Result<Vec<AssetSessionSnapshotEntry>, AssetProtocolError> {`

const restoreMethod = `    /// Restores one complete document-owned asset session atomically.
    ///
    /// Every asset is validated and materialized in private temporary state
    /// before the registry write lock is acquired. The session becomes visible
    /// only after the complete resource set and global byte budget have been
    /// accepted.
    ///
    /// Failure never publishes an empty or partially restored session.
    pub fn restore_session(
        &self,
        session_token: &str,
        assets: Vec<AssetSessionSnapshotEntry>,
    ) -> Result<(), AssetProtocolError> {
        validate_token(session_token)?;

        let mut restored_assets =
            HashMap::<String, RegisteredAsset>::new();
        let mut restored_bytes = 0_usize;

        for asset in assets {
            validate_content_hash(&asset.content_hash)?;
            validate_content_type(&asset.content_type)?;

            if asset.bytes.len() > MAX_ASSET_BYTES {
                return Err(AssetProtocolError::AssetTooLarge);
            }

            let actual_hash =
                hex::encode(Sha256::digest(asset.bytes.as_ref()));

            if actual_hash != asset.content_hash {
                return Err(AssetProtocolError::InvalidContentHash);
            }

            restored_bytes = restored_bytes
                .checked_add(asset.bytes.len())
                .ok_or(
                    AssetProtocolError::RegistryBudgetExceeded,
                )?;

            if restored_bytes > MAX_REGISTRY_BYTES {
                return Err(
                    AssetProtocolError::RegistryBudgetExceeded,
                );
            }

            let content_hash = asset.content_hash;

            let registered = RegisteredAsset {
                bytes: asset.bytes,
                content_type: asset.content_type,
                references: 1,
            };

            if restored_assets
                .insert(content_hash, registered)
                .is_some()
            {
                return Err(AssetProtocolError::DuplicateAsset);
            }
        }

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        if state.sessions.contains_key(session_token) {
            return Err(AssetProtocolError::DuplicateAsset);
        }

        let next_total = state
            .total_bytes
            .checked_add(restored_bytes)
            .ok_or(
                AssetProtocolError::RegistryBudgetExceeded,
            )?;

        if next_total > MAX_REGISTRY_BYTES {
            return Err(
                AssetProtocolError::RegistryBudgetExceeded,
            );
        }

        state
            .sessions
            .insert(session_token.to_owned(), restored_assets);

        state.total_bytes = next_total;

        Ok(())
    }

${snapshotMethodStart}`

const testsAnchor = `    #[test]
    fn rejects_active_or_unknown_content_types() {`

const restorationTests = `    #[test]
    fn restores_complete_content_addressed_session() {
        let registry = AssetProtocolRegistry::default();

        let first_bytes =
            Arc::<[u8]>::from(vec![1, 2, 3]);
        let second_bytes =
            Arc::<[u8]>::from(vec![4, 5, 6]);

        let first_hash = hash(first_bytes.as_ref());
        let second_hash = hash(second_bytes.as_ref());

        registry
            .restore_session(
                "restored-session",
                vec![
                    AssetSessionSnapshotEntry {
                        content_hash: second_hash.clone(),
                        content_type:
                            "image/png".to_owned(),
                        bytes: Arc::clone(&second_bytes),
                    },
                    AssetSessionSnapshotEntry {
                        content_hash: first_hash.clone(),
                        content_type:
                            "image/png".to_owned(),
                        bytes: Arc::clone(&first_bytes),
                    },
                ],
            )
            .expect("session should restore");

        assert!(
            registry
                .contains(
                    "restored-session",
                    &first_hash,
                )
                .expect("first asset should resolve")
        );

        assert!(
            registry
                .contains(
                    "restored-session",
                    &second_hash,
                )
                .expect("second asset should resolve")
        );

        let snapshot = registry
            .snapshot_session("restored-session")
            .expect("restored session should snapshot");

        assert_eq!(snapshot.len(), 2);

        assert!(snapshot.windows(2).all(|pair| {
            pair[0].content_hash < pair[1].content_hash
        }));

        let first_response =
            registry.response(&request(&format!(
                "hybrid-canvas-asset://asset/restored-session/{first_hash}"
            )));

        assert_eq!(
            first_response.status(),
            StatusCode::OK,
        );

        assert_eq!(
            first_response.body(),
            &first_bytes.as_ref().to_vec(),
        );
    }

    #[test]
    fn invalid_restore_does_not_publish_partial_session() {
        let registry = AssetProtocolRegistry::default();

        let valid_bytes =
            Arc::<[u8]>::from(vec![1, 2, 3]);

        let valid_hash = hash(valid_bytes.as_ref());

        let result = registry.restore_session(
            "failed-session",
            vec![
                AssetSessionSnapshotEntry {
                    content_hash: valid_hash,
                    content_type:
                        "image/png".to_owned(),
                    bytes: valid_bytes,
                },
                AssetSessionSnapshotEntry {
                    content_hash: "0".repeat(64),
                    content_type:
                        "image/png".to_owned(),
                    bytes: Arc::<[u8]>::from(
                        vec![9, 9, 9],
                    ),
                },
            ],
        );

        assert_eq!(
            result,
            Err(AssetProtocolError::InvalidContentHash),
        );

        assert!(matches!(
            registry.snapshot_session("failed-session"),
            Err(AssetProtocolError::NotFound),
        ));
    }

    #[test]
    fn duplicate_restore_hash_does_not_publish_session() {
        let registry = AssetProtocolRegistry::default();

        let bytes = Arc::<[u8]>::from(vec![1, 2, 3]);
        let content_hash = hash(bytes.as_ref());

        let result = registry.restore_session(
            "duplicate-session",
            vec![
                AssetSessionSnapshotEntry {
                    content_hash:
                        content_hash.clone(),
                    content_type:
                        "image/png".to_owned(),
                    bytes: Arc::clone(&bytes),
                },
                AssetSessionSnapshotEntry {
                    content_hash,
                    content_type:
                        "image/png".to_owned(),
                    bytes,
                },
            ],
        );

        assert_eq!(
            result,
            Err(AssetProtocolError::DuplicateAsset),
        );

        assert!(matches!(
            registry.snapshot_session(
                "duplicate-session",
            ),
            Err(AssetProtocolError::NotFound),
        ));
    }

${testsAnchor}`

function updateAssetProtocol(source) {
  let result = source

  result = replaceExact(
    result,
    importBaseline,
    importFinal,
    'add production SHA-256 validation import',
  )

  result = replaceExact(
    result,
    snapshotMethodStart,
    restoreMethod,
    'add transactional session restoration',
  )

  result = replaceExact(
    result,
    testsAnchor,
    restorationTests,
    'add asset restoration transaction tests',
  )

  return result
}

function validateRepository(packageJson) {
  let parsed

  try {
    parsed = JSON.parse(
      packageJson.replace(/^\uFEFF/, ''),
    )
  } catch (error) {
    throw new Error(
      `Root package.json is invalid JSON: ${String(
        error,
      )}`,
    )
  }

  if (parsed.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected package name: ${String(
        parsed.name,
      )}`,
    )
  }
}

function validateCodec(codec) {
  const required = [
    'pub fn decode_draw_document_v2',
    'pub struct DrawAssetOutput',
    'pub bytes: Vec<u8>',
    'bytes: content.to_vec(),',
  ]

  for (const fragment of required) {
    if (!codec.includes(fragment)) {
      throw new Error(
        `Required v2 codec prerequisite is missing: ${fragment}`,
      )
    }
  }
}

function validateAssetProtocolPrerequisites(
  source,
) {
  const required = [
    'pub struct AssetSessionSnapshotEntry',
    'pub content_hash: String',
    'pub content_type: String',
    'pub bytes: Arc<[u8]>',
    'references: u32',
    'pub fn insert(',
    'pub fn remove_session(',
    'pub fn snapshot_session(',
    'fn validate_content_hash(',
    'fn validate_content_type(',
    'const MAX_ASSET_BYTES: usize',
    'const MAX_REGISTRY_BYTES: usize',
  ]

  for (const fragment of required) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Required asset registry prerequisite is missing: ${fragment}`,
      )
    }
  }
}

function validateFinal(source) {
  const required = [
    'use sha2::{Digest, Sha256};',
    'pub fn restore_session(',
    'HashMap::<String, RegisteredAsset>::new()',
    'Sha256::digest(asset.bytes.as_ref())',
    'actual_hash != asset.content_hash',
    '.insert(content_hash, registered)',
    'state.sessions.contains_key(session_token)',
    '.checked_add(restored_bytes)',
    '.insert(session_token.to_owned(), restored_assets)',
    'invalid_restore_does_not_publish_partial_session',
    'duplicate_restore_hash_does_not_publish_session',
    'restores_complete_content_addressed_session',
  ]

  for (const fragment of required) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Final asset restoration is missing: ${fragment}`,
      )
    }
  }

  if (
    countOccurrences(
      source,
      'pub fn restore_session(',
    ) !== 1
  ) {
    throw new Error(
      'Asset registry must contain exactly one restore_session implementation.',
    )
  }

  const restoreStart = source.indexOf(
    '    pub fn restore_session(',
  )

  const snapshotStart = source.indexOf(
    '    pub fn snapshot_session(',
    restoreStart,
  )

  if (
    restoreStart < 0 ||
    snapshotStart < 0 ||
    snapshotStart <= restoreStart
  ) {
    throw new Error(
      'Asset restoration method is not located at the audited registry boundary.',
    )
  }

  const restoreBody = source.slice(
    restoreStart,
    snapshotStart,
  )

  const lockIndex = restoreBody.indexOf(
    'let mut state = self',
  )

  const hashValidationIndex =
    restoreBody.indexOf(
      'actual_hash != asset.content_hash',
    )

  const temporaryMapIndex =
    restoreBody.indexOf(
      'HashMap::<String, RegisteredAsset>::new()',
    )

  if (
    lockIndex < 0 ||
    hashValidationIndex < 0 ||
    temporaryMapIndex < 0
  ) {
    throw new Error(
      'Transactional restoration ordering cannot be verified.',
    )
  }

  if (
    temporaryMapIndex > lockIndex ||
    hashValidationIndex > lockIndex
  ) {
    throw new Error(
      'Asset validation must complete before the registry write lock is acquired.',
    )
  }

  const publicationIndex =
    restoreBody.indexOf(
      '.insert(session_token.to_owned(), restored_assets)',
    )

  if (
    publicationIndex < lockIndex
  ) {
    throw new Error(
      'Restored session is published before registry validation.',
    )
  }

  for (const forbidden of [
    'open_session(session_token)?',
    'self.insert(',
    'unwrap()',
    'unsafe {',
    'std::fs::',
    'PathBuf',
  ]) {
    if (restoreBody.includes(forbidden)) {
      throw new Error(
        `Transactional restore contains forbidden behavior: ${forbidden}`,
      )
    }
  }
}

async function restoreFile(
  path,
  original,
) {
  try {
    await writeFile(path, original, 'utf8')
  } catch (restoreError) {
    throw new AggregateError(
      [restoreError],
      'The asset protocol update failed and the original file could not be restored.',
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

  const [
    packageJson,
    protocolOriginal,
    codec,
  ] = await Promise.all([
    readFile(paths.packageJson, 'utf8'),
    readFile(paths.assetProtocol, 'utf8'),
    readFile(paths.codec, 'utf8'),
  ])

  validateRepository(packageJson)
  validateCodec(codec)

  validateAssetProtocolPrerequisites(
    protocolOriginal,
  )

  const protocolFinal =
    updateAssetProtocol(protocolOriginal)

  validateFinal(protocolFinal)

  if (protocolFinal === protocolOriginal) {
    console.log(
      `${STEP_NAME} is already applied.`,
    )
    return
  }

  const relativeProtocol =
    paths.assetProtocol.slice(
      root.length + 1,
    )

  console.log(`${STEP_NAME} will update:`)
  console.log(`- ${relativeProtocol}`)
  console.log('')
  console.log('It will:')
  console.log(
    '- validate every restored asset before publishing a session;',
  )
  console.log(
    '- verify restored bytes against their SHA-256 identity;',
  )
  console.log(
    '- reject duplicate content hashes and unsupported MIME types;',
  )
  console.log(
    '- enforce per-asset and process-wide Native byte budgets;',
  )
  console.log(
    '- restore the complete session through one atomic registry mutation;',
  )
  console.log(
    '- leave no partial Native session after validation failure;',
  )
  console.log(
    '- keep all binary resource transfer inside Native.',
  )

  if (mode === '--check') {
    console.log('')
    console.log(
      'Check completed. No files were written.',
    )
    console.log('')
    console.log('Apply with:')
    console.log('  node refactor.mjs --apply')
    return
  }

  try {
    await writeFile(
      paths.assetProtocol,
      protocolFinal,
      'utf8',
    )

    const written = await readFile(
      paths.assetProtocol,
      'utf8',
    )

    if (written !== protocolFinal) {
      throw new Error(
        'The written asset protocol does not match the validated output.',
      )
    }

    validateFinal(written)
  } catch (error) {
    console.error(
      '\nApply failed. Restoring the original asset protocol...',
    )

    await restoreFile(
      paths.assetProtocol,
      protocolOriginal,
    )

    throw error
  }

  console.log('')
  console.log(`Applied ${STEP_NAME}.`)
  console.log('')
  console.log('Required verification:')
  console.log(
    '  cargo fmt --all -- --check',
  )
  console.log(
    '  cargo check --workspace --all-targets',
  )
  console.log(
    '  cargo test --workspace --all-targets',
  )
  console.log(
    '  cargo clippy --workspace --all-targets -- -D warnings',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm tauri dev')
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})