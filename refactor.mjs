#!/usr/bin/env node

/**
 * P0-C.5 — Inject the official Native TLAssetStore into editor sessions.
 *
 * Corrected:
 *   - removes the invalid TLEdititorSnapshot baseline
 *   - matches the real TLEditorSnapshot signature directly
 *   - validates every output before writing
 *   - restores every modified file if writing fails
 *
 * Required base:
 *   0a3715edcb86128b6730cbb062140d234e547d66
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --check D:\path\to\hybrid-canvas
 */

import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')

const unknownOptions = argv.filter(
  (argument) =>
    argument.startsWith('--') &&
    argument !== '--apply' &&
    argument !== '--check',
)

const rootArguments = argv.filter(
  (argument) => !argument.startsWith('--'),
)

function fail(message) {
  console.error(
    `\nP0-C.5 Native TLAssetStore injection failed:\n${message}\n`,
  )
  process.exit(1)
}

if (unknownOptions.length > 0) {
  fail(`Unknown option: ${unknownOptions.join(', ')}`)
}

if (rootArguments.length > 1) {
  fail('Only one optional repository root is accepted.')
}

if (apply && check) {
  fail('Use either --check or --apply, not both.')
}

if (!apply && !check) {
  fail('Missing mode. Use --check or --apply.')
}

const root = resolve(rootArguments[0] ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),

  editorSession: join(
    root,
    'editor/core/src/runtime/editor-session.ts',
  ),

  editorApplicationPublicApi: join(
    root,
    'editor/core/src/application/public-api.ts',
  ),

  editorPublicApi: join(
    root,
    'editor/core/src/public-api.ts',
  ),

  documentService: join(
    root,
    'editor/document/src/application/canvas-document-service.ts',
  ),

  application: join(
    root,
    'apps/desktop/src/bootstrap/application.ts',
  ),

  canvasWorkflow: join(
    root,
    'apps/desktop/src/application/canvas/canvas-workflow.ts',
  ),

  reactRoot: join(
    root,
    'apps/desktop/src/bootstrap/react-root.tsx',
  ),

  applicationLifecycle: join(
    root,
    'apps/desktop/src/bootstrap/application-lifecycle.ts',
  ),

  editorRegistryTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/editor-session-registry.test.ts',
  ),

  documentServiceTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
  ),

  nativeAssetStore: join(
    root,
    'platforms/desktop-runtime/src/adapters/assets/native-tl-asset-store.ts',
  ),

  desktopRuntimePackage: join(
    root,
    'platforms/desktop-runtime/package.json',
  ),

  desktopRuntimePublicApi: join(
    root,
    'platforms/desktop-runtime/src/public-api.ts',
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

function count(source, fragment) {
  return source.split(fragment).length - 1
}

function replaceExact(
  source,
  baseline,
  final,
  description,
) {
  if (source.includes(final)) {
    return source
  }

  const occurrences = count(source, baseline)

  if (occurrences !== 1) {
    throw new Error(
      [
        `Unexpected source count: ${description}`,
        'Expected: 1',
        `Actual: ${occurrences}`,
        'Refusing an ambiguous or partial modification.',
      ].join('\n'),
    )
  }

  return source.replace(baseline, final)
}

function replaceAllExact(
  source,
  baseline,
  final,
  expectedCount,
  description,
) {
  const occurrences = count(source, baseline)

  if (occurrences === 0 && source.includes(final)) {
    return source
  }

  if (occurrences !== expectedCount) {
    throw new Error(
      [
        `Unexpected source count: ${description}`,
        `Expected: ${expectedCount}`,
        `Actual: ${occurrences}`,
        'Refusing an ambiguous or partial modification.',
      ].join('\n'),
    )
  }

  return source.split(baseline).join(final)
}

function updateEditorSession(source) {
  let result = source

  result = replaceExact(
    result,
    `  type TLAnyShapeUtilConstructor,
  type TLEditorSnapshot,`,
    `  type TLAnyShapeUtilConstructor,
  type TLAssetStore,
  type TLEditorSnapshot,`,
    'import TLAssetStore',
  )

  result = replaceExact(
    result,
    `export interface CreateEditorSessionOptions {
  readonly sessionId: string
  readonly documentId: string
  readonly initialSnapshot?: TLEditorSnapshot
  readonly extensions?: readonly HybridCanvasExtension[]
}`,
    `export interface EditorAssetStoreSession {
  readonly assets: TLAssetStore
  readonly dispose: () => Promise<void>
}

export type EditorAssetStoreSessionFactory =
  () => EditorAssetStoreSession

export interface CreateEditorSessionOptions {
  readonly sessionId: string
  readonly documentId: string
  readonly initialSnapshot?: TLEditorSnapshot
  readonly extensions?: readonly HybridCanvasExtension[]
}`,
    'declare editor asset-store ownership',
  )

  result = replaceExact(
    result,
    `export function createEditorSession(options: CreateEditorSessionOptions): EditorSession {
  const registration = buildExtensionRegistration(options.extensions)`,
    `export function createEditorSession(
  options: CreateEditorSessionOptions,
  assetStoreSession: EditorAssetStoreSession,
): EditorSession {
  const registration = buildExtensionRegistration(options.extensions)`,
    'require asset store during editor creation',
  )

  result = replaceExact(
    result,
    `  const store = createValidatedEditorStore(
    registration,
    options.initialSnapshot,
  )`,
    `  const store = createValidatedEditorStore(
    registration,
    options.initialSnapshot,
    assetStoreSession.assets,
  )`,
    'pass asset store to validated store',
  )

  result = replaceExact(
    result,
    `function createValidatedEditorStore(
  registration: ExtensionRegistration,
  initialSnapshot: TLEditorSnapshot | undefined,
): TLStore {`,
    `function createValidatedEditorStore(
  registration: ExtensionRegistration,
  initialSnapshot: TLEditorSnapshot | undefined,
  assets: TLAssetStore,
): TLStore {`,
    'extend validated store signature with assets',
  )

  result = replaceExact(
    result,
    `    return createTLStore({
      shapeUtils: [`,
    `    return createTLStore({
      assets,
      shapeUtils: [`,
    'inject assets into createTLStore',
  )

  const oldRegistry = `export interface EditorSessionRegistry {
  readonly create: (options: CreateEditorSessionOptions) => EditorSession

  readonly get: (sessionId: string) => EditorSession | null

  readonly require: (sessionId: string) => EditorSession

  readonly close: (sessionId: string) => void

  readonly dispose: () => void
}

export function createEditorSessionRegistry(): EditorSessionRegistry {
  const sessions = new Map<string, EditorSession>()

  return {
    create(options) {
      if (sessions.has(options.sessionId)) {
        throw new Error('EDITOR_SESSION_DUPLICATE_ID')
      }

      const session = createEditorSession(options)

      sessions.set(options.sessionId, session)

      return session
    },

    get(sessionId) {
      return sessions.get(sessionId) ?? null
    },

    require(sessionId) {
      const session = sessions.get(sessionId)

      if (!session) {
        throw new Error('EDITOR_SESSION_NOT_FOUND')
      }

      return session
    },

    close(sessionId) {
      const session = sessions.get(sessionId)

      if (!session) {
        return
      }

      session.dispose()
      sessions.delete(sessionId)
    },

    dispose() {
      for (const session of sessions.values()) {
        session.dispose()
      }

      sessions.clear()
    },
  }
}`

  const finalRegistry = `interface OwnedEditorSession {
  readonly session: EditorSession
  readonly assetStoreSession: EditorAssetStoreSession
}

export interface EditorSessionRegistry {
  readonly create: (
    options: CreateEditorSessionOptions,
  ) => Promise<EditorSession>

  readonly get: (sessionId: string) => EditorSession | null

  readonly require: (sessionId: string) => EditorSession

  readonly close: (sessionId: string) => Promise<void>

  readonly dispose: () => Promise<void>
}

export function createEditorSessionRegistry(
  assetStoreFactory: EditorAssetStoreSessionFactory,
): EditorSessionRegistry {
  const sessions = new Map<string, OwnedEditorSession>()

  return {
    async create(options) {
      if (sessions.has(options.sessionId)) {
        throw new Error('EDITOR_SESSION_DUPLICATE_ID')
      }

      const assetStoreSession = assetStoreFactory()

      let session: EditorSession

      try {
        session = createEditorSession(
          options,
          assetStoreSession,
        )
      } catch (creationError) {
        try {
          await assetStoreSession.dispose()
        } catch (cleanupError) {
          throw new AggregateError(
            [creationError, cleanupError],
            'EDITOR_SESSION_CREATION_ROLLBACK_FAILED',
          )
        }

        throw creationError
      }

      sessions.set(options.sessionId, {
        session,
        assetStoreSession,
      })

      return session
    },

    get(sessionId) {
      return sessions.get(sessionId)?.session ?? null
    },

    require(sessionId) {
      const owned = sessions.get(sessionId)

      if (!owned) {
        throw new Error('EDITOR_SESSION_NOT_FOUND')
      }

      return owned.session
    },

    async close(sessionId) {
      const owned = sessions.get(sessionId)

      if (!owned) {
        return
      }

      /*
       * Remove ownership before asynchronous disposal so callers cannot acquire
       * a session that has already entered its closing lifecycle.
       */
      sessions.delete(sessionId)
      owned.session.dispose()

      await owned.assetStoreSession.dispose()
    },

    async dispose() {
      const ownedSessions = [...sessions.values()]

      sessions.clear()

      for (const owned of ownedSessions) {
        owned.session.dispose()
      }

      await Promise.all(
        ownedSessions.map((owned) =>
          owned.assetStoreSession.dispose(),
        ),
      )
    },
  }
}`

  result = replaceExact(
    result,
    oldRegistry,
    finalRegistry,
    'replace registry with owned asset lifecycle',
  )

  return result
}

function updateEditorApplicationPublicApi(source) {
  return replaceExact(
    source,
    `  type CreateEditorSessionOptions,
  createEditorSession,`,
    `  type CreateEditorSessionOptions,
  createEditorSession,
  type EditorAssetStoreSession,
  type EditorAssetStoreSessionFactory,`,
    'export editor asset-store ownership types',
  )
}

function updateEditorPublicApi(source) {
  return replaceExact(
    source,
    `  type CreateEditorSessionOptions,
  createEditorSession,`,
    `  type CreateEditorSessionOptions,
  createEditorSession,
  type EditorAssetStoreSession,
  type EditorAssetStoreSessionFactory,`,
    're-export editor asset-store ownership types',
  )
}

function updateDocumentService(source) {
  let result = source

  result = replaceExact(
    result,
    `  readonly create: (title: string) => OpenedCanvasSession`,
    `  readonly create: (
    title: string,
  ) => Promise<OpenedCanvasSession>`,
    'make document creation asynchronous',
  )

  result = replaceExact(
    result,
    `  readonly dispose: () => void`,
    `  readonly dispose: () => Promise<void>`,
    'make document disposal asynchronous',
  )

  result = replaceExact(
    result,
    `  function create(title: string): OpenedCanvasSession {`,
    `  async function create(
    title: string,
  ): Promise<OpenedCanvasSession> {`,
    'make document create implementation asynchronous',
  )

  result = replaceAllExact(
    result,
    `    const editor = editorSessions.create({`,
    `    const editor = await editorSessions.create({`,
    2,
    'await editor session creation',
  )

  result = replaceExact(
    result,
    `    editorSessions.close(sessionId)
    emit()`,
    `    await editorSessions.close(sessionId)
    emit()`,
    'await editor asset disposal during release',
  )

  result = replaceExact(
    result,
    `    dispose() {
      for (const [sessionId, owned] of sessions) {
        // dispose 只在应用运行时被销毁时执行。此时 native process 的退出会
        // 统一释放 DocumentRegistry；不得在这里 fire-and-forget document_close。
        owned.stopObservingDocument()
        editorSessions.close(sessionId)
      }

      sessions.clear()
      listeners.clear()
      editorSessions.dispose()
    },`,
    `    async dispose() {
      for (const owned of sessions.values()) {
        /*
         * Native DocumentRegistry remains process-owned during application
         * teardown. Renderer asset sessions are still explicitly settled.
         */
        owned.stopObservingDocument()
      }

      sessions.clear()
      listeners.clear()

      await editorSessions.dispose()
    },`,
    'settle registry disposal',
  )

  return result
}

function updateApplication(source) {
  let result = source

  result = replaceExact(
    result,
    `  createDesktopSettingsStore,
  createDocumentFileCommands,`,
    `  createDesktopSettingsStore,
  createDocumentFileCommands,
  createNativeTLAssetStoreSession,`,
    'import Native TLAssetStore factory',
  )

  result = replaceExact(
    result,
    `  readonly dispose: () => void`,
    `  readonly dispose: () => Promise<void>`,
    'make application disposal asynchronous',
  )

  result = replaceExact(
    result,
    `  const editorSessions = createEditorSessionRegistry()`,
    `  const editorSessions = createEditorSessionRegistry(
    createNativeTLAssetStoreSession,
  )`,
    'inject Native TLAssetStore factory',
  )

  result = replaceExact(
    result,
    `    dispose() {
      termination.dispose()
      canvases.dispose()
    },`,
    `    async dispose() {
      termination.dispose()
      await canvases.dispose()
    },`,
    'await canvas workflow disposal',
  )

  return result
}

function updateCanvasWorkflow(source) {
  let result = source

  result = replaceExact(
    result,
    `  readonly dispose: () => void`,
    `  readonly dispose: () => Promise<void>`,
    'make workflow disposal asynchronous',
  )

  result = replaceExact(
    result,
    `    const opened = documents.create(title)`,
    `    const opened = await documents.create(title)`,
    'await document creation',
  )

  result = replaceExact(
    result,
    `    dispose() {
      stopDocumentSubscription()
      closeOperations.clear()
      closeStates.clear()
      closeSnapshot = EMPTY_CLOSE_SNAPSHOT
      listeners.clear()
      documents.dispose()
    },`,
    `    async dispose() {
      stopDocumentSubscription()
      closeOperations.clear()
      closeStates.clear()
      closeSnapshot = EMPTY_CLOSE_SNAPSHOT
      listeners.clear()

      await documents.dispose()
    },`,
    'await document service disposal',
  )

  return result
}

function updateReactRoot(source) {
  let result = source

  result = replaceExact(
    result,
    `  readonly unmount: () => void`,
    `  readonly unmount: () => Promise<void>`,
    'make mounted application unmount asynchronous',
  )

  result = replaceExact(
    result,
    `    unmount() {
      root.unmount()
      runtime.dispose()
    },`,
    `    async unmount() {
      root.unmount()
      await runtime.dispose()
    },`,
    'await runtime disposal',
  )

  return result
}

function updateApplicationLifecycle(source) {
  let result = source

  result = replaceExact(
    result,
    `export interface ApplicationLifecycle {
  readonly dispose: () => void
}`,
    `export interface ApplicationLifecycle {
  readonly dispose: () => Promise<void>
}`,
    'make application lifecycle disposal asynchronous',
  )

  result = replaceExact(
    result,
    `  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    window.removeEventListener('pagehide', dispose)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    mounted.unmount()
  }`,
    `  const dispose = async (): Promise<void> => {
    if (disposed) {
      return
    }

    disposed = true
    window.removeEventListener(
      'pagehide',
      handlePageHide,
    )
    window.removeEventListener(
      'beforeunload',
      handleBeforeUnload,
    )

    await mounted.unmount()
  }

  const handlePageHide = () => {
    void dispose().catch((cause: unknown) => {
      reportError(
        'application disposal failed during pagehide',
        {
          scope: 'application-lifecycle',
          operation: 'dispose',
          cause,
        },
      )
    })
  }`,
    'install asynchronous application disposal',
  )

  result = replaceExact(
    result,
    `  window.addEventListener('pagehide', dispose, { once: true })`,
    `  window.addEventListener('pagehide', handlePageHide, {
    once: true,
  })`,
    'install pagehide disposal adapter',
  )

  return result
}

const finalEditorRegistryTest = `import {
  PersistedSnapshotLoadError,
  createEditorSessionRegistry,
  type EditorAssetStoreSessionFactory,
} from '@hybrid-canvas/canvas/application'
import type {
  TLAssetStore,
  TLEditorSnapshot,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

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

function createAssetStoreHarness() {
  const dispose = vi.fn().mockResolvedValue(undefined)

  const factory: EditorAssetStoreSessionFactory = () => ({
    assets: {
      upload: vi.fn(),
    } as unknown as TLAssetStore,
    dispose,
  })

  return {
    factory,
    dispose,
  }
}

describe('EditorSessionRegistry persisted snapshot boundary', () => {
  it('does not register a session when tldraw rejects persisted data', async () => {
    const assets = createAssetStoreHarness()
    const registry = createEditorSessionRegistry(
      assets.factory,
    )
    const sessionId = 'invalid-persisted-session'

    await expect(
      registry.create({
        sessionId,
        documentId: 'invalid-persisted-document',
        initialSnapshot: invalidPersistedSnapshot(),
        extensions: [],
      }),
    ).rejects.toThrow(PersistedSnapshotLoadError)

    expect(registry.get(sessionId)).toBeNull()
    expect(assets.dispose).toHaveBeenCalledTimes(1)
  })

  it('remains usable after a rejected persisted snapshot', async () => {
    const assets = createAssetStoreHarness()
    const registry = createEditorSessionRegistry(
      assets.factory,
    )

    await expect(
      registry.create({
        sessionId: 'rejected-session',
        documentId: 'rejected-document',
        initialSnapshot: invalidPersistedSnapshot(),
        extensions: [],
      }),
    ).rejects.toThrow('DRAW_INVALID_SNAPSHOT')

    expect(registry.get('rejected-session')).toBeNull()

    const valid = await registry.create({
      sessionId: 'valid-session',
      documentId: 'valid-document',
      extensions: [],
    })

    expect(valid.sessionId).toBe('valid-session')
    expect(registry.get('valid-session')).toBe(valid)

    await registry.close('valid-session')

    expect(registry.get('valid-session')).toBeNull()
    expect(assets.dispose).toHaveBeenCalledTimes(2)
  })

  it('waits for owned asset disposal before close settles', async () => {
    let releaseAssetStore = () => {}

    const dispose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseAssetStore = resolve
        }),
    )

    const registry = createEditorSessionRegistry(() => ({
      assets: {
        upload: vi.fn(),
      } as unknown as TLAssetStore,
      dispose,
    }))

    const session = await registry.create({
      sessionId: 'asset-owned-session',
      documentId: 'asset-owned-document',
      extensions: [],
    })

    const closing = registry.close(session.sessionId)
    let settled = false

    void closing.then(() => {
      settled = true
    })

    await Promise.resolve()

    expect(registry.get(session.sessionId)).toBeNull()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)

    releaseAssetStore()
    await closing

    expect(settled).toBe(true)
  })
})
`

function updateDocumentServiceTest(source) {
  let result = source

  result = replaceExact(
    result,
    `  const closeEditorSession = vi.fn()`,
    `  const closeEditorSession = vi
    .fn()
    .mockResolvedValue(undefined)`,
    'make editor close mock asynchronous',
  )

  result = replaceExact(
    result,
    `      dispose: vi.fn(),`,
    `      dispose: vi.fn().mockResolvedValue(undefined),`,
    'make registry dispose mock asynchronous',
  )

  result = replaceAllExact(
    result,
    `    const opened = harness.service.create('未命名画布')`,
    `    const opened = await harness.service.create(
      '未命名画布',
    )`,
    3,
    'await canvas creation in document tests',
  )

  return result
}

function validateNativePrerequisites(
  source,
  packageSource,
  publicApiSource,
) {
  for (const fragment of [
    'export function createNativeTLAssetStoreSession()',
    'readonly assets: TLAssetStore',
    'readonly dispose: () => Promise<void>',
    'function requireOpenedSession()',
  ]) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Native TLAssetStore prerequisite is missing: ${fragment}`,
      )
    }
  }

  const packageJson = JSON.parse(
    packageSource.replace(/^\uFEFF/, ''),
  )

  if (packageJson.dependencies?.tldraw !== 'catalog:') {
    throw new Error(
      'desktop-runtime must declare tldraw as a catalog dependency.',
    )
  }

  if (
    !publicApiSource.includes(
      'createNativeTLAssetStoreSession,',
    )
  ) {
    throw new Error(
      'desktop-runtime does not export the Native asset factory.',
    )
  }
}

function validateFinal(outputs) {
  const requirements = [
    [
      paths.editorSession,
      'type TLAssetStore,',
      'TLAssetStore type import',
    ],
    [
      paths.editorSession,
      'assets: TLAssetStore',
      'asset-store ownership contract',
    ],
    [
      paths.editorSession,
      `return createTLStore({
      assets,`,
      'official createTLStore assets injection',
    ],
    [
      paths.editorSession,
      'assetStoreFactory: EditorAssetStoreSessionFactory',
      'registry asset factory',
    ],
    [
      paths.editorSession,
      'await owned.assetStoreSession.dispose()',
      'registry close disposal',
    ],
    [
      paths.documentService,
      'await editorSessions.close(sessionId)',
      'document release disposal boundary',
    ],
    [
      paths.application,
      `createEditorSessionRegistry(
    createNativeTLAssetStoreSession,
  )`,
      'desktop Native asset injection',
    ],
    [
      paths.canvasWorkflow,
      'const opened = await documents.create(title)',
      'asynchronous create propagation',
    ],
    [
      paths.reactRoot,
      'await runtime.dispose()',
      'runtime disposal propagation',
    ],
  ]

  for (const [path, fragment, description] of requirements) {
    const source = outputs.get(path)

    if (!source?.includes(fragment)) {
      throw new Error(
        `Final validation failed: ${description}`,
      )
    }
  }

  const forbidden = [
    [
      paths.editorSession,
      'createEditorSessionRegistry(): EditorSessionRegistry',
      'registry without an asset factory',
    ],
    [
      paths.documentService,
      '\n    editorSessions.close(sessionId)\n',
      'unawaited editor session close',
    ],
    [
      paths.application,
      'const editorSessions = createEditorSessionRegistry()',
      'desktop registry without Native assets',
    ],
  ]

  for (const [path, fragment, description] of forbidden) {
    const source = outputs.get(path)

    if (source?.includes(fragment)) {
      throw new Error(
        `Obsolete lifecycle remains: ${description}`,
      )
    }
  }
}

async function restoreFiles(originals) {
  const results = await Promise.allSettled(
    [...originals].map(([path, content]) =>
      writeFile(path, content, 'utf8'),
    ),
  )

  if (
    results.some((result) => result.status === 'rejected')
  ) {
    throw new Error(
      [
        'Rollback failed.',
        'Inspect these files immediately:',
        ...originals.keys(),
      ].join('\n'),
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

  const rootPackage = JSON.parse(
    (
      await readFile(paths.packageJson, 'utf8')
    ).replace(/^\uFEFF/, ''),
  )

  if (rootPackage.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected package name: ${String(
        rootPackage.name,
      )}`,
    )
  }

  const [
    nativeAssetStore,
    desktopRuntimePackage,
    desktopRuntimePublicApi,
  ] = await Promise.all([
    readFile(paths.nativeAssetStore, 'utf8'),
    readFile(paths.desktopRuntimePackage, 'utf8'),
    readFile(paths.desktopRuntimePublicApi, 'utf8'),
  ])

  validateNativePrerequisites(
    nativeAssetStore,
    desktopRuntimePackage,
    desktopRuntimePublicApi,
  )

  const editablePaths = [
    paths.editorSession,
    paths.editorApplicationPublicApi,
    paths.editorPublicApi,
    paths.documentService,
    paths.application,
    paths.canvasWorkflow,
    paths.reactRoot,
    paths.applicationLifecycle,
    paths.editorRegistryTest,
    paths.documentServiceTest,
  ]

  const originals = new Map(
    await Promise.all(
      editablePaths.map(async (path) => [
        path,
        await readFile(path, 'utf8'),
      ]),
    ),
  )

  const outputs = new Map([
    [
      paths.editorSession,
      updateEditorSession(
        originals.get(paths.editorSession),
      ),
    ],
    [
      paths.editorApplicationPublicApi,
      updateEditorApplicationPublicApi(
        originals.get(paths.editorApplicationPublicApi),
      ),
    ],
    [
      paths.editorPublicApi,
      updateEditorPublicApi(
        originals.get(paths.editorPublicApi),
      ),
    ],
    [
      paths.documentService,
      updateDocumentService(
        originals.get(paths.documentService),
      ),
    ],
    [
      paths.application,
      updateApplication(
        originals.get(paths.application),
      ),
    ],
    [
      paths.canvasWorkflow,
      updateCanvasWorkflow(
        originals.get(paths.canvasWorkflow),
      ),
    ],
    [
      paths.reactRoot,
      updateReactRoot(
        originals.get(paths.reactRoot),
      ),
    ],
    [
      paths.applicationLifecycle,
      updateApplicationLifecycle(
        originals.get(paths.applicationLifecycle),
      ),
    ],
    [
      paths.editorRegistryTest,
      finalEditorRegistryTest,
    ],
    [
      paths.documentServiceTest,
      updateDocumentServiceTest(
        originals.get(paths.documentServiceTest),
      ),
    ],
  ])

  validateFinal(outputs)

  const changed = [...outputs].filter(
    ([path, content]) => originals.get(path) !== content,
  )

  if (changed.length === 0) {
    console.log(
      'P0-C.5 Native TLAssetStore injection is already applied.',
    )
    return
  }

  console.log('P0-C.5 will update:')

  for (const [path] of changed) {
    console.log(`- ${path.slice(root.length + 1)}`)
  }

  if (check) {
    console.log('')
    console.log('It will:')
    console.log(
      '- inject Native TLAssetStore into createTLStore;',
    )
    console.log(
      '- give every editor session exclusive asset ownership;',
    )
    console.log(
      '- make session creation and disposal transactional;',
    )
    console.log(
      '- await asset cleanup during canvas release;',
    )
    console.log(
      '- propagate asynchronous disposal through the runtime;',
    )
    console.log(
      '- update lifecycle contract tests;',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the changes.',
    )
    return
  }

  try {
    for (const [path, content] of changed) {
      await writeFile(path, content, 'utf8')
    }
  } catch (error) {
    console.error(
      '\nApply failed. Restoring all original files...',
    )

    await restoreFiles(originals)
    throw error
  }

  console.log('')
  console.log(
    'Applied P0-C.5 Native TLAssetStore editor lifecycle injection.',
  )
  console.log('')
  console.log('Required verification:')
  console.log('  pnpm install')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm check:ipc')
  console.log('  cargo fmt --all -- --check')
  console.log('  cargo check --workspace --all-targets')
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})