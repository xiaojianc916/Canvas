#!/usr/bin/env node
/**
 * P0 persistence foundation cleanup.
 *
 * Remove native persistence modules that are currently only stubs or whose
 * protocol has no writer:
 *
 * - container.rs: ZIP container stub
 * - lock.rs: locking stub
 * - watcher.rs: watcher stub
 * - recovery.rs: restores .draw.backup, but no save path creates backups
 *
 * The repository is left with one honest physical persistence protocol:
 *
 *   canonical v1 JSON -> native atomic_write
 *
 * This is intentionally a prerequisite for the real v2 archive refactor.
 * Do not claim ZIP/assets/recovery support until the complete reader + writer
 * + manifest + tests land in one coherent change.
 *
 * Usage:
 *   node refactor-p0-remove-fake-native-persistence-layer.mjs --check
 *   node refactor-p0-remove-fake-native-persistence-layer.mjs --apply
 *   node refactor-p0-remove-fake-native-persistence-layer.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import { access, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),
  fileDomain: join(root, 'editor/persistence/src/domain/file.ts'),
  nativeLib: join(root, 'editor/persistence/native/src/lib.rs'),
  nativeContainer: join(root, 'editor/persistence/native/src/container.rs'),
  nativeLock: join(root, 'editor/persistence/native/src/lock.rs'),
  nativeRecovery: join(root, 'editor/persistence/native/src/recovery.rs'),
  nativeWatcher: join(root, 'editor/persistence/native/src/watcher.rs'),
}

function fail(message) {
  console.error(`\nNative persistence cleanup failed:\n${message}\n`)
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

function replaceExactly(source, oldText, newText, description) {
  if (!source.includes(oldText)) {
    throw new Error(
      [
        `Expected source fragment was not found: ${description}`,
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
  }

  const next = source.replace(oldText, newText)

  if (next === source) {
    throw new Error(`Replacement produced no change: ${description}`)
  }

  return next
}

async function main() {
  if (!(await exists(paths.packageJson))) {
    fail(
      [
        `Repository root was not found: ${root}`,
        'Run in the Hybrid Canvas repository root or pass that path explicitly.',
      ].join('\n'),
    )
    return
  }

  for (const [name, path] of Object.entries(paths)) {
    if (name === 'packageJson') {
      continue
    }

    if (!(await exists(path))) {
      fail(`Required path does not exist: ${path}`)
      return
    }
  }

  try {
    const [fileDomain, nativeLib] = await Promise.all([
      readFile(paths.fileDomain, 'utf8'),
      readFile(paths.nativeLib, 'utf8'),
    ])

    const oldFileProtocolComment = `/*
 * Format evolution:
 *
 * v1 (current) — Pure JSON file containing DrawFileContainer.
 *   Pros: simple, human-readable, easy to debug.
 *   Cons: assets stored as base64 in TLStoreSnapshot (bloat).
 *
 * v2 (planned) — ZIP container:
 *   - manifest.json (DrawFileHeader + asset index)
 *   - snapshot.json (TLStoreSnapshot)
 *   - assets/ (binary files by asset id)
 *   .tmp atomic write pattern already implemented in Rust.
 *
 * Migration: v1 files should be openable by v2 reader (check file header).
 *   v2 adds ZIP envelope, keeps inner snapshot.json identical.
 */`

    const newFileProtocolComment = `/*
 * Physical persistence protocol — v1.
 *
 * A .draw file is UTF-8 JSON containing DrawFileContainer. The renderer owns
 * the logical tldraw snapshot; native code owns filesystem capability checks,
 * document-size limits and atomic replacement.
 *
 * There is deliberately no declared v2 archive protocol yet. ZIP containers,
 * binary assets, journal recovery, locking and file watching must be introduced
 * together as one native DocumentCodec transaction, with a real reader, writer,
 * manifest schema, migration fixtures and platform tests.
 *
 * Do not add a partial archive reader, writer or compatibility fallback here.
 */`

    const nextFileDomain = replaceExactly(
      fileDomain,
      oldFileProtocolComment,
      newFileProtocolComment,
      'replace unimplemented v2 archive claim with the actual v1 protocol',
    )

    let nextNativeLib = nativeLib

    for (const fragment of [
      'mod container;\n',
      'mod lock;\n',
      'mod recovery;\n',
      'mod watcher;\n',
      'pub use recovery::{recover_directory, RecoveryAction};\n',
    ]) {
      nextNativeLib = replaceExactly(
        nextNativeLib,
        fragment,
        '',
        `remove fake native persistence module/export: ${fragment.trim()}`,
      )
    }

    const oldNativeOverview = `//! Planned responsibilities:
//! - atomic writes (write → fsync → rename)
//! - .draw container archive (deflate, async zip)
//! - file locking and conflict detection
//! - file-system watcher
//! - recovery from partial writes
//!
//! @architecture-stub: Phase 1–2.`

    const newNativeOverview = `//! Current responsibility:
//! - atomic replacement of an already-validated logical .draw payload
//!
//! Archive containers, binary asset storage, advisory locking, external-change
//! watching and recovery journals are intentionally absent until they can be
//! delivered as one complete, tested native DocumentCodec protocol.`

    nextNativeLib = replaceExactly(
      nextNativeLib,
      oldNativeOverview,
      newNativeOverview,
      'replace false native persistence roadmap',
    )

    if (!apply) {
      console.log('Safe to remove fake native persistence modules:')
      console.log('- ZIP container stub')
      console.log('- File-locking stub')
      console.log('- File-watcher stub')
      console.log('- Backup recovery protocol without a writer')
      console.log('')
      console.log('The resulting repository will truthfully expose v1 JSON + atomic write only.')
      console.log('Run again with --apply to make the changes.')
      return
    }

    await Promise.all([
      writeFile(paths.fileDomain, nextFileDomain, 'utf8'),
      writeFile(paths.nativeLib, nextNativeLib, 'utf8'),
    ])

    await Promise.all([
      rm(paths.nativeContainer),
      rm(paths.nativeLock),
      rm(paths.nativeRecovery),
      rm(paths.nativeWatcher),
    ])

    console.log('Removed fake native persistence architecture.')
    console.log('')
    console.log('Required verification:')
    console.log('  cargo fmt --check')
    console.log('  cargo check --workspace --all-targets')
    console.log('  cargo test --workspace --all-features')
    console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')
    console.log('  pnpm typecheck')
    console.log('  pnpm lint')
    console.log('  pnpm test')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

await main()