#!/usr/bin/env node

/**
 * P0-C.6.3.1 — Fix TLAsset meta index-signature access.
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
  'P0-C.6.3.1 TLAsset meta access repair'

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

  adapter: join(
    root,
    'platforms',
    'desktop-runtime',
    'src',
    'adapters',
    'assets',
    'native-tl-asset-store.ts',
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

function replaceRequired(
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
      `Unexpected source state: ${description}`,
      `Baseline count: ${baselineCount}`,
      `Final count: ${finalCount}`,
      'Expected exactly one baseline or one already-fixed expression.',
      'Refusing an ambiguous modification.',
    ].join('\n'),
  )
}

function updateAdapter(source) {
  let result = source

  result = replaceRequired(
    result,
    `asset.meta?.hybridCanvasAssetToken`,
    `asset.meta?.['hybridCanvasAssetToken']`,
    'hybridCanvasAssetToken index access',
  )

  result = replaceRequired(
    result,
    `asset.meta?.hybridCanvasContentHash`,
    `asset.meta?.['hybridCanvasContentHash']`,
    'hybridCanvasContentHash index access',
  )

  return result
}

function validateRepository(packageJson) {
  let parsed

  try {
    parsed = JSON.parse(
      packageJson.replace(/^\uFEFF/u, ''),
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

function validatePrerequisites(source) {
  for (const fragment of [
    'function persistedAssetToken(',
    'asset: TLAsset',
    'hybridCanvasAssetToken',
    'hybridCanvasContentHash',
    'contentHash !== token',
  ]) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Expected adapter prerequisite is missing: ${fragment}`,
      )
    }
  }
}

function validateFinal(source) {
  const required = [
    `asset.meta?.['hybridCanvasAssetToken']`,
    `asset.meta?.['hybridCanvasContentHash']`,
  ]

  for (const fragment of required) {
    if (
      countOccurrences(source, fragment) !== 1
    ) {
      throw new Error(
        `Expected exactly one final expression: ${fragment}`,
      )
    }
  }

  for (const obsolete of [
    'asset.meta?.hybridCanvasAssetToken',
    'asset.meta?.hybridCanvasContentHash',
  ]) {
    if (source.includes(obsolete)) {
      throw new Error(
        `Obsolete index-signature access remains: ${obsolete}`,
      )
    }
  }

  for (const forbidden of [
    'as any',
    'as unknown as',
    '// @ts-ignore',
    '// @ts-expect-error',
  ]) {
    if (source.includes(forbidden)) {
      throw new Error(
        `Type-check suppression is not allowed: ${forbidden}`,
      )
    }
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
    adapterOriginal,
  ] = await Promise.all([
    readFile(paths.packageJson, 'utf8'),
    readFile(paths.adapter, 'utf8'),
  ])

  validateRepository(packageJson)
  validatePrerequisites(adapterOriginal)

  const adapterFinal =
    updateAdapter(adapterOriginal)

  validateFinal(adapterFinal)

  if (adapterFinal === adapterOriginal) {
    console.log(
      `${STEP_NAME} is already applied.`,
    )
    return
  }

  console.log(`${STEP_NAME} will update:`)
  console.log(
    `- ${paths.adapter.slice(root.length + 1)}`,
  )
  console.log('')
  console.log('It will:')
  console.log(
    '- use bracket access for TLAsset meta index signatures;',
  )
  console.log(
    '- fix both TS4111 diagnostics;',
  )
  console.log(
    '- add no casts, suppressions or compatibility code.',
  )

  if (mode === '--check') {
    console.log('')
    console.log(
      'Check completed. No files were written.',
    )
    return
  }

  try {
    await writeFile(
      paths.adapter,
      adapterFinal,
      'utf8',
    )

    const written = await readFile(
      paths.adapter,
      'utf8',
    )

    if (written !== adapterFinal) {
      throw new Error(
        'Written adapter differs from validated output.',
      )
    }

    validateFinal(written)
  } catch (error) {
    console.error(
      '\nApply failed. Restoring original adapter...',
    )

    await writeFile(
      paths.adapter,
      adapterOriginal,
      'utf8',
    )

    throw error
  }

  console.log('')
  console.log(`Applied ${STEP_NAME}.`)
  console.log('')
  console.log('Required verification:')
  console.log('  pnpm format')
  console.log('  pnpm lint')
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