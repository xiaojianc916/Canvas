#!/usr/bin/env node

/**
 * P0-B.1.1 — Fix decoded v2 asset byte ownership.
 *
 * Required base:
 *   f8218a4e604bab5cc83f8c91bf85931c09d44793
 *
 * This fixes the Rust type mismatch:
 *
 *   expected Vec<u8>, found &[u8]
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
  'P0-B.1.1 v2 decoded asset ownership repair'

function fail(message) {
  console.error(`\n${STEP_NAME} failed:\n${message}\n`)
  process.exit(1)
}

function parseArguments(argv) {
  let mode = null
  let rootArgument = null

  for (const argument of argv) {
    if (argument === '--check' || argument === '--apply') {
      if (mode !== null) {
        fail(
          `Exactly one execution mode is required.\n` +
            `Received both "${mode}" and "${argument}".`,
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
        `Only one repository path may be supplied.\n` +
          `Unexpected argument: ${argument}`,
      )
    }

    rootArgument = argument
  }

  if (mode === null) {
    fail(
      'Missing execution mode.\n' +
        'Use either --check or --apply.',
    )
  }

  return {
    mode,
    root: resolve(rootArgument ?? process.cwd()),
  }
}

const { mode, root } = parseArguments(
  process.argv.slice(2),
)

const paths = {
  packageJson: join(root, 'package.json'),
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
      'Internal error: cannot count an empty fragment.',
    )
  }

  let count = 0
  let offset = 0

  while (true) {
    const index = source.indexOf(fragment, offset)

    if (index < 0) {
      return count
    }

    count += 1
    offset = index + fragment.length
  }
}

const baselineFragment = `        decoded_assets.push(DrawAssetOutput {
            content_hash: asset.content_hash.clone(),
            content_type: asset.content_type.clone(),
            bytes: content.clone(),
        });`

const finalFragment = `        decoded_assets.push(DrawAssetOutput {
            content_hash: asset.content_hash.clone(),
            content_type: asset.content_type.clone(),
            bytes: content.to_vec(),
        });`

function updateCodec(source) {
  const baselineCount = countOccurrences(
    source,
    baselineFragment,
  )

  const finalCount = countOccurrences(
    source,
    finalFragment,
  )

  if (baselineCount === 1 && finalCount === 0) {
    return source.replace(
      baselineFragment,
      finalFragment,
    )
  }

  if (baselineCount === 0 && finalCount === 1) {
    return source
  }

  throw new Error(
    [
      'Unexpected v2 decoder state.',
      '',
      'Expected exactly one of:',
      '- the audited content.clone() baseline; or',
      '- the already-fixed content.to_vec() implementation.',
      '',
      `content.clone() baseline count: ${baselineCount}`,
      `content.to_vec() final count: ${finalCount}`,
      '',
      'Refusing an ambiguous or partial modification.',
    ].join('\n'),
  )
}

function validateRepository(packageJson) {
  let parsed

  try {
    parsed = JSON.parse(
      packageJson.replace(/^\uFEFF/, ''),
    )
  } catch (error) {
    throw new Error(
      `Root package.json is invalid JSON: ${String(error)}`,
    )
  }

  if (parsed.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected root package name: ${String(
        parsed.name,
      )}`,
    )
  }
}

function validateCodecPrerequisites(source) {
  const requiredFragments = [
    'pub struct DrawAssetOutput',
    'pub bytes: Vec<u8>',
    'pub fn decode_draw_document_v2',
    'let content = require_entry(&entries, &asset.path)?;',
    'decoded_assets.push(DrawAssetOutput {',
    'sha256(content) != asset.content_hash',
  ]

  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Required v2 codec prerequisite is missing: ${fragment}`,
      )
    }
  }
}

function validateFinal(source) {
  const finalCount = countOccurrences(
    source,
    finalFragment,
  )

  if (finalCount !== 1) {
    throw new Error(
      [
        'Final decoded asset conversion is invalid.',
        `Expected occurrence count: 1`,
        `Actual occurrence count: ${finalCount}`,
      ].join('\n'),
    )
  }

  if (source.includes('bytes: content.clone(),')) {
    throw new Error(
      'Obsolete &[u8] clone remains in decoded asset output.',
    )
  }

  const outputDeclaration =
    /pub struct DrawAssetOutput\s*\{[\s\S]*?pub bytes: Vec<u8>,[\s\S]*?\}/u

  if (!outputDeclaration.test(source)) {
    throw new Error(
      'DrawAssetOutput no longer owns its decoded bytes.',
    )
  }

  const decodeFunction =
    /pub fn decode_draw_document_v2\s*\(/u

  if (!decodeFunction.test(source)) {
    throw new Error(
      'The v2 decoder entry point is missing.',
    )
  }

  for (const forbidden of [
    'bytes: content.as_ptr()',
    'bytes: unsafe',
    'std::mem::transmute',
    'Vec::from_raw_parts',
  ]) {
    if (source.includes(forbidden)) {
      throw new Error(
        `Unsafe decoded-byte workaround detected: ${forbidden}`,
      )
    }
  }
}

async function restoreFile(path, original) {
  try {
    await writeFile(path, original, 'utf8')
  } catch (restoreError) {
    throw new AggregateError(
      [restoreError],
      'The codec update failed and the original file could not be restored.',
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

  const [packageJson, codecOriginal] =
    await Promise.all([
      readFile(paths.packageJson, 'utf8'),
      readFile(paths.codec, 'utf8'),
    ])

  validateRepository(packageJson)
  validateCodecPrerequisites(codecOriginal)

  const codecFinal = updateCodec(codecOriginal)

  validateFinal(codecFinal)

  if (codecFinal === codecOriginal) {
    console.log(
      `${STEP_NAME} is already applied.`,
    )
    return
  }

  const relativeCodec = paths.codec.slice(
    root.length + 1,
  )

  console.log(`${STEP_NAME} will update:`)
  console.log(`- ${relativeCodec}`)
  console.log('')
  console.log('It will:')
  console.log(
    '- convert decoded ZIP asset bytes from &[u8] to an owned Vec<u8>;',
  )
  console.log(
    '- preserve the validated ZIP entry buffer as the copy source;',
  )
  console.log(
    '- avoid unsafe lifetime or raw-pointer workarounds;',
  )
  console.log(
    '- leave the v2 container format unchanged;',
  )
  console.log(
    '- leave the existing file untouched if validation fails.',
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
      paths.codec,
      codecFinal,
      'utf8',
    )

    const writtenCodec = await readFile(
      paths.codec,
      'utf8',
    )

    if (writtenCodec !== codecFinal) {
      throw new Error(
        'The written codec does not match the validated output.',
      )
    }

    validateFinal(writtenCodec)
  } catch (error) {
    console.error(
      '\nApply failed. Restoring the original codec...',
    )

    await restoreFile(
      paths.codec,
      codecOriginal,
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
  console.log('  pnpm tauri dev')
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})