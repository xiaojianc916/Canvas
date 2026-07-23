#!/usr/bin/env node

/**
 * P0-B.1 — Establish a single audited unsafe boundary for Windows atomic
 * replacement.
 *
 * Supports all known local states:
 *
 * 1. Original:
 *      #![forbid(unsafe_code)]
 *      mod atomic_write;
 *
 * 2. Previous intermediate script:
 *      #![deny(unsafe_code)]
 *      #[allow(unsafe_code)]
 *      mod atomic_write;
 *
 * 3. Final state:
 *      workspace unsafe_code = "deny"
 *      crate unsafe_code = deny
 *      only atomic_write may use unsafe
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply D:/xiaojianc/hybrid-canvas
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
  workspaceCargo: join(root, 'Cargo.toml'),
  nativeLib: join(
    root,
    'editor/persistence/native/src/lib.rs',
  ),
  atomicWrite: join(
    root,
    'editor/persistence/native/src/atomic_write.rs',
  ),
}

const finalAtomicModuleDeclaration = `#[allow(
    unsafe_code,
    reason = "Win32 atomic file replacement requires audited FFI",
)]
mod atomic_write;`

const safetyMarker =
  'source_wide and destination_wide are NUL-terminated UTF-16 buffers'

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

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1
}

function updateWorkspaceCargo(source) {
  const forbidPattern =
    /^unsafe_code\s*=\s*"forbid"\s*$/m
  const denyPattern =
    /^unsafe_code\s*=\s*"deny"\s*$/m

  if (denyPattern.test(source)) {
    if (forbidPattern.test(source)) {
      throw new Error(
        'Workspace Cargo.toml contains both deny and forbid unsafe policies.',
      )
    }

    return {
      changed: false,
      content: source,
    }
  }

  if (!forbidPattern.test(source)) {
    throw new Error(
      [
        'Workspace unsafe lint declaration was not found.',
        'Expected unsafe_code = "forbid" or unsafe_code = "deny".',
      ].join('\n'),
    )
  }

  const next = source.replace(
    forbidPattern,
    'unsafe_code = "deny"',
  )

  return {
    changed: next !== source,
    content: next,
  }
}

function updateNativeLib(source) {
  let next = source

  const crateForbidPattern =
    /^#!\[forbid\(unsafe_code\)\]\s*$/m

  const crateDenyPattern =
    /^#!\[deny\(unsafe_code\)\]\s*$/m

  if (crateForbidPattern.test(next)) {
    next = next.replace(
      crateForbidPattern,
      '#![deny(unsafe_code)]',
    )
  } else if (!crateDenyPattern.test(next)) {
    throw new Error(
      [
        'Native persistence crate unsafe policy was not recognized.',
        'Expected forbid(unsafe_code) or deny(unsafe_code).',
      ].join('\n'),
    )
  }

  const atomicModuleCount =
    countOccurrences(next, 'mod atomic_write;')

  if (atomicModuleCount !== 1) {
    throw new Error(
      [
        'Unexpected atomic_write module declaration count.',
        'Expected: 1',
        `Actual: ${atomicModuleCount}`,
      ].join('\n'),
    )
  }

  if (!next.includes(finalAtomicModuleDeclaration)) {
    /*
     * Normalize either:
     *
     *   mod atomic_write;
     *
     * or:
     *
     *   #[allow(unsafe_code)]
     *   mod atomic_write;
     *
     * or a previously formatted multiline allow attribute.
     */
    const atomicDeclarationPattern =
      /(?:#\[allow\(\s*unsafe_code(?:\s*,\s*reason\s*=\s*"[^"]*")?\s*\)\]\s*)?mod atomic_write;/

    if (!atomicDeclarationPattern.test(next)) {
      throw new Error(
        [
          'Could not normalize the atomic_write module declaration.',
          'The declaration exists but its surrounding attribute is unexpected.',
        ].join('\n'),
      )
    }

    next = next.replace(
      atomicDeclarationPattern,
      finalAtomicModuleDeclaration,
    )
  }

  if (crateForbidPattern.test(next)) {
    throw new Error(
      'Native lib.rs still contains forbid(unsafe_code).',
    )
  }

  if (!crateDenyPattern.test(next)) {
    throw new Error(
      'Native lib.rs does not deny unsafe code by default.',
    )
  }

  if (
    countOccurrences(next, 'mod atomic_write;') !== 1
  ) {
    throw new Error(
      'atomic_write must be declared exactly once.',
    )
  }

  if (
    !next.includes(finalAtomicModuleDeclaration)
  ) {
    throw new Error(
      'The final scoped unsafe declaration was not installed.',
    )
  }

  const unsafeAllowMatches =
    next.match(
      /#\[allow\([\s\S]*?unsafe_code[\s\S]*?\)\]/g,
    ) ?? []

  if (unsafeAllowMatches.length !== 1) {
    throw new Error(
      [
        'Unexpected number of unsafe allow attributes in native lib.rs.',
        'Expected: 1',
        `Actual: ${unsafeAllowMatches.length}`,
      ].join('\n'),
    )
  }

  return {
    changed: next !== source,
    content: next,
  }
}

function updateAtomicWrite(source) {
  if (!source.includes('ReplaceFileW(')) {
    throw new Error(
      'ReplaceFileW implementation was not found.',
    )
  }

  if (!source.includes('MoveFileExW(')) {
    throw new Error(
      'MoveFileExW implementation was not found.',
    )
  }

  if (!source.includes('MOVEFILE_WRITE_THROUGH')) {
    throw new Error(
      'MOVEFILE_WRITE_THROUGH was not found.',
    )
  }

  let next = source

  if (!next.includes(safetyMarker)) {
    const unsafeBoundaryPattern =
      /^(\s*)let replaced = unsafe \{/m

    const match = next.match(unsafeBoundaryPattern)

    if (!match) {
      throw new Error(
        'Windows replacement unsafe block was not found.',
      )
    }

    const indentation = match[1]

    const safetyContract = `${indentation}/*
${indentation} * SAFETY:
${indentation} *
${indentation} * - source_wide and destination_wide are NUL-terminated UTF-16 buffers;
${indentation} * - both buffers remain alive for the duration of the Win32 call;
${indentation} * - both pointers refer to contiguous initialized memory;
${indentation} * - the optional ReplaceFileW pointers are documented as nullable;
${indentation} * - source is a same-directory temporary file owned by this save;
${indentation} * - destination is retained by Native and never supplied by renderer IPC;
${indentation} * - the Win32 return value is checked before reporting success.
${indentation} */
${indentation}let replaced = unsafe {`

    next = next.replace(
      unsafeBoundaryPattern,
      safetyContract,
    )
  }

  const unsafeBlockCount =
    countOccurrences(next, 'unsafe {')

  if (unsafeBlockCount !== 1) {
    throw new Error(
      [
        'Unexpected number of unsafe blocks in atomic_write.rs.',
        'Expected: 1',
        `Actual: ${unsafeBlockCount}`,
      ].join('\n'),
    )
  }

  const forbiddenPatterns = [
    'remove_file(destination)',
    'copy(source, destination)',
    'truncate(true)',
    'delete destination',
  ]

  for (const pattern of forbiddenPatterns) {
    if (next.includes(pattern)) {
      throw new Error(
        `Forbidden non-atomic fallback detected: ${pattern}`,
      )
    }
  }

  return {
    changed: next !== source,
    content: next,
  }
}

function validateFinalState({
  workspaceCargo,
  nativeLib,
  atomicWrite,
}) {
  if (
    !/^unsafe_code\s*=\s*"deny"\s*$/m.test(
      workspaceCargo,
    )
  ) {
    throw new Error(
      'Workspace unsafe policy is not deny.',
    )
  }

  if (
    /^unsafe_code\s*=\s*"forbid"\s*$/m.test(
      workspaceCargo,
    )
  ) {
    throw new Error(
      'Workspace still contains unsafe_code = "forbid".',
    )
  }

  if (
    !/^#!\[deny\(unsafe_code\)\]\s*$/m.test(
      nativeLib,
    )
  ) {
    throw new Error(
      'Native persistence crate does not deny unsafe by default.',
    )
  }

  if (
    !nativeLib.includes(finalAtomicModuleDeclaration)
  ) {
    throw new Error(
      'atomic_write does not have the scoped unsafe permission.',
    )
  }

  if (
    countOccurrences(nativeLib, 'mod atomic_write;') !==
    1
  ) {
    throw new Error(
      'atomic_write module declaration is not unique.',
    )
  }

  if (
    !atomicWrite.includes(safetyMarker)
  ) {
    throw new Error(
      'Windows FFI safety contract is missing.',
    )
  }

  if (
    countOccurrences(atomicWrite, 'unsafe {') !== 1
  ) {
    throw new Error(
      'atomic_write must contain exactly one unsafe block.',
    )
  }

  if (
    !atomicWrite.includes('ReplaceFileW(') ||
    !atomicWrite.includes('MoveFileExW(') ||
    !atomicWrite.includes('MOVEFILE_WRITE_THROUGH')
  ) {
    throw new Error(
      'Windows atomic replacement implementation is incomplete.',
    )
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
      `Unexpected package name: ${String(packageJson.name)}`,
    )
  }

  for (const path of [
    paths.workspaceCargo,
    paths.nativeLib,
    paths.atomicWrite,
  ]) {
    if (!(await exists(path))) {
      throw new Error(
        `Required file was not found: ${path}`,
      )
    }
  }

  const [
    workspaceCargoSource,
    nativeLibSource,
    atomicWriteSource,
  ] = await Promise.all([
    readFile(paths.workspaceCargo, 'utf8'),
    readFile(paths.nativeLib, 'utf8'),
    readFile(paths.atomicWrite, 'utf8'),
  ])

  const workspaceCargoChange =
    updateWorkspaceCargo(workspaceCargoSource)

  const nativeLibChange =
    updateNativeLib(nativeLibSource)

  const atomicWriteChange =
    updateAtomicWrite(atomicWriteSource)

  validateFinalState({
    workspaceCargo: workspaceCargoChange.content,
    nativeLib: nativeLibChange.content,
    atomicWrite: atomicWriteChange.content,
  })

  const changes = [
    {
      path: paths.workspaceCargo,
      label: 'Cargo.toml',
      ...workspaceCargoChange,
    },
    {
      path: paths.nativeLib,
      label:
        'editor/persistence/native/src/lib.rs',
      ...nativeLibChange,
    },
    {
      path: paths.atomicWrite,
      label:
        'editor/persistence/native/src/atomic_write.rs',
      ...atomicWriteChange,
    },
  ]

  const changed = changes.filter(
    (change) => change.changed,
  )

  if (changed.length === 0) {
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
    console.log('Files to change:')

    for (const change of changed) {
      console.log(`- ${change.label}`)
    }

    console.log('')
    console.log('Result:')
    console.log(
      '- unsafe remains denied workspace-wide;',
    )
    console.log(
      '- only atomic_write may call unsafe FFI;',
    )
    console.log(
      '- exactly one unsafe block remains;',
    )
    console.log(
      '- no compatibility or fallback writer is added.',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the files.',
    )
    return
  }

  /*
   * All transformations and validations have completed before this point.
   * No file is written if any validation fails.
   */
  await Promise.all(
    changed.map((change) =>
      writeFile(change.path, change.content, 'utf8'),
    ),
  )

  console.log(
    'Applied the complete scoped Windows FFI boundary.',
  )
  console.log('')
  console.log('Changed:')

  for (const change of changed) {
    console.log(`- ${change.label}`)
  }

  console.log('')
  console.log('Required verification:')
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