import type {
  EditorDocumentEvent,
  EditorSession,
} from '@hybrid-canvas/canvas/application'
import { createCanvasDocumentService } from '@hybrid-canvas/document'
import { serializeDrawDocument } from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

function snapshot(documentValue: unknown): TLEditorSnapshot {
  return {
    document: documentValue,
    session: {},
  } as unknown as TLEditorSnapshot
}

function createHarness() {
  let currentSnapshot = snapshot({ shapes: [] })

  const documentListeners = new Set<(event: EditorDocumentEvent) => void>()
  const closeEditorSession = vi.fn()
  const persistence = {
    open: vi.fn(),
    save: vi.fn(),
    saveAs: vi.fn(),
    close: vi.fn(),
  }

  const editor = {
    sessionId: 'editor-session',
    documentId: 'editor-document',
    captureDocument() {
      return currentSnapshot
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

  function emit(event: EditorDocumentEvent) {
    for (const listener of documentListeners) {
      listener(event)
    }
  }

  return {
    service,
    persistence,
    closeEditorSession,

    ready() {
      emit({ kind: 'ready' })
    },

    change(nextSnapshot: TLEditorSnapshot) {
      currentSnapshot = nextSnapshot
      emit({ kind: 'changed' })
    },
  }
}

describe('CanvasDocumentService document-ID lifecycle contract', () => {
  it('closes a clean blank canvas without confirmation', async () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()

    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })

    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'close-now',
    })

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
    expect(harness.persistence.close).not.toHaveBeenCalled()
  })

  it('requires confirmation after a real document change', () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()

    harness.change(
      snapshot({
        shapes: [{ id: 'shape:1' }],
      }),
    )

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe(
      'dirty',
    )

    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'confirm-discard',
      persistence: 'dirty',
    })
  })

  it('opens through the native document gateway without exposing a path', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'document-native-opened',
      displayName: 'architecture.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    expect(opened).toEqual({
      canvasId: expect.any(String),
      sessionId: expect.any(String),
      title: 'architecture.draw',
    })

    expect(harness.persistence.open).toHaveBeenCalledOnce()
  })

  it('uses Save As once for an unsaved canvas and stores only document ID', async () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()

    harness.change(
      snapshot({
        shapes: [{ id: 'shape:1' }],
      }),
    )

    harness.persistence.saveAs.mockResolvedValue({
      id: 'document-native-created',
      displayName: 'untitled.draw',
    })

    await harness.service.save(opened.sessionId)

    expect(harness.persistence.saveAs).toHaveBeenCalledWith(
      expect.any(String),
      {
        suggestedName: '未命名画布.draw',
      },
    )

    expect(harness.persistence.save).not.toHaveBeenCalled()
    expect(
      harness.service.getSessionSnapshot(opened.sessionId)?.persistence,
    ).toBe('clean')
  })

  it('uses document_save after a native document has been opened', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'document-native-existing',
      displayName: 'existing.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected document to open')
    }

    harness.ready()

    harness.change(
      snapshot({
        shapes: [{ id: 'shape:1' }],
      }),
    )

    await harness.service.save(opened.sessionId)

    expect(harness.persistence.save).toHaveBeenCalledWith(
      'document-native-existing',
      expect.any(String),
    )

    expect(harness.persistence.saveAs).not.toHaveBeenCalled()
  })

  it('releases native document ID when a clean opened canvas closes', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'document-native-close',
      displayName: 'close.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected document to open')
    }

    harness.ready()

    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'close-now',
    })

    await Promise.resolve()

    expect(harness.persistence.close).toHaveBeenCalledWith(
      'document-native-close',
    )
  })
})
