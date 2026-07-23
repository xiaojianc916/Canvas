import type {
  EditorDocumentEvent,
  EditorSession,
} from '@hybrid-canvas/canvas/application'
import { createCanvasDocumentService } from '@hybrid-canvas/document'
import { serializeDrawDocument } from '@hybrid-canvas/file'
import {
  createTLStore,
  getSnapshot,
  type TLEditorSnapshot,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

function validSnapshot(): TLEditorSnapshot {
  /*
   * Never handwrite a partial TLEditorSnapshot fixture. A snapshot includes
   * serialized store schema and session state that are owned by tldraw.
   */
  return getSnapshot(createTLStore({}))
}

function snapshot(documentValue: unknown): TLEditorSnapshot {
  /*
   * Lifecycle tests trigger their mocked editor change notification explicitly.
   * Keep their persisted value a real, tldraw-generated snapshot rather than
   * manufacturing invalid pseudo-records.
   */
  void documentValue

  return validSnapshot()
}

function createHarness() {
  let currentSnapshot = snapshot({ shapes: [] })

  const documentListeners = new Set<(event: EditorDocumentEvent) => void>()
  const closeEditorSession = vi.fn()

  const persistence = {
    open: vi.fn(),
    save: vi.fn().mockResolvedValue({
      revision: 'revision-next',
    }),
    saveAs: vi.fn(),
    close: vi.fn(),
  }

  const editor = {
    sessionId: 'editor-session',
    documentId: 'editor-document',

    captureDocument() {
      return currentSnapshot.document
    },

    getSnapshot() {
      return currentSnapshot
    },

    subscribeDocumentEvents(listener: (event: EditorDocumentEvent) => void) {
      documentListeners.add(listener)

      return () => {
        documentListeners.delete(listener)
      }
    },
  } as unknown as EditorSession

  const service = createCanvasDocumentService({
    editorSessions: {
      create: () => editor,
      close: closeEditorSession,
      dispose: vi.fn(),
    },
    persistence,
    extensions: [],
  })

  return {
    service,
    persistence,
    closeEditorSession,

    ready() {
      for (const listener of documentListeners) {
        listener({ kind: 'ready' })
      }
    },

    change(nextSnapshot: TLEditorSnapshot) {
      currentSnapshot = nextSnapshot

      for (const listener of documentListeners) {
        listener({ kind: 'changed' })
      }
    },
  }
}

describe('Canvas document native-release contract', () => {
  it('releases a clean unsaved canvas without invoking native document_close', async () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.persistence.close).not.toHaveBeenCalled()
    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
    expect(harness.service.getEditorSession(opened.sessionId)).toBeNull()
  })

  it('requires an explicit discard intent for dirty canvases', async () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }] }))

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'confirmation-required',
    })

    expect(harness.service.getEditorSession(opened.sessionId)).not.toBeNull()

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'discard'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
  })

  it('rejects an unwrapped tldraw snapshot instead of guessing a legacy format', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-unwrapped-snapshot',
      displayName: 'legacy.draw',
      revision: 'revision-current',
      content: JSON.stringify({
        document: {
          shapes: [],
        },
        session: {},
      }),
    })

    await expect(harness.service.open()).rejects.toThrow('DRAW_INVALID_HEADER')
  })

  it('opens through the native gateway without exposing a filesystem path', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-opened',
      displayName: 'architecture.draw',
      revision: 'revision-current',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    await expect(harness.service.open()).resolves.toEqual({
      canvasId: expect.any(String),
      sessionId: expect.any(String),
      title: 'architecture.draw',
    })
  })

  it('uses Save As once and retains only an opaque native document ID', async () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }]}))

    harness.persistence.saveAs.mockResolvedValue({
      id: 'native-document-created',
      displayName: 'untitled.draw',
      revision: 'revision-current',
    })

    await harness.service.save(opened.sessionId)

    expect(harness.persistence.saveAs).toHaveBeenCalledWith(
      expect.any(String),
      {
        suggestedName: '未命名画布.draw',
      },
    )

    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })
  })

  it('uses native document_save for an opened native document', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-existing',
      displayName: 'existing.draw',
      revision: 'revision-current',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }]}))

    await harness.service.save(opened.sessionId)

    expect(harness.persistence.save).toHaveBeenCalledWith(
      'native-document-existing',
      'revision-current',
      expect.any(String),
    )
  })

  it('settles an active save inside the same release transaction', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-saving',
      displayName: 'saving.draw',
      revision: 'revision-current',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }]}))

    let resolveSave!: () => void

    const pendingSave = new Promise<{
      readonly revision: string
    }>((resolve) => {
      resolveSave = () =>
        resolve({ revision: 'revision-next' })
    })

    harness.persistence.save.mockImplementation(() => pendingSave)

    const saving = harness.service.save(opened.sessionId)
    const releasing = harness.service.releaseCanvas(
      opened.sessionId,
      'discard',
    )

    expect(harness.persistence.close).not.toHaveBeenCalled()

    resolveSave()

    await saving

    await expect(releasing).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.persistence.close).toHaveBeenCalledWith(
      'native-document-saving',
    )
  })

  it('requires confirmation after a save fails before normal close', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-save-failure',
      displayName: 'save-failure.draw',
      revision: 'revision-current',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }]}))

    harness.persistence.save.mockRejectedValue(
      new Error('native document_save rejected'),
    )

    await expect(harness.service.save(opened.sessionId)).rejects.toThrow(
      'native document_save rejected',
    )

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'confirmation-required',
    })

    expect(harness.persistence.close).not.toHaveBeenCalled()
    expect(harness.closeEditorSession).not.toHaveBeenCalled()
  })

  it('keeps the editor and document session alive after native release failure', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-release-failure',
      displayName: 'failure.draw',
      revision: 'revision-current',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()

    harness.persistence.close.mockRejectedValue(
      Object.assign(new Error('native document_close rejected'), {
        details: {
          code: 'permission-denied',
          recoverable: true,
        },
      }),
    )

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'release-failed',
      failure: {
        code: 'permission-denied',
        recoverable: true,
      },
    })

    expect(harness.closeEditorSession).not.toHaveBeenCalled()
    expect(harness.service.getEditorSession(opened.sessionId)).not.toBeNull()
    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })

    harness.persistence.close.mockResolvedValue(undefined)

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
  })
})
