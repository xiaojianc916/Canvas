#!/usr/bin/env node
/**
 * P0-A — Fresh standalone tldraw snapshot boundary bundle.
 *
 * No dependency on earlier scripts.
 * No patching another script.
 * No exact matching against previous captureDocument implementations.
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const editorSessionPath = join(
  root,
  'editor/core/src/runtime/editor-session.ts',
)

const registryTestPath = join(
  root,
  'tests/cross-domain-contract/document-lifecycle/editor-session-registry.test.ts',
)

function fail(message) {
  console.error(`\nP0-A tldraw snapshot boundary bundle failed:\n${message}\n`)
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

function replaceImport(source) {
  const legacyImport =
    `import { createTLStore, getSnapshot as getStoreEditorSnapshot } from '@tldraw/editor'`

  const canonicalImport = `import { createTLStore } from '@tldraw/editor'`

  if (source.includes(legacyImport)) {
    return source.replace(legacyImport, canonicalImport)
  }

  if (source.includes(canonicalImport)) {
    return source
  }

  throw new Error(
    'Could not find a supported @tldraw/editor createTLStore import.',
  )
}

function replaceCaptureDocument(source) {
  const startMarker =
    '  function captureDocument(): TLEditorSnapshot {'

  const endMarker = '\n\n  function createSessionSnapshot(): EditorSessionSnapshot {'

  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)

  if (start === -1 || end === -1) {
    throw new Error(
      [
        'Could not locate the complete captureDocument() function boundary.',
        'Expected it to appear before createSessionSnapshot().',
      ].join('\n'),
    )
  }

  const canonicalCapture = `  function captureDocument(): TLEditorSnapshot {
    /*
     * A complete TLEditorSnapshot includes TLSessionStateSnapshot. tldraw
     * initializes session state through a live Editor, not a detached TLStore.
     *
     * Persistable capture is valid only after attachEditor() has established
     * the explicit mounted-editor readiness boundary.
     */
    return requireAttachedEditor().getSnapshot()
  }`

  return source.slice(0, start) + canonicalCapture + source.slice(end)
}

const registryTest = `import {
  PersistedSnapshotLoadError,
  createEditorSessionRegistry,
} from '@hybrid-canvas/canvas/application'
import type { TLEditorSnapshot } from 'tldraw'
import { describe, expect, it } from 'vitest'

function invalidPersistedSnapshot(): TLEditorSnapshot {
  /*
   * This crosses the real createTLStore({ snapshot }) path. It is deliberately
   * malformed so tldraw migration/schema validation must reject it.
   */
  return {
    document: {
      schema: {},
      store: {},
    },
    session: {
      version: 0,
    },
  } as unknown as TLEditorSnapshot
}

describe('EditorSessionRegistry persisted snapshot boundary', () => {
  it('does not register a session when tldraw rejects persisted data', () => {
    const registry = createEditorSessionRegistry()
    const sessionId = 'invalid-persisted-session'

    expect(() =>
      registry.create({
        sessionId,
        documentId: 'invalid-persisted-document',
        initialSnapshot: invalidPersistedSnapshot(),
        extensions: [],
      }),
    ).toThrow(PersistedSnapshotLoadError)

    expect(registry.get(sessionId)).toBeNull()
  })

  it('remains usable after a rejected persisted snapshot', () => {
    const registry = createEditorSessionRegistry()

    expect(() =>
      registry.create({
        sessionId: 'rejected-session',
        documentId: 'rejected-document',
        initialSnapshot: invalidPersistedSnapshot(),
        extensions: [],
      }),
    ).toThrow('DRAW_INVALID_SNAPSHOT')

    expect(registry.get('rejected-session')).toBeNull()

    const valid = registry.create({
      sessionId: 'valid-session',
      documentId: 'valid-document',
      extensions: [],
    })

    expect(valid.sessionId).toBe('valid-session')
    expect(registry.get('valid-session')).toBe(valid)

    registry.close('valid-session')

    expect(registry.get('valid-session')).toBeNull()
  })
})
`

async function main() {
  if (!(await exists(editorSessionPath))) {
    fail(`Required source file was not found: ${editorSessionPath}`)
    return
  }

  const source = await readFile(editorSessionPath, 'utf8')

  let next

  try {
    next = replaceImport(source)
    next = replaceCaptureDocument(next)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    return
  }

  const alreadyApplied =
    next === source &&
    (await exists(registryTestPath))

  if (alreadyApplied) {
    console.log('P0-A tldraw snapshot boundary bundle is already applied.')
    return
  }

  if (!apply) {
    console.log('P0-A bundle is safe to apply.')
    console.log('')
    console.log('It will:')
    console.log('- require a mounted tldraw Editor for complete snapshot capture;')
    console.log('- remove detached TLStore full-snapshot fallback usage;')
    console.log('- add real registry fail-closed regression coverage;')
    console.log('- prove failed snapshot loads leave no registered session.')
    console.log('')
    console.log('Run again with --apply to write changes.')
    return
  }

  await mkdir(dirname(registryTestPath), { recursive: true })

  await Promise.all([
    writeFile(editorSessionPath, next, 'utf8'),
    writeFile(registryTestPath, registryTest, 'utf8'),
  ])

  console.log('Applied P0-A tldraw official snapshot boundary bundle.')
  console.log('')
  console.log('Verify:')
  console.log('  pnpm --filter @hybrid-canvas/canvas typecheck')
  console.log('  pnpm --filter @hybrid-canvas/test-cross-domain-contract typecheck')
  console.log('  pnpm --filter @hybrid-canvas/test-cross-domain-contract test')
  console.log('  pnpm typecheck')
  console.log('  pnpm lint')
  console.log('  pnpm test')
}

await main()