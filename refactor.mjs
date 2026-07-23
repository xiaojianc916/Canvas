#!/usr/bin/env node

/**
 * P0-C.2.2 — Repair asset IPC numeric contract and Cargo default binary.
 *
 * Fixes:
 *   - Specta BigIntForbidden caused by AssetUploadResult.byteLength: u64
 *   - Rust unused-qualifications warnings
 *   - Tauri dev ambiguity after adding export-ipc-bindings binary
 *   - stale generated TypeScript IPC bindings
 *
 * Required base:
 *   417edece186cc9b53feb10ebf46cbb5cecffa390
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply D:/xiaojianc/hybrid-canvas
 */

import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawnSync } from 'node:child_process'
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

if (unknownOptions.length > 0) {
  console.error(
    '\nP0-C.2.2 asset IPC repair failed:\n' +
      `Unknown option: ${unknownOptions.join(', ')}\n`,
  )
  process.exit(1)
}

if (rootArguments.length > 1) {
  console.error(
    '\nP0-C.2.2 asset IPC repair failed:\n' +
      'Only one optional repository root is accepted.\n',
  )
  process.exit(1)
}

if (apply && check) {
  console.error(
    '\nP0-C.2.2 asset IPC repair failed:\n' +
      'Use either --check or --apply, not both.\n',
  )
  process.exit(1)
}

if (!apply && !check) {
  console.error(
    '\nP0-C.2.2 asset IPC repair failed:\n' +
      'Missing mode. Use --check or --apply.\n',
  )
  process.exit(1)
}

const root = resolve(rootArguments[0] ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),

  cargoToml: join(
    root,
    'apps/desktop/src-tauri/Cargo.toml',
  ),

  assetCommand: join(
    root,
    'apps/desktop/src-tauri/src/commands/asset.rs',
  ),

  exportBindings: join(
    root,
    'apps/desktop/src-tauri/src/ipc/export_bindings.rs',
  ),

  generatedBindings: join(
    root,
    'platforms/desktop-ipc/src/generated/ipc-bindings.ts',
  ),
}

function fail(message) {
  console.error(
    `\nP0-C.2.2 asset IPC repair failed:\n${message}\n`,
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
  if (
    source.includes(
      'default-run = "hybrid-canvas-desktop"',
    )
  ) {
    return source
  }

  return replaceOnce(
    source,
    `[package]
name = "hybrid-canvas-desktop"
version.workspace = true`,
    `[package]
name = "hybrid-canvas-desktop"
default-run = "hybrid-canvas-desktop"
version.workspace = true`,
    'set desktop application as the default Cargo binary',
  )
}

function updateAssetCommand(source) {
  const alreadyApplied =
    source.includes(
      'type CommandResult<T> = Result<T, IpcError>;',
    ) &&
    source.includes('pub byte_length: u32,') &&
    source.includes(
      'let byte_length = u32::try_from(request.bytes.len())',
    ) &&
    count(source, '-> CommandResult<') === 4 &&
    !source.includes('std::result::Result<') &&
    !source.includes(
      'use crate::error::{Error, IpcError, Result};',
    )

  if (alreadyApplied) {
    return source
  }

  let next = source

  next = replaceOnce(
    next,
    'use crate::error::{Error, IpcError, Result};',
    `use crate::error::{Error, IpcError};

type CommandResult<T> = Result<T, IpcError>;`,
    'replace conflicting Result import with command result alias',
  )

  next = replaceOnce(
    next,
    '    pub byte_length: u64,',
    '    pub byte_length: u32,',
    'make IPC byte length TypeScript-safe',
  )

  next = replaceOnce(
    next,
    `    let byte_length = u64::try_from(request.bytes.len())
        .map_err(|_| Error::Asset("asset length overflow".into()))?;`,
    `    let byte_length = u32::try_from(request.bytes.len())
        .map_err(|_| Error::Asset("asset length overflow".into()))?;`,
    'convert asset byte length through u32',
  )

  const resultReplacements = [
    [
      'std::result::Result<AssetSessionResult, IpcError>',
      'CommandResult<AssetSessionResult>',
      'asset session open result',
    ],
    [
      'std::result::Result<AssetUploadResult, IpcError>',
      'CommandResult<AssetUploadResult>',
      'asset upload result',
    ],
  ]

  for (const [oldText, newText, description] of resultReplacements) {
    next = replaceOnce(
      next,
      oldText,
      newText,
      description,
    )
  }

  const unitResultCount = count(
    next,
    'std::result::Result<(), IpcError>',
  )

  if (unitResultCount !== 2) {
    throw new Error(
      [
        'Unexpected unit asset command result count.',
        'Expected: 2',
        `Actual: ${unitResultCount}`,
      ].join('\n'),
    )
  }

  next = next.replaceAll(
    'std::result::Result<(), IpcError>',
    'CommandResult<()>',
  )

  if (next.includes('std::result::Result<')) {
    throw new Error(
      'Qualified Result remains in the asset command.',
    )
  }

  if (
    count(next, '-> CommandResult<') !== 4
  ) {
    throw new Error(
      'Expected exactly four asset command result aliases.',
    )
  }

  if (
    next.includes('pub byte_length: u64,') ||
    next.includes(
      'u64::try_from(request.bytes.len())',
    )
  ) {
    throw new Error(
      'A u64 asset byte length remains in the IPC contract.',
    )
  }

  return next
}

function validateRustExporter(source) {
  const requiredFragments = [
    'crate::commands::asset::asset_session_open,',
    'crate::commands::asset::asset_upload,',
    'crate::commands::asset::asset_remove,',
    'crate::commands::asset::asset_session_close,',
    '.typ::<AssetSessionResult>()',
    '.typ::<AssetUploadRequest>()',
    '.typ::<AssetUploadResult>()',
    '.typ::<AssetRemoveRequest>()',
    '.typ::<AssetSessionCloseRequest>()',
  ]

  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Rust IPC exporter is missing: ${fragment}`,
      )
    }
  }
}

function validateGeneratedBindings(source) {
  const requiredFragments = [
    'async assetSessionOpen()',
    'TAURI_INVOKE("asset_session_open")',

    'async assetUpload(request: AssetUploadRequest)',
    'TAURI_INVOKE("asset_upload", { request })',

    'async assetRemove(request: AssetRemoveRequest)',
    'TAURI_INVOKE("asset_remove", { request })',

    'async assetSessionClose(request: AssetSessionCloseRequest)',
    'TAURI_INVOKE("asset_session_close", { request })',

    'export type AssetSessionResult =',
    'export type AssetUploadRequest =',
    'export type AssetUploadResult =',
    'export type AssetRemoveRequest =',
    'export type AssetSessionCloseRequest =',
  ]

  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Generated IPC bindings are missing: ${fragment}`,
      )
    }
  }

  for (const fragment of [
    'async assetSessionOpen()',
    'async assetUpload(',
    'async assetRemove(',
    'async assetSessionClose(',
    'export type AssetSessionResult =',
    'export type AssetUploadRequest =',
    'export type AssetUploadResult =',
    'export type AssetRemoveRequest =',
    'export type AssetSessionCloseRequest =',
  ]) {
    if (count(source, fragment) !== 1) {
      throw new Error(
        `Generated IPC surface has an unexpected count: ${fragment}`,
      )
    }
  }

  const uploadRequestMatch = source.match(
    /export type AssetUploadRequest\s*=\s*\{[^}]+\}/,
  )

  if (!uploadRequestMatch) {
    throw new Error(
      'Generated AssetUploadRequest type was not found.',
    )
  }

  const uploadRequest = uploadRequestMatch[0]

  for (const field of [
    'sessionToken: string',
    'contentType: string',
    'bytes: number[]',
  ]) {
    if (!uploadRequest.includes(field)) {
      throw new Error(
        `AssetUploadRequest is missing: ${field}`,
      )
    }
  }

  const uploadResultMatch = source.match(
    /export type AssetUploadResult\s*=\s*\{[^}]+\}/,
  )

  if (!uploadResultMatch) {
    throw new Error(
      'Generated AssetUploadResult type was not found.',
    )
  }

  const uploadResult = uploadResultMatch[0]

  for (const field of [
    'assetToken: string',
    'contentHash: string',
    'source: string',
    'byteLength: number',
    'contentType: string',
  ]) {
    if (!uploadResult.includes(field)) {
      throw new Error(
        `AssetUploadResult is missing: ${field}`,
      )
    }
  }

  if (
    uploadResult.includes('byteLength: bigint') ||
    source.includes('BigIntForbidden')
  ) {
    throw new Error(
      'Asset byte length still requires bigint.',
    )
  }

  const sessionResultMatch = source.match(
    /export type AssetSessionResult\s*=\s*\{[^}]+\}/,
  )

  if (
    !sessionResultMatch ||
    !sessionResultMatch[0].includes(
      'sessionToken: string',
    )
  ) {
    throw new Error(
      'AssetSessionResult is incomplete.',
    )
  }

  const removeRequestMatch = source.match(
    /export type AssetRemoveRequest\s*=\s*\{[^}]+\}/,
  )

  if (
    !removeRequestMatch ||
    !removeRequestMatch[0].includes(
      'sessionToken: string',
    ) ||
    !removeRequestMatch[0].includes(
      'assetToken: string',
    )
  ) {
    throw new Error(
      'AssetRemoveRequest is incomplete.',
    )
  }

  const closeRequestMatch = source.match(
    /export type AssetSessionCloseRequest\s*=\s*\{[^}]+\}/,
  )

  if (
    !closeRequestMatch ||
    !closeRequestMatch[0].includes(
      'sessionToken: string',
    )
  ) {
    throw new Error(
      'AssetSessionCloseRequest is incomplete.',
    )
  }
}

function runCargo(args, description) {
  console.log('')
  console.log(`Running: cargo ${args.join(' ')}`)
  console.log('')

  const result = spawnSync('cargo', args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: process.env,
  })

  if (result.error) {
    throw new Error(
      [
        `Failed to start ${description}.`,
        `Cause: ${result.error.message}`,
        'Ensure cargo is available in PATH.',
      ].join('\n'),
    )
  }

  if (result.signal) {
    throw new Error(
      `${description} terminated by ${result.signal}.`,
    )
  }

  if (result.status !== 0) {
    throw new Error(
      `${description} failed with code ${String(
        result.status,
      )}.`,
    )
  }
}

async function main() {
  for (const path of Object.values(paths)) {
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

  const expectedGenerator =
    'cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings'

  if (
    packageJson.scripts?.['generate:ipc'] !==
    expectedGenerator
  ) {
    throw new Error(
      [
        'Unexpected generate:ipc command.',
        `Expected: ${expectedGenerator}`,
        `Actual: ${String(
          packageJson.scripts?.['generate:ipc'],
        )}`,
        'Refusing to execute a guessed command.',
      ].join('\n'),
    )
  }

  const [
    cargoOriginal,
    assetOriginal,
    exporterOriginal,
    generatedOriginal,
  ] = await Promise.all([
    readFile(paths.cargoToml, 'utf8'),
    readFile(paths.assetCommand, 'utf8'),
    readFile(paths.exportBindings, 'utf8'),
    readFile(paths.generatedBindings, 'utf8'),
  ])

  validateRustExporter(exporterOriginal)

  const cargoNext = updateCargoToml(cargoOriginal)
  const assetNext = updateAssetCommand(assetOriginal)

  let generatedIsCurrent = true

  try {
    validateGeneratedBindings(generatedOriginal)
  } catch {
    generatedIsCurrent = false
  }

  const cargoChanged = cargoNext !== cargoOriginal
  const assetChanged = assetNext !== assetOriginal

  if (
    !cargoChanged &&
    !assetChanged &&
    generatedIsCurrent
  ) {
    console.log(
      'P0-C.2.2 asset IPC contract is already repaired.',
    )
    return
  }

  console.log('P0-C.2.2 required repairs:')

  if (assetChanged) {
    console.log(
      '- change asset byteLength from u64 to u32',
    )
    console.log(
      '- replace qualified Result types with CommandResult',
    )
  }

  if (cargoChanged) {
    console.log(
      '- set hybrid-canvas-desktop as Cargo default-run',
    )
  }

  if (!generatedIsCurrent) {
    console.log(
      '- regenerate TypeScript asset IPC bindings',
    )
  }

  if (check) {
    console.log('')
    console.log('The apply operation will:')
    console.log(
      '- prepare and validate every source edit before writing;',
    )
    console.log(
      '- make byteLength a TypeScript number contract;',
    )
    console.log(
      '- eliminate all four Rust qualification warnings;',
    )
    console.log(
      '- restore pnpm tauri dev binary selection;',
    )
    console.log(
      '- run the Rust binding exporter directly;',
    )
    console.log(
      '- restore all modified files if generation fails;',
    )
    console.log('')
    console.log(
      'Run again with --apply to perform the repair.',
    )
    return
  }

  try {
    await Promise.all([
      writeFile(paths.cargoToml, cargoNext, 'utf8'),
      writeFile(paths.assetCommand, assetNext, 'utf8'),
    ])

    runCargo(
      [
        'run',
        '-p',
        'hybrid-canvas-desktop',
        '--bin',
        'export-ipc-bindings',
      ],
      'Rust IPC binding exporter',
    )

    const generatedNext = await readFile(
      paths.generatedBindings,
      'utf8',
    )

    validateGeneratedBindings(generatedNext)
  } catch (error) {
    console.error(
      '\nApply failed. Restoring original files...',
    )

    const rollbackResults = await Promise.allSettled([
      writeFile(
        paths.cargoToml,
        cargoOriginal,
        'utf8',
      ),
      writeFile(
        paths.assetCommand,
        assetOriginal,
        'utf8',
      ),
      writeFile(
        paths.generatedBindings,
        generatedOriginal,
        'utf8',
      ),
    ])

    const rollbackFailed = rollbackResults.some(
      (result) => result.status === 'rejected',
    )

    if (rollbackFailed) {
      throw new Error(
        [
          error instanceof Error
            ? error.stack ?? error.message
            : String(error),
          '',
          'Rollback also failed. Inspect these files immediately:',
          paths.cargoToml,
          paths.assetCommand,
          paths.generatedBindings,
        ].join('\n'),
      )
    }

    throw error
  }

  console.log('')
  console.log(
    'Applied P0-C.2.2 asset IPC contract repair.',
  )
  console.log('')
  console.log('Completed:')
  console.log('- byteLength is a u32 / TypeScript number')
  console.log('- four asset commands use CommandResult')
  console.log('- generated asset IPC bindings are current')
  console.log(
    '- Cargo defaults to hybrid-canvas-desktop for Tauri dev',
  )
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
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm tauri dev')
  console.log('')
  console.log(
    'Commit generated bindings before running pnpm check:ipc.',
  )
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})