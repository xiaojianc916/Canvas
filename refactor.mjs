#!/usr/bin/env node
/**
 * Fix exactOptionalPropertyTypes for tldraw createTLStore({ snapshot }).
 *
 * Invalid:
 *   snapshot: options.initialSnapshot
 *
 * When initialSnapshot is undefined, this explicitly supplies `snapshot:
 * undefined`, which is rejected by exactOptionalPropertyTypes.
 *
 * Correct:
 *   ...(options.initialSnapshot
 *     ? { snapshot: options.initialSnapshot }
 *     : {})
 *
 * Usage:
 *   node fix-tldraw-snapshot-optional-property.mjs --check
 *   node fix-tldraw-snapshot-optional-property.mjs --apply
 *   node fix-tldraw-snapshot-optional-property.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const relativePath = 'editor/core/src/runtime/editor-session.ts'
const targetPath = join(root, relativePath)

const oldFragment = `    bindingUtils: [...defaultBindingUtils, ...registration.bindingUtils],
    snapshot: options.initialSnapshot,
  })`

const newFragment = `    bindingUtils: [...defaultBindingUtils, ...registration.bindingUtils],
    ...(options.initialSnapshot
      ? { snapshot: options.initialSnapshot }
      : {}),
  })`

function fail(message) {
  console.error(`\ntldraw optional snapshot fix failed:\n${message}\n`)
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

async function main() {
  if (!(await exists(join(root, 'package.json')))) {
    fail(
      [
        `Repository root was not found: ${root}`,
        'Run from the Hybrid Canvas repository root or pass its path explicitly.',
      ].join('\n'),
    )
    return
  }

  if (!(await exists(targetPath))) {
    fail(`Target file was not found: ${relativePath}`)
    return
  }

  const source = await readFile(targetPath, 'utf8')

  if (source.includes(newFragment)) {
    console.log(`Already fixed: ${relativePath}`)
    return
  }

  if (!source.includes(oldFragment)) {
    fail(
      [
        'Expected createTLStore snapshot fragment was not found.',
        'The source may differ from the previous snapshot-pipeline refactor.',
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
    return
  }

  if (!apply) {
    console.log(`Safe to fix optional tldraw snapshot property: ${relativePath}`)
    console.log('Run again with --apply to write the change.')
    return
  }

  await writeFile(
    targetPath,
    source.replace(oldFragment, newFragment),
    'utf8',
  )

  console.log(`Applied exactOptionalPropertyTypes-safe snapshot handling: ${relativePath}`)
  console.log('')
  console.log('Verify:')
  console.log('  pnpm --filter @hybrid-canvas/canvas typecheck')
  console.log('  pnpm --filter @hybrid-canvas/test-cross-domain-contract test')
  console.log('  pnpm typecheck')
  console.log('  pnpm lint')
  console.log('  pnpm test')
}

await main()