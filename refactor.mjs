#!/usr/bin/env node

/**
 * P0-C.2.1 — Repair and verify generated Native asset IPC bindings.
 *
 * Corrected for Windows:
 *   - never spawn pnpm.cmd
 *   - never use shell: true
 *   - invoke the Rust binding exporter through cargo directly
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
const rootArguments = argv.filter(
  (argument) => !argument.startsWith('--'),
)
const unknownOptions = argv.filter(
  (argument) =>
    argument.startsWith('--') &&
    argument !== '--apply' &&
    argument !== '--check',
)

if (unknownOptions.length > 0) {
  console.error(
    '\nP0-C.2.1 asset IPC binding repair failed:\n' +
      `Unknown option: ${unknownOptions.join(', ')}\n`,
  )
  process.exit(1)
}

if (rootArguments.length > 1) {
  console.error(
    '\nP0-C.2.1 asset IPC binding repair failed:\n' +
      'Only one optional repository root is accepted.\n',
  )
  process.exit(1)
}

if (apply && check) {
  console.error(
    '\nP0-C.2.1 asset IPC binding repair failed:\n' +
      'Use either --check or --apply, not both.\n',
  )
  process.exit(1)
}

if (!apply && !check) {
  console.error(
    '\nP0-C.2.1 asset IPC binding repair failed:\n' +
      'Missing mode. Use --check or --apply.\n',
  )
  process.exit(1)
}

const root = resolve(rootArguments[0] ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),

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
    `\nP0-C.2.1 asset IPC binding repair failed:\n${message}\n`,
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

function updateAssetCommand(source) {
  const obsoleteImport =
    'use crate::error::{Error, IpcError, Result};'

  const finalImport =
    'use crate::error::{Error, IpcError};'

  if (source.includes(finalImport)) {
    return source
  }

  return replaceOnce(
    source,
    obsoleteImport,
    finalImport,
    'remove unused Result import',
  )
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

  for (const fragment of [
    'crate::commands::asset::asset_session_open,',
    'crate::commands::asset::asset_upload,',
    'crate::commands::asset::asset_remove,',
    'crate::commands::asset::asset_session_close,',
  ]) {
    if (count(source, fragment) !== 1) {
      throw new Error(
        `Rust IPC exporter contains a duplicate: ${fragment}`,
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
        `Generated IPC surface is duplicated: ${fragment}`,
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
        `AssetUploadRequest is missing field: ${field}`,
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
        `AssetUploadResult is missing field: ${field}`,
      )
    }
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
      'AssetSessionResult is missing sessionToken.',
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
      'AssetRemoveRequest contract is incomplete.',
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

function runCargoBindingExporter() {
  const args = [
    'run',
    '-p',
    'hybrid-canvas-desktop',
    '--bin',
    'export-ipc-bindings',
  ]

  console.log('')
  console.log(`Running: cargo ${args.join(' ')}`)
  console.log('')

  /*
   * cargo is a native executable (cargo.exe on Windows), unlike pnpm.cmd.
   * Keep shell disabled so no arguments are concatenated or reinterpreted.
   */
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
        'Failed to start the Rust IPC binding exporter.',
        `Cause: ${result.error.message}`,
        'Ensure cargo is available in PATH.',
      ].join('\n'),
    )
  }

  if (result.signal) {
    throw new Error(
      `Rust IPC binding exporter terminated by ${result.signal}.`,
    )
  }

  if (result.status !== 0) {
    throw new Error(
      `Rust IPC binding exporter failed with code ${String(
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
    assetCommandOriginal,
    exporterOriginal,
    generatedOriginal,
  ] = await Promise.all([
    readFile(paths.assetCommand, 'utf8'),
    readFile(paths.exportBindings, 'utf8'),
    readFile(paths.generatedBindings, 'utf8'),
  ])

  validateRustExporter(exporterOriginal)

  const assetCommandNext =
    updateAssetCommand(assetCommandOriginal)

  let generatedIsCurrent = true

  try {
    validateGeneratedBindings(generatedOriginal)
  } catch {
    generatedIsCurrent = false
  }

  const commandChanged =
    assetCommandNext !== assetCommandOriginal

  if (!commandChanged && generatedIsCurrent) {
    console.log(
      'P0-C.2.1 asset IPC bindings are already repaired.',
    )
    return
  }

  console.log('P0-C.2.1 required repairs:')

  if (commandChanged) {
    console.log(
      '- remove the unused Result import from commands/asset.rs',
    )
  }

  if (!generatedIsCurrent) {
    console.log(
      '- regenerate asset commands and DTOs into ipc-bindings.ts',
    )
  }

  if (check) {
    console.log('')
    console.log('The apply operation will:')
    console.log(
      '- update commands/asset.rs in memory first;',
    )
    console.log(
      '- invoke cargo directly without pnpm.cmd;',
    )
    console.log(
      '- regenerate TypeScript from the Rust source of truth;',
    )
    console.log(
      '- validate all asset commands, DTOs and fields;',
    )
    console.log(
      '- restore both files if generation or validation fails;',
    )
    console.log('')
    console.log(
      'Run again with --apply to perform the repair.',
    )
    return
  }

  try {
    if (commandChanged) {
      await writeFile(
        paths.assetCommand,
        assetCommandNext,
        'utf8',
      )
    }

    runCargoBindingExporter()

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
        paths.assetCommand,
        assetCommandOriginal,
        'utf8',
      ),
      writeFile(
        paths.generatedBindings,
        generatedOriginal,
        'utf8',
      ),
    ])

    const rollbackFailures = rollbackResults.filter(
      (result) => result.status === 'rejected',
    )

    if (rollbackFailures.length > 0) {
      throw new Error(
        [
          error instanceof Error
            ? error.stack ?? error.message
            : String(error),
          '',
          'Rollback also failed. Inspect these files immediately:',
          paths.assetCommand,
          paths.generatedBindings,
        ].join('\n'),
      )
    }

    throw error
  }

  console.log('')
  console.log(
    'Applied P0-C.2.1 asset IPC binding repair.',
  )
  console.log('')
  console.log('Generated and validated:')
  console.log('- assetSessionOpen')
  console.log('- assetUpload')
  console.log('- assetRemove')
  console.log('- assetSessionClose')
  console.log('- AssetSessionResult')
  console.log('- AssetUploadRequest')
  console.log('- AssetUploadResult')
  console.log('- AssetRemoveRequest')
  console.log('- AssetSessionCloseRequest')
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
  console.log('')
  console.log(
    'Commit the generated binding before running pnpm check:ipc.',
  )
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})