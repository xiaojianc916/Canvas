#!/usr/bin/env node
/**
 * P0.1 — 将 tldraw snapshot load / migration / schema failure 收敛为稳定错误。
 *
 * createTLStore({ snapshot }) 是唯一真实的 extension-aware validation path：
 * - tldraw schema migration
 * - record validation
 * - custom shape / binding registration validation
 * - store integrity check
 *
 * 这些异常不能泄漏为 tldraw 内部错误，也不能让上层依赖错误文本。
 *
 * Usage:
 *   node refactor-p0-stabilize-tldraw-snapshot-failure.mjs --check
 *   node refactor-p0-stabilize-tldraw-snapshot-failure.mjs --apply
 *   node refactor-p0-stabilize-tldraw-snapshot-failure.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),
  editorSession: join(root, 'editor/core/src/runtime/editor-session.ts'),
  applicationPublicApi: join(
    root,
    'editor/core/src/application/public-api.ts',
  ),
}

function fail(message) {
  console.error(`\nPersisted snapshot failure-boundary refactor failed:\n${message}\n`)
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
  if (!(await exists(paths.packageJson))) {
    fail(
      [
        `Repository root was not found: ${root}`,
        'Run from the Hybrid Canvas repository root or pass its path explicitly.',
      ].join('\n'),
    )
    return
  }

  for (const path of [
    paths.editorSession,
    paths.applicationPublicApi,
  ]) {
    if (!(await exists(path))) {
      fail(`Required path does not exist: ${path}`)
      return
    }
  }

  const [editorSession, applicationPublicApi] = await Promise.all([
    readFile(paths.editorSession, 'utf8'),
    readFile(paths.applicationPublicApi, 'utf8'),
  ])

  if (
    editorSession.includes('class PersistedSnapshotLoadError') &&
    applicationPublicApi.includes('PersistedSnapshotLoadError')
  ) {
    console.log('Persisted snapshot failure boundary is already present.')
    return
  }

  try {
    const errorClassAnchor = `export type EditorSessionState = 'created' | 'attached' | 'detached' | 'disposed'

`

    const errorClass = `export type EditorSessionState = 'created' | 'attached' | 'detached' | 'disposed'

/**
 * Stable application-level error for a persisted snapshot that tldraw cannot
 * migrate, validate or load using the complete extension-aware store schema.
 *
 * The original error intentionally remains private: it can contain tldraw
 * implementation details and record content that must not become a UI/API
 * contract.
 */
export class PersistedSnapshotLoadError extends Error {
  readonly code = 'DRAW_INVALID_SNAPSHOT'

  constructor() {
    super('DRAW_INVALID_SNAPSHOT')
    this.name = 'PersistedSnapshotLoadError'
  }
}

`

    let nextEditorSession = replaceExactly(
      editorSession,
      errorClassAnchor,
      errorClass,
      'add stable persisted snapshot failure type',
    )

    const oldStoreBlock = `  const store = createTLStore({
    shapeUtils: [
      ...defaultShapeUtils,
      ...registration.shapeUtils,
    ] as unknown as readonly TLAnyShapeUtilConstructor[],
    bindingUtils: [...defaultBindingUtils, ...registration.bindingUtils],
    ...(options.initialSnapshot
      ? { snapshot: options.initialSnapshot }
      : {}),
  })`

    const newStoreBlock = `  const store = createValidatedEditorStore(
    registration,
    options.initialSnapshot,
  )`

    nextEditorSession = replaceExactly(
      nextEditorSession,
      oldStoreBlock,
      newStoreBlock,
      'route store construction through persisted snapshot failure boundary',
    )

    const registryAnchor = `export interface EditorSessionRegistry {
`

    const storeFactory = `function createValidatedEditorStore(
  registration: ExtensionRegistration,
  initialSnapshot: TLEditorSnapshot | undefined,
): TLStore {
  try {
    return createTLStore({
      shapeUtils: [
        ...defaultShapeUtils,
        ...registration.shapeUtils,
      ] as unknown as readonly TLAnyShapeUtilConstructor[],
      bindingUtils: [...defaultBindingUtils, ...registration.bindingUtils],
      ...(initialSnapshot
        ? { snapshot: initialSnapshot }
        : {}),
    })
  } catch {
    /*
     * tldraw performs schema migration, record validation and store integrity
     * checks here. A failed load must never expose a partially created store or
     * leak library-specific error text across the application boundary.
     */
    throw new PersistedSnapshotLoadError()
  }
}

`

    nextEditorSession = replaceExactly(
      nextEditorSession,
      registryAnchor,
      storeFactory + registryAnchor,
      'add validated editor store factory',
    )

    const oldPublicApiFragment = `  type EditorSessionSnapshot,
  type EditorSessionState,
} from '../runtime/editor-session'`

    const newPublicApiFragment = `  type EditorSessionSnapshot,
  type EditorSessionState,
  PersistedSnapshotLoadError,
} from '../runtime/editor-session'`

    const nextApplicationPublicApi = replaceExactly(
      applicationPublicApi,
      oldPublicApiFragment,
      newPublicApiFragment,
      'export stable persisted snapshot failure type',
    )

    if (!apply) {
      console.log('P0.1 snapshot failure boundary can be added safely:')
      console.log('- tldraw schema/migration errors become DRAW_INVALID_SNAPSHOT.')
      console.log('- No tldraw internal message becomes an application contract.')
      console.log('- Failed loads cannot return a partially initialized EditorSession.')
      console.log('')
      console.log('Run again with --apply to write the refactor.')
      return
    }

    await Promise.all([
      writeFile(paths.editorSession, nextEditorSession, 'utf8'),
      writeFile(
        paths.applicationPublicApi,
        nextApplicationPublicApi,
        'utf8',
      ),
    ])

    console.log('Applied stable persisted snapshot failure boundary.')
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