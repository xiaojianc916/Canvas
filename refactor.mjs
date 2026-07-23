#!/usr/bin/env node
/**
 * P0 — Enforce tldraw's official snapshot lifecycle boundary.
 *
 * Official rule:
 *   getSnapshot(editor.store) is for an initialized Editor session.
 *
 * A detached TLStore does not necessarily have session state ready, so it must
 * never be used as a fallback for complete TLEditorSnapshot capture.
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const packageJsonPath = join(root, 'package.json')
const editorSessionPath = join(
  root,
  'editor/core/src/runtime/editor-session.ts',
)

function fail(message) {
  console.error(`\nP0 tldraw snapshot lifecycle refactor failed:\n${message}\n`)
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

function replaceExactlyOnce(source, oldText, newText, description) {
  const firstIndex = source.indexOf(oldText)

  if (firstIndex === -1) {
    throw new Error(
      [
        `Expected source fragment was not found: ${description}`,
        'Refusing fuzzy replacement because the source is not the audited version.',
      ].join('\n'),
    )
  }

  if (source.indexOf(oldText, firstIndex + oldText.length) !== -1) {
    throw new Error(
      `Expected exactly one matching source fragment: ${description}`,
    )
  }

  return (
    source.slice(0, firstIndex) +
    newText +
    source.slice(firstIndex + oldText.length)
  )
}

async function main() {
  if (!(await exists(packageJsonPath))) {
    fail(`Repository root was not found: ${root}`)
    return
  }

  if (!(await exists(editorSessionPath))) {
    fail(`Required file was not found: ${editorSessionPath}`)
    return
  }

  const source = await readFile(editorSessionPath, 'utf8')

  if (
    source.includes(
      'return requireAttachedEditor().getSnapshot()',
    ) &&
    !source.includes(
      'getSnapshot as getStoreEditorSnapshot',
    )
  ) {
    console.log('Official tldraw snapshot lifecycle boundary is already applied.')
    return
  }

  try {
    let next = replaceExactlyOnce(
      source,
      `import { createTLStore, getSnapshot as getStoreEditorSnapshot } from '@tldraw/editor'`,
      `import { createTLStore } from '@tldraw/editor'`,
      'remove detached-store getSnapshot fallback import',
    )

    next = replaceExactlyOnce(
      next,
      `  function captureDocument(): TLEditorSnapshot {
    assertActive()

    return attachedEditor?.getSnapshot() ?? getStoreEditorSnapshot(store)
  }`,
      `  function captureDocument(): TLEditorSnapshot {
    /*
     * tldraw's complete editor snapshot includes TLSessionStateSnapshot.
     * Session state is created by a live Editor, not by a detached TLStore.
     *
     * Persistable document capture is called only after the explicit
     * attachEditor() readiness boundary. If a caller violates that contract,
     * fail closed instead of synthesizing an incomplete snapshot.
     */
    return requireAttachedEditor().getSnapshot()
  }`,
      'require a mounted tldraw Editor for complete snapshot capture',
    )

    if (!apply) {
      console.log('Safe to apply tldraw official snapshot lifecycle boundary.')
      console.log('')
      console.log('Changes:')
      console.log('- removes getSnapshot(store) fallback for detached stores;')
      console.log('- requires a mounted Editor before capturing a full snapshot;')
      console.log('- fails closed instead of exporting incomplete session state.')
      console.log('')
      console.log('Run again with --apply to write the change.')
      return
    }

    await writeFile(editorSessionPath, next, 'utf8')

    console.log('Applied official tldraw snapshot lifecycle boundary.')
    console.log('')
    console.log('Verify:')
    console.log('  pnpm --filter @hybrid-canvas/canvas typecheck')
    console.log('  pnpm --filter @hybrid-canvas/test-cross-domain-contract typecheck')
    console.log('  pnpm --filter @hybrid-canvas/test-cross-domain-contract test')
    console.log('  pnpm typecheck')
    console.log('  pnpm lint')
    console.log('  pnpm test')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

await main()