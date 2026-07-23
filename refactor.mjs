#!/usr/bin/env node

/**
 * P0-B — Replace the existing native document replacement implementation with
 * platform-correct atomic replacement.
 *
 * Based on repository state after:
 *   0e7174d3f3f82d0d46ab04b839e5b0e823afe179
 *   e7f61fe5ed75a4385def6421e6cd31e57c1f45e5
 *
 * This script does not add another writer and does not retain the previous
 * generic replacement implementation.
 *
 * The one physical save algorithm remains:
 *
 *   same-directory unique temp
 *     -> write complete content
 *     -> sync temp file
 *     -> platform atomic replacement
 *     -> sync containing directory where supported
 *
 * Platform implementation:
 *
 *   Unix/macOS:
 *     rename(temp, destination)
 *
 *   Windows, destination exists:
 *     ReplaceFileW(destination, temp)
 *
 *   Windows, destination does not exist:
 *     MoveFileExW(temp, destination, MOVEFILE_WRITE_THROUGH)
 *
 * Forbidden:
 *
 *   delete destination -> rename
 *   copy temp -> destination
 *   truncate destination in place
 *   retry through a non-atomic fallback
 *   retain the old cross-platform std::fs::rename implementation
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply /path/to/Canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

if (apply && check) {
  fail('Use either --check or --apply, not both.')
}

if (!apply && !check) {
  fail('Missing mode. Use --check or --apply.')
}

const paths = {
  packageJson: join(root, 'package.json'),
  nativeCargo: join(
    root,
    'editor/persistence/native/Cargo.toml',
  ),
  atomicWrite: join(
    root,
    'editor/persistence/native/src/atomic_write.rs',
  ),
}

function fail(message) {
  console.error(
    `\nP0-B platform atomic replacement refactor failed:\n${message}\n`,
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

function replaceExactlyOnce(
  source,
  oldText,
  newText,
  description,
) {
  const firstIndex = source.indexOf(oldText)

  if (firstIndex === -1) {
    throw new Error(
      [
        `Expected source fragment was not found: ${description}`,
        'The repository may differ from the audited pushed state.',
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
  }

  const secondIndex = source.indexOf(
    oldText,
    firstIndex + oldText.length,
  )

  if (secondIndex !== -1) {
    throw new Error(
      `Expected exactly one source fragment: ${description}`,
    )
  }

  return (
    source.slice(0, firstIndex) +
    newText +
    source.slice(firstIndex + oldText.length)
  )
}

const oldModuleDocumentation = `//! Crash-safe replacement of a document file.
//!
//! The persistence contract has one save path on every supported platform:
//!
//! 1. Create a uniquely named temporary file in the destination directory.
//! 2. Write the complete document.
//! 3. Synchronize the temporary file.
//! 4. Rename the temporary file over the destination.
//! 5. Synchronize the containing directory where the platform supports it.
//!
//! Keeping the temporary file in the destination directory guarantees that the
//! replacement stays on one filesystem. If writing or replacement fails, the
//! original destination is left untouched and NamedTempFile removes the
//! temporary file during drop.`

const newModuleDocumentation = `//! Crash-safe replacement of a document file.
//!
//! The persistence contract has exactly one physical save algorithm:
//!
//! 1. Create a uniquely named temporary file in the destination directory.
//! 2. Write the complete document.
//! 3. Synchronize the temporary file.
//! 4. Atomically replace the destination with the platform primitive.
//! 5. Synchronize the containing directory where the platform supports it.
//!
//! Keeping the temporary file in the destination directory guarantees that the
//! replacement remains on one filesystem.
//!
//! There is deliberately no delete, copy, truncate or non-atomic fallback. If
//! the platform replacement fails, the existing destination remains untouched
//! and the save operation fails.`

const oldImports = `use crate::{Error, Result};
use std::io::Write;
use std::path::Path;`

const newImports = `use crate::{Error, Result};
use std::io::Write;
use std::path::Path;

#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::iter::once;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::ptr::{null, null_mut};
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::{
    MoveFileExW, ReplaceFileW, MOVEFILE_REPLACE_EXISTING,
    MOVEFILE_WRITE_THROUGH,
};

#[cfg(not(any(unix, windows)))]
compile_error!(
    "hybrid-canvas-file-native requires an audited atomic replacement \
     implementation for this platform"
);`

const oldReplacementImplementation = `/// Replaces destination with source.
///
/// Both paths are in the same parent directory, therefore they are on the same
/// filesystem. Rust's std::fs::rename is the single cross-platform replacement
/// primitive used by this persistence backend.
fn replace_destination(source: &Path, destination: &Path) -> Result<()> {
    std::fs::rename(source, destination)?;
    Ok(())
}`

const newReplacementImplementation = `/// Atomically replaces destination with source on Unix platforms.
///
/// The temporary file and destination are created in the same directory, so
/// rename remains on one filesystem. POSIX rename replaces an existing regular
/// destination atomically.
#[cfg(unix)]
fn replace_destination(source: &Path, destination: &Path) -> Result<()> {
    std::fs::rename(source, destination)?;
    Ok(())
}

/// Atomically installs or replaces destination on Windows.
///
/// ReplaceFileW is used when a destination already exists. It performs a
/// filesystem replacement rather than a delete-then-move sequence.
///
/// MoveFileExW is used only when creating a new destination. REPLACE_EXISTING
/// also closes the race where another process creates the destination after the
/// existence check. WRITE_THROUGH requests that the move is flushed before the
/// call returns.
///
/// No copy, delete, truncate or non-atomic fallback is allowed.
#[cfg(windows)]
fn replace_destination(source: &Path, destination: &Path) -> Result<()> {
    let source_wide = to_wide_path(source.as_os_str());
    let destination_wide = to_wide_path(destination.as_os_str());

    let replaced = unsafe {
        if destination.exists() {
            ReplaceFileW(
                destination_wide.as_ptr(),
                source_wide.as_ptr(),
                null(),
                0,
                null_mut(),
                null_mut(),
            )
        } else {
            MoveFileExW(
                source_wide.as_ptr(),
                destination_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        }
    };

    if replaced == 0 {
        return Err(std::io::Error::last_os_error().into());
    }

    Ok(())
}

#[cfg(windows)]
fn to_wide_path(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(once(0)).collect()
}`

const oldDirectoryDocumentation = `/// Synchronizes directory metadata after a successful rename where supported.
///
/// Windows does not provide a portable std::fs directory synchronization API.
/// The file itself is already synchronized before replacement. The replacement
/// remains a single operation; no backup/delete/copy fallback is used.`

const newDirectoryDocumentation = `/// Synchronizes directory metadata after a successful replacement where
/// supported.
///
/// Unix directory synchronization persists the renamed directory entry.
///
/// Windows does not expose a portable directory fsync through std. The temporary
/// file is synchronized before replacement, ReplaceFileW is a single filesystem
/// operation, and new-file MoveFileExW uses MOVEFILE_WRITE_THROUGH.`

const windowsCargoSection = `
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.61.2", features = [
  "Win32_Storage_FileSystem",
] }
`

function updateAtomicWrite(source) {
  if (
    source.includes('#[cfg(windows)]') &&
    source.includes('ReplaceFileW(') &&
    source.includes('MoveFileExW(') &&
    source.includes('MOVEFILE_WRITE_THROUGH') &&
    !source.includes(
      "Rust's std::fs::rename is the single cross-platform",
    )
  ) {
    return {
      changed: false,
      content: source,
    }
  }

  let next = replaceExactlyOnce(
    source,
    oldModuleDocumentation,
    newModuleDocumentation,
    'replace atomic-write module contract',
  )

  next = replaceExactlyOnce(
    next,
    oldImports,
    newImports,
    'add platform atomic replacement imports',
  )

  next = replaceExactlyOnce(
    next,
    oldReplacementImplementation,
    newReplacementImplementation,
    'remove generic replacement and install platform implementations',
  )

  next = replaceExactlyOnce(
    next,
    oldDirectoryDocumentation,
    newDirectoryDocumentation,
    'update directory synchronization contract',
  )

  if (
    next.includes(
      "Rust's std::fs::rename is the single cross-platform",
    )
  ) {
    throw new Error(
      'The old generic replacement implementation was not fully removed.',
    )
  }

  if (
    next.includes('remove_file(destination)') ||
    next.includes('copy(source, destination)') ||
    next.includes('File::create(destination)')
  ) {
    throw new Error(
      'A forbidden non-atomic replacement fallback was detected.',
    )
  }

  return {
    changed: true,
    content: next,
  }
}

function updateNativeCargo(source) {
  if (source.includes("[target.'cfg(windows)'.dependencies]")) {
    if (
      source.includes('windows-sys') &&
      source.includes('"Win32_Storage_FileSystem"')
    ) {
      return {
        changed: false,
        content: source,
      }
    }

    throw new Error(
      [
        'The native persistence crate already has a different Windows dependency section.',
        'Refusing to merge dependency definitions automatically.',
      ].join('\n'),
    )
  }

  const normalized = source.endsWith('\n')
    ? source
    : `${source}\n`

  return {
    changed: true,
    content: normalized + windowsCargoSection,
  }
}

async function main() {
  if (!(await exists(paths.packageJson))) {
    throw new Error(
      [
        `Canvas repository root was not found: ${root}`,
        'Run this script from the repository root or pass its path.',
      ].join('\n'),
    )
  }

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected repository package name: ${String(packageJson.name)}`,
    )
  }

  for (const path of [
    paths.nativeCargo,
    paths.atomicWrite,
  ]) {
    if (!(await exists(path))) {
      throw new Error(`Required file was not found: ${path}`)
    }
  }

  const [cargoSource, atomicWriteSource] = await Promise.all([
    readFile(paths.nativeCargo, 'utf8'),
    readFile(paths.atomicWrite, 'utf8'),
  ])

  const atomicWriteChange = updateAtomicWrite(
    atomicWriteSource,
  )

  const cargoChange = updateNativeCargo(cargoSource)

  if (!atomicWriteChange.changed && !cargoChange.changed) {
    console.log(
      'P0-B platform atomic replacement is already applied.',
    )
    return
  }

  if (check) {
    console.log(
      'P0-B platform atomic replacement is safe to apply.',
    )
    console.log('')
    console.log('It will:')
    console.log(
      '- remove the generic cross-platform std::fs::rename replacement;',
    )
    console.log(
      '- use POSIX rename on Unix and macOS;',
    )
    console.log(
      '- use ReplaceFileW for existing Windows documents;',
    )
    console.log(
      '- use MoveFileExW with WRITE_THROUGH for new Windows documents;',
    )
    console.log(
      '- reject unsupported platforms at compile time;',
    )
    console.log(
      '- keep exactly one physical writer and no fallback path;',
    )
    console.log('')
    console.log('It will not:')
    console.log('- change the .draw format;')
    console.log('- add another writer;')
    console.log('- add compatibility parsing;')
    console.log('- add recovery, lock or watcher scaffolding;')
    console.log('')
    console.log('Run again with --apply to write the changes.')
    return
  }

  await Promise.all([
    atomicWriteChange.changed
      ? writeFile(
          paths.atomicWrite,
          atomicWriteChange.content,
          'utf8',
        )
      : Promise.resolve(),

    cargoChange.changed
      ? writeFile(
          paths.nativeCargo,
          cargoChange.content,
          'utf8',
        )
      : Promise.resolve(),
  ])

  console.log(
    'Applied the single platform-correct atomic replacement path.',
  )
  console.log('')
  console.log('Changed:')
  console.log(
    '- editor/persistence/native/src/atomic_write.rs',
  )
  console.log(
    '- editor/persistence/native/Cargo.toml',
  )
  console.log('')
  console.log('Required verification:')
  console.log('  cargo fmt --all')
  console.log(
    '  cargo check -p hybrid-canvas-file-native --all-targets',
  )
  console.log(
    '  cargo test -p hybrid-canvas-file-native',
  )
  console.log(
    '  cargo clippy -p hybrid-canvas-file-native --all-targets -- -D warnings',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm lint')
  console.log('  pnpm test')
  console.log('')
  console.log(
    'The Windows replacement path must also pass CI or verification on a real Windows runner.',
  )
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})