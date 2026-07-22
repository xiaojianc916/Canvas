import type { EditorSession } from '@hybrid-canvas/canvas/application'
import { describe, expect, it, vi } from 'vitest'

import { type CanvasDocumentService, createCanvasDocumentService } from './canvas-document-service'

type TestDocumentChange =
  | {
      readonly kind: 'baseline-established'
      readonly fingerprint: string
    }
  | {
      readonly kind: 'content-changed'
      readonly fingerprint: string
    }

interface Harness {
  readonly service: CanvasDocumentService
  readonly emitDocumentChange: (change: TestDocumentChange) => void
  readonly closeEditorSession: ReturnType<typeof vi.fn>
}

function createHarness(): Harness {
  let currentFingerprint = 'empty-store'
  let documentListener: ((change: TestDocumentChange) => void) | null = null

  const closeEditorSession = vi.fn()

  const editor = {
    sessionId: 'editor-session',
    documentId: 'document',
    getDocumentFingerprint() {
      return currentFingerprint
    },
    capturePersistenceSnapshot() {
      return {
        snapshot: {
          document: {},
          session: {},
        },
        fingerprint: currentFingerprint,
      }
    },
    onDocumentChange(listener: (change: TestDocumentChange) => void) {
      documentListener = listener
      return () => {
        documentListener = null
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

  return {
    service,
    closeEditorSession,
    emitDocumentChange(change) {
      currentFingerprint = change.fingerprint

      if (!documentListener) {
        throw new Error('TEST_DOCUMENT_LISTENER_NOT_REGISTERED')
      }

      documentListener(change)
    },
  }
}

describe('CanvasDocumentService dirty savepoint', () => {
  it('keeps a newly mounted empty canvas clean', () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.emitDocumentChange({
      kind: 'baseline-established',
      fingerprint: 'default-document-and-page',
    })

    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })

    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'close-now',
    })

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
  })

  it('marks real document content changes as dirty', () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.emitDocumentChange({
      kind: 'baseline-established',
      fingerprint: 'baseline',
    })

    harness.emitDocumentChange({
      kind: 'content-changed',
      fingerprint: 'baseline-plus-shape',
    })

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe('dirty')

    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'confirm-discard',
      persistence: 'dirty',
    })
  })

  it('returns to clean after undo reaches the savepoint', () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.emitDocumentChange({
      kind: 'baseline-established',
      fingerprint: 'baseline',
    })

    harness.emitDocumentChange({
      kind: 'content-changed',
      fingerprint: 'changed',
    })

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe('dirty')

    harness.emitDocumentChange({
      kind: 'content-changed',
      fingerprint: 'baseline',
    })

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe('clean')

    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'close-now',
    })
  })

  it('does not treat a second identical fingerprint as a change', () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.emitDocumentChange({
      kind: 'baseline-established',
      fingerprint: 'baseline',
    })

    harness.emitDocumentChange({
      kind: 'content-changed',
      fingerprint: 'baseline',
    })

    expect(harness.service.getSessionSnapshot(opened.sessionId)?.persistence).toBe('clean')
  })
})
