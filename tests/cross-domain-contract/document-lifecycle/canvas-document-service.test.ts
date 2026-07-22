import type { EditorDocumentEvent, EditorSession } from '@hybrid-canvas/canvas/application'
import { createCanvasDocumentService } from '@hybrid-canvas/document'
import type { TLEditorSnapshot } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

function snapshot(documentValue: unknown): TLEditorSnapshot {
  return {
    document: documentValue,
    session: {},
  } as unknown as TLEditorSnapshot
}

function createHarness() {
  let currentSnapshot = snapshot({
    shapes: [],
  })

  const documentListeners = new Set<(event: EditorDocumentEvent) => void>()

  const closeEditorSession = vi.fn()

  const editor = {
    sessionId: 'editor-session',
    documentId: 'document',
    captureDocument() {
      return currentSnapshot
    },
    getSnapshot() {
      return currentSnapshot
    },
    subscribeDocumentEvents(
      listener: (
        event: EditorDocumentEvent,
      ) => void,
    ) {
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
    persistence: {
      read: vi.fn(),
      write: vi.fn(),
    },
    fileSelection: {
      selectOpenPath: vi.fn(),
      selectSavePath: vi.fn(),
    },
    extensions: [],
  })

  function emit(event: EditorDocumentEvent): void {
    for (const listener of documentListeners) {
      listener(event)
    }
  }

  return {
    service,
    closeEditorSession,

    ready() {
      emit({
        kind: 'ready',
      })
    },

    change(nextSnapshot: TLEditorSnapshot) {
      currentSnapshot = nextSnapshot

      emit({
        kind: 'changed',
      })
    },
  }
}

describe('CanvasDocumentService lifecycle contract', () => {
  it('closes a newly initialized blank canvas without confirmation', () => {
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
  })

  it('requires confirmation after a real document change', () => {
    const harness = createHarness()

    const opened = harness.service.create('未命名画布')

    harness.ready()

    harness.change(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe('dirty')

    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'confirm-discard',
      persistence: 'dirty',
    })
  })

  it('does not reset the savepoint when the editor attaches again', () => {
    const harness = createHarness()

    const opened = harness.service.create('未命名画布')

    harness.ready()

    harness.change(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    /*
     * Simulates React StrictMode or tab remounting.
     */
    harness.ready()

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe('dirty')
  })

  it('returns to clean when undo restores the initial checkpoint', () => {
    const harness = createHarness()

    const opened = harness.service.create('未命名画布')

    harness.ready()

    harness.change(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe('dirty')

    harness.change(
      snapshot({
        shapes: [],
      }),
    )

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe('clean')
  })
})
