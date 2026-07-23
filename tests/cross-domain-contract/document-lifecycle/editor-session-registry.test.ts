import {
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
