#!/usr/bin/env node
/**
 * P0 regression guard:
 * Reject unwrapped tldraw snapshots at the document-open boundary.
 *
 * Why:
 * The persisted .draw contract must have exactly one reader:
 *
 *   versioned Hybrid Canvas DrawFileContainer
 *
 * A raw JSON value shaped like { document, session } is NOT a supported .draw
 * file. Accepting it after container parsing fails creates an unversioned,
 * unvalidated compatibility lane that can silently return in later refactors.
 *
 * This script adds a cross-domain contract test. It does not alter production
 * behavior: production code must already reject raw snapshots before applying.
 *
 * Usage:
 *   node fix-p0-add-raw-snapshot-rejection-test.mjs --check
 *   node fix-p0-add-raw-snapshot-rejection-test.mjs --apply
 *   node fix-p0-add-raw-snapshot-rejection-test.mjs --apply /path/to/Canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const check = args.includes('--check') || !apply
const rootArgument = args.find((argument) => !argument.startsWith('--'))
const repositoryRoot = resolve(rootArgument ?? process.cwd())

const relativePath =
  'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts'

const targetPath = join(repositoryRoot, relativePath)

const anchor = `  it('opens through the native gateway without exposing a filesystem path', async () => {`

const regressionTest = `  it('rejects an unwrapped tldraw snapshot instead of guessing a legacy format', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-unwrapped-snapshot',
      displayName: 'legacy.draw',
      content: JSON.stringify({
        document: {
          shapes: [],
        },
        session: {},
      }),
    })

    await expect(harness.service.open()).rejects.toThrow('DRAW_INVALID_HEADER')
  })

`

function fail(message) {
  console.error(`\\nP0 regression-guard failure: ${message}\\n`)
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
  const packageJsonPath = join(repositoryRoot, 'package.json')

  if (!(await exists(packageJsonPath))) {
    fail(
      [
        `Repository root was not found: ${repositoryRoot}`,
        'Run this script from the Hybrid Canvas repository root,',
        'or pass the root directory as the final argument.',
      ].join('\\n'),
    )
    return
  }

  if (!(await exists(targetPath))) {
    fail(`Target test file was not found: ${relativePath}`)
    return
  }

  const source = await readFile(targetPath, 'utf8')

  if (source.includes(regressionTest)) {
    console.log(`Already guarded: ${relativePath}`)
    return
  }

  if (!source.includes(anchor)) {
    fail(
      [
        `Expected insertion anchor was not found in: ${relativePath}`,
        'Refusing a fuzzy test edit.',
        'Inspect the current lifecycle test manually before changing it.',
      ].join('\\n'),
    )
    return
  }

  const nextSource = source.replace(anchor, regressionTest + anchor)

  if (check) {
    console.log(`Regression test can be added safely: ${relativePath}`)
    console.log('Run again with --apply to write the change.')
    return
  }

  await writeFile(targetPath, nextSource, 'utf8')

  console.log(`Added P0 regression test: ${relativePath}`)
  console.log('')
  console.log('Required verification:')
  console.log('  pnpm --filter @hybrid-canvas/test-cross-domain-contract test')
  console.log('  pnpm test:architecture')
  console.log('  pnpm typecheck')
  console.log('  pnpm lint')
  console.log('  pnpm test')
}

await main()