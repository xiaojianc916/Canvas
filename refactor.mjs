#!/usr/bin/env node

/**
 * P0-B.1 — Confine Windows atomic-replacement FFI to the atomic_write module.
 *
 * Current repository state uses:
 *
 *   #![forbid(unsafe_code)]
 *
 * while atomic_write.rs calls ReplaceFileW / MoveFileExW through unsafe FFI.
 * `forbid` cannot be lowered by a module-level allow, so Windows builds fail.
 *
 * This refactor establishes:
 *
 *   crate default: deny unsafe
 *   atomic_write: explicitly allowed unsafe
 *   every other module: unsafe remains denied
 *
 * No compatibility path, fallback writer or second implementation is added.
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
  nativeLib: join(
    root,
    'editor/persistence/native/src/lib.rs',
  ),
  atomicWrite: join(
    root,
    'editor/persistence/native/src/atomic_write.rs',
  ),
}

function fail(message) {
  console.error(
    `\nP0-B.1 scoped Windows FFI refactor failed:\n${message}\n`,
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
        'The repository may differ from commit 72144a1.',
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

function updateNativeLib(source) {
  const alreadyApplied =
    source.startsWith('#![deny(unsafe_code)]') &&
    source.includes(
      '#[allow(unsafe_code)]\nmod atomic_write;',
    ) &&
    !source.includes('#![forbid(unsafe_code)]')

  if (alreadyApplied) {
    return {
      changed: false,
      content: source,
    }
  }

  let next = replaceExactlyOnce(
    source,
    '#![forbid(unsafe_code)]',
    '#![deny(unsafe_code)]',
    'replace unscopable crate-level unsafe prohibition',
  )

  next = replaceExactlyOnce(
    next,
    `mod atomic_write;
mod document_codec;
mod error;`,
    `// Windows atomic replacement requires direct calls to ReplaceFileW and
// MoveFileExW. Keep that unsafe boundary confined to this module.
#[allow(unsafe_code)]
mod atomic_write;

mod document_codec;
mod error;`,
    'confine unsafe FFI to atomic_write',
  )

  if (next.includes('#![forbid(unsafe_code)]')) {
    throw new Error(
      'The unscopable forbid(unsafe_code) attribute was not removed.',
    )
  }

  const allowedModules = [
    '#[allow(unsafe_code)]\nmod atomic_write;',
  ]

  for (const allowedModule of allowedModules) {
    if (!next.includes(allowedModule)) {
      throw new Error(
        'The atomic_write unsafe boundary was not installed.',
      )
    }
  }

  if (
    next.includes(
      '#[allow(unsafe_code)]\nmod document_codec;',
    ) ||
    next.includes('#[allow(unsafe_code)]\nmod error;')
  ) {
    throw new Error(
      'Unsafe permission escaped the atomic_write module.',
    )
  }

  return {
    changed: true,
    content: next,
  }
}

function updateAtomicWrite(source) {
  if (!source.includes('let replaced = unsafe {')) {
    throw new Error(
      [
        'Expected Windows FFI unsafe block was not found.',
        'Apply the platform atomic replacement refactor first.',
      ].join('\n'),
    )
  }

  if (
    source.includes(
      '// SAFETY: source_wide and destination_wide are NUL-terminated',
    )
  ) {
    return {
      changed: false,
      content: source,
    }
  }

  const oldUnsafeBoundary = `    let replaced = unsafe {
        if destination.exists() {`

  const newUnsafeBoundary = `    /*
     * SAFETY:
     *
     * - source_wide and destination_wide are NUL-terminated UTF-16 buffers;
     * - both buffers remain alive for the complete FFI call;
     * - source and destination are local paths selected or retained by Native;
     * - the temporary source is created in the destination directory;
     * - null backup/exclusion/reserved pointers are permitted by the APIs;
     * - the return value is checked before reporting success;
     * - no Rust reference aliases memory owned or mutated by Win32.
     */
    let replaced = unsafe {
        if destination.exists() {`

  const next = replaceExactlyOnce(
    source,
    oldUnsafeBoundary,
    newUnsafeBoundary,
    'document Windows atomic-replacement safety invariants',
  )

  const unsafeCount =
    next.split('unsafe {').length - 1

  if (unsafeCount !== 1) {
    throw new Error(
      [
        'Unexpected number of unsafe blocks in atomic_write.rs.',
        `Expected: 1`,
        `Actual: ${unsafeCount}`,
      ].join('\n'),
    )
  }

  if (
    next.includes('std::fs::remove_file(destination)') ||
    next.includes('std::fs::copy(source, destination)')
  ) {
    throw new Error(
      'A forbidden non-atomic fallback was detected.',
    )
  }

  return {
    changed: true,
    content: next,
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
    paths.nativeLib,
    paths.atomicWrite,
  ]) {
    if (!(await exists(path))) {
      throw new Error(`Required file was not found: ${path}`)
    }
  }

  const [nativeLibSource, atomicWriteSource] =
    await Promise.all([
      readFile(paths.nativeLib, 'utf8'),
      readFile(paths.atomicWrite, 'utf8'),
    ])

  if (
    !atomicWriteSource.includes('ReplaceFileW(') ||
    !atomicWriteSource.includes('MoveFileExW(')
  ) {
    throw new Error(
      [
        'Platform atomic replacement is not present.',
        'This script expects repository state after commit 72144a1.',
      ].join('\n'),
    )
  }

  const nativeLibChange = updateNativeLib(
    nativeLibSource,
  )

  const atomicWriteChange = updateAtomicWrite(
    atomicWriteSource,
  )

  if (
    !nativeLibChange.changed &&
    !atomicWriteChange.changed
  ) {
    console.log(
      'P0-B.1 scoped Windows FFI boundary is already applied.',
    )
    return
  }

  if (check) {
    console.log(
      'P0-B.1 scoped Windows FFI boundary is safe to apply.',
    )
    console.log('')
    console.log('It will:')
    console.log(
      '- keep unsafe denied by default in the native persistence crate;',
    )
    console.log(
      '- allow unsafe only inside atomic_write;',
    )
    console.log(
      '- document all Win32 pointer and lifetime invariants;',
    )
    console.log(
      '- verify that atomic_write contains exactly one unsafe block;',
    )
    console.log(
      '- reject delete/copy replacement fallbacks;',
    )
    console.log('')
    console.log('It will not:')
    console.log('- add a writer;')
    console.log('- add a compatibility path;')
    console.log('- change the .draw format;')
    console.log('- change IPC contracts;')
    console.log('- widen unsafe to DocumentCodec or errors;')
    console.log('')
    console.log(
      'Run again with --apply to write the changes.',
    )
    return
  }

  await Promise.all([
    nativeLibChange.changed
      ? writeFile(
          paths.nativeLib,
          nativeLibChange.content,
          'utf8',
        )
      : Promise.resolve(),

    atomicWriteChange.changed
      ? writeFile(
          paths.atomicWrite,
          atomicWriteChange.content,
          'utf8',
        )
      : Promise.resolve(),
  ])

  console.log(
    'Applied the scoped Windows FFI safety boundary.',
  )
  console.log('')
  console.log('Changed:')
  console.log(
    '- editor/persistence/native/src/lib.rs',
  )
  console.log(
    '- editor/persistence/native/src/atomic_write.rs',
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
  console.log('')
  console.log(
    'Also run the same check, test and clippy commands on Windows.',
  )
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})