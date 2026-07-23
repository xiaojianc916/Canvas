#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

const paths = {
  publicApi: 'editor/core/src/react/public-api.ts',
  canvasDocumentService:
    'editor/document/src/application/canvas-document-service.ts',
  openRollbackTest:
    'tests/cross-domain-contract/document-lifecycle/canvas-document-open-rollback.test.ts',
  registryTest:
    'tests/cross-domain-contract/document-lifecycle/editor-session-registry.test.ts',
}

function abs(path) {
  return resolve(root, path)
}

function read(path) {
  return readFileSync(abs(path), 'utf8')
}

function write(path, content) {
  writeFileSync(abs(path), content.replaceAll('\r\n', '\n'))
}

function replaceOnce(source, oldValue, newValue, label) {
  const first = source.indexOf(oldValue)
  if (first < 0) {
    throw new Error(`Expected source fragment was not found: ${label}`)
  }
  if (source.indexOf(oldValue, first + oldValue.length) >= 0) {
    throw new Error(`Unexpected source count: ${label}`)
  }
  return source.slice(0, first) + newValue + source.slice(first + oldValue.length)
}

function patchPublicApi() {
  write(
    paths.publicApi,
    `export {
  buildExtensionRegistration,
  type ExtensionRegistration,
  HYBRID_CANVAS_EXTENSION_API_VERSION,
  type HybridCanvasExtension,
} from '../contracts/public-api'
export { CanvasToolbar } from './CanvasToolbar'
export type { CanvasToolbarProps } from './CanvasToolbar'
export { EditorCanvas, type EditorCanvasProps } from './EditorCanvas'
export {
  EditorSessionHost,
  type EditorSessionHostEntry,
  type EditorSessionHostProps,
} from './EditorSessionHost'
export {
  EditorProvider,
  type EditorProviderProps,
  useEditor,
  useTldrawLicenseKey,
} from './editor-context'
`,
  )
}

function patchCanvasDocumentService() {
  let source = read(paths.canvasDocumentService)

  const oldBlock = `      const editor = await editorSessions.create({
        documentId: canvasId,
        sessionId,
        initialSnapshot,
        assetStoreRestore: opened.assetPersistenceToken
          ? { persistenceToken: opened.assetPersistenceToken }
          : undefined,
        extensions,
      })`

  const newBlock = `      const editor = await editorSessions.create({
        documentId: canvasId,
        sessionId,
        initialSnapshot,
        ...(opened.assetPersistenceToken
          ? {
              assetStoreRestore: {
                persistenceToken: opened.assetPersistenceToken,
              },
            }
          : {}),
        extensions,
      })`

  if (source.includes(oldBlock)) {
    source = replaceOnce(
      source,
      oldBlock,
      newBlock,
      'assetStoreRestore exactOptionalPropertyTypes fix',
    )
    write(paths.canvasDocumentService, source)
    return
  }

  if (source.includes('assetStoreRestore: {') || source.includes('...(opened.assetPersistenceToken')) {
    write(paths.canvasDocumentService, source)
    return
  }

  throw new Error(
    'Could not find assetStoreRestore block in canvas-document-service.ts',
  )
}

function patchOpenRollbackTest() {
  write(
    paths.openRollbackTest,
    `import { createCanvasDocumentService } from '@hybrid-canvas/document'
import { describe, expect, it, vi } from 'vitest'

const VALID_STORE_SNAPSHOT = JSON.stringify({
  schema: {},
  store: {},
})

interface HarnessOptions {
  readonly content: string
  readonly editorOpenError?: Error
  readonly rollbackError?: Error
}

function createHarness({
  content,
  editorOpenError = new Error('DRAW_INVALID_SNAPSHOT'),
  rollbackError,
}: HarnessOptions) {
  const editorSessions = {
    create: vi.fn(async () => {
      throw editorOpenError
    }),
    close: vi.fn(),
    dispose: vi.fn(),
  }

  const close = rollbackError
    ? vi.fn(async () => {
        throw rollbackError
      })
    : vi.fn(async () => {})

  const persistence = {
    open: vi.fn(async () => ({
      id: 'native-document-id',
      displayName: 'broken.draw',
      content,
      revision: 'revision-current',
      assetPersistenceToken: null,
    })),
    save: vi.fn(async () => ({
      revision: 'revision-next',
    })),
    saveAs: vi.fn(async () => null),
    close,
  }

  const service = createCanvasDocumentService({
    editorSessions,
    persistence,
    extensions: [],
  })

  return {
    service,
    editorSessions,
    persistence,
  }
}

describe('CanvasDocumentService open transaction', () => {
  it('closes the native document when outer parsing fails', async () => {
    const { service, editorSessions, persistence } = createHarness({
      content: 'not-json',
    })

    await expect(service.open()).rejects.toThrow()

    expect(editorSessions.create).not.toHaveBeenCalled()
    expect(persistence.close).toHaveBeenCalledTimes(1)
    expect(persistence.close).toHaveBeenCalledWith('native-document-id')
  })

  it('closes the native document when tldraw snapshot loading fails', async () => {
    const snapshotError = new Error('DRAW_INVALID_SNAPSHOT')
    const { service, editorSessions, persistence } = createHarness({
      content: VALID_STORE_SNAPSHOT,
      editorOpenError: snapshotError,
    })

    await expect(service.open()).rejects.toBe(snapshotError)

    expect(editorSessions.create).toHaveBeenCalledTimes(1)
    expect(persistence.close).toHaveBeenCalledTimes(1)
    expect(persistence.close).toHaveBeenCalledWith('native-document-id')
  })

  it('preserves both failures when native rollback fails', async () => {
    const snapshotError = new Error('DRAW_INVALID_SNAPSHOT')
    const rollbackError = new Error('NATIVE_DOCUMENT_CLOSE_FAILED')
    const { service, persistence } = createHarness({
      content: VALID_STORE_SNAPSHOT,
      editorOpenError: snapshotError,
      rollbackError,
    })

    let failure: unknown

    try {
      await service.open()
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(AggregateError)

    const aggregate = failure as AggregateError

    expect(aggregate.message).toBe('DOCUMENT_OPEN_ROLLBACK_FAILED')
    expect(aggregate.errors).toEqual([snapshotError, rollbackError])
    expect(persistence.close).toHaveBeenCalledTimes(1)
    expect(persistence.close).toHaveBeenCalledWith('native-document-id')
  })
})
`,
  )
}

function patchRegistryTest() {
  write(
    paths.registryTest,
    `import {
  PersistedSnapshotLoadError,
  createEditorSessionRegistry,
  type EditorAssetStoreSessionFactory,
} from '@hybrid-canvas/canvas/application'
import type {
  TLAssetStore,
  TLStoreSnapshot,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

function invalidPersistedSnapshot(): TLStoreSnapshot {
  return {
    schema: null,
    store: null,
  } as unknown as TLStoreSnapshot
}

function createAssetStoreHarness() {
  const dispose = vi.fn(async (): Promise<void> => {})
  const getPersistenceToken = vi.fn(
    async (): Promise<string | null> => null,
  )

  const factory: EditorAssetStoreSessionFactory = () => ({
    assets: {
      upload: vi.fn(),
    } as unknown as TLAssetStore,
    getPersistenceToken,
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

  it('binds restored resources and persistence capture to the same session', async () => {
    const persistenceToken = 'restored-native-session'

    const getPersistenceToken = vi.fn(
      async (): Promise<string | null> => persistenceToken,
    )
    const dispose = vi.fn(async (): Promise<void> => {})

    const factoryMock = vi.fn((_restore?: unknown) => ({
      assets: {
        upload: vi.fn(),
      } as unknown as TLAssetStore,
      getPersistenceToken,
      dispose,
    }))

    const factory: EditorAssetStoreSessionFactory = (restore) =>
      factoryMock(restore)

    const registry = createEditorSessionRegistry(factory)

    const session = await registry.create({
      sessionId: 'restored-editor-session',
      documentId: 'restored-document',
      assetStoreRestore: {
        persistenceToken,
      },
      extensions: [],
    })

    expect(factoryMock).toHaveBeenCalledWith({
      persistenceToken,
    })

    await expect(
      session.captureAssetPersistenceToken(),
    ).resolves.toBe(persistenceToken)

    expect(getPersistenceToken).toHaveBeenCalledTimes(1)

    await registry.close(session.sessionId)
  })

  it('waits for owned asset disposal before close settles', async () => {
    let releaseAssetStore: () => void = () => {}

    const dispose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseAssetStore = () => resolve()
        }),
    )

    const registry = createEditorSessionRegistry(() => ({
      assets: {
        upload: vi.fn(),
      } as unknown as TLAssetStore,
      getPersistenceToken: vi.fn(
        async (): Promise<string | null> => null,
      ),
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
`,
  )
}

function main() {
  patchPublicApi()
  patchCanvasDocumentService()
  patchOpenRollbackTest()
  patchRegistryTest()
  console.log('Typecheck fixes applied.')
}

main()