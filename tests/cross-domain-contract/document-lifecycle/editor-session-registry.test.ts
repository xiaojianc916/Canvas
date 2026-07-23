import {
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
