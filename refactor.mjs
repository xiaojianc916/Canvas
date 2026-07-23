#!/usr/bin/env node
/**
 * P0 — 使用 tldraw 官方 createTLStore({ snapshot }) 管线。
 *
 * Before:
 *   createTLStore(schema)
 *   loadSnapshot(store, initialSnapshot)
 *
 * After:
 *   createTLStore({
 *     schema,
 *     snapshot: initialSnapshot,
 *   })
 *
 * Why:
 * - tldraw creates the complete schema before snapshot migration/loading;
 * - custom shape/binding registrations are part of that schema;
 * - a failed migration/load aborts session creation before registry insertion;
 * - no parallel handwritten snapshot-loading lifecycle remains.
 *
 * Usage:
 *   node refactor-p0-use-tldraw-store-snapshot-pipeline.mjs --check
 *   node refactor-p0-use-tldraw-store-snapshot-pipeline.mjs --apply
 *   node refactor-p0-use-tldraw-store-snapshot-pipeline.mjs --apply D:\xiaojianc\hybrid-canvas
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

function fail(message) {
  console.error(`\ntldraw snapshot pipeline refactor failed:\n${message}\n`)
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
    throw new Error(`Replacement made no change: ${description}`)
  }

  return next
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

  if (
    source.includes('snapshot: options.initialSnapshot') &&
    !source.includes('loadSnapshot(store, options.initialSnapshot)')
  ) {
    console.log(`Already uses tldraw store snapshot pipeline: ${relativePath}`)
    return
  }

  try {
    let next = replaceExactly(
      source,
      `import { createTLStore, getSnapshot as getStoreEditorSnapshot, loadSnapshot } from '@tldraw/editor'`,
      `import { createTLStore, getSnapshot as getStoreEditorSnapshot } from '@tldraw/editor'`,
      'remove direct loadSnapshot import',
    )

    const oldStoreCreation = `  const store = createTLStore({
    shapeUtils: [
      ...defaultShapeUtils,
      ...registration.shapeUtils,
    ] as unknown as readonly TLAnyShapeUtilConstructor[],
    bindingUtils: [...defaultBindingUtils, ...registration.bindingUtils],
  })

  if (options.initialSnapshot) {
    loadSnapshot(store, options.initialSnapshot)
  }`

    const newStoreCreation = `  /*
   * Persisted documents enter through tldraw's canonical store-construction
   * pipeline. The factory builds the complete schema from default and extension
   * utilities, then migrates and loads the snapshot before a session exists.
   *
   * Do not reintroduce a post-construction loadSnapshot call here. That creates
   * a second initialization path with subtly different migration and session
   * state semantics.
   */
  const store = createTLStore({
    shapeUtils: [
      ...defaultShapeUtils,
      ...registration.shapeUtils,
    ] as unknown as readonly TLAnyShapeUtilConstructor[],
    bindingUtils: [...defaultBindingUtils, ...registration.bindingUtils],
    snapshot: options.initialSnapshot,
  })`

    next = replaceExactly(
      next,
      oldStoreCreation,
      newStoreCreation,
      'move persisted snapshot loading into createTLStore',
    )

    if (!apply) {
      console.log(`Safe to use canonical tldraw snapshot pipeline: ${relativePath}`)
      console.log('Run again with --apply to write the refactor.')
      return
    }

    await writeFile(targetPath, next, 'utf8')

    console.log('Applied canonical tldraw store snapshot pipeline.')
    console.log('')
    console.log('Required verification:')
    console.log('  pnpm --filter @hybrid-canvas/canvas typecheck')
    console.log('  pnpm --filter @hybrid-canvas/test-cross-domain-contract test')
    console.log('  pnpm typecheck')
    console.log('  pnpm lint')
    console.log('  pnpm test')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

await main()