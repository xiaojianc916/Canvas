#!/usr/bin/env node
/**
 * refactor.mjs
 *
 * 迁移 document 生命周期测试：
 * - 删除 filePath / DrawPersistencePort / CanvasFileSelectionPort 测试模型
 * - 使用 DocumentId / DocumentPersistencePort
 * - 覆盖 native open、首次 saveAs、后续 save、关闭释放 documentId
 *
 * 使用：
 *   node refactor.mjs --write
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const files = {
  documentSession: resolve(
    'tests/cross-domain-contract/document-lifecycle/document-session.test.ts',
  ),
  documentService: resolve(
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
  ),
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

const documentSessionTest = `import { createDocumentSession } from '@hybrid-canvas/document'
import type { TLEditorSnapshot } from 'tldraw'
import { describe, expect, it } from 'vitest'

function snapshot(documentValue: unknown): TLEditorSnapshot {
  return {
    document: documentValue,
    session: {},
  } as unknown as TLEditorSnapshot
}

describe('DocumentSession', () => {
  it('initializes a new unsaved document as clean', () => {
    const session = createDocumentSession(null)

    session.initialize(
      snapshot({
        records: {
          page: {
            id: 'page:1',
          },
        },
      }),
    )

    expect(session.getSnapshot()).toEqual({
      phase: 'ready',
      persistence: 'clean',
      documentId: null,
    })
  })

  it('tracks an opaque document ID without storing a filesystem path', () => {
    const session = createDocumentSession('document-native-1')

    session.initialize(snapshot({ shapes: [] }))

    expect(session.getDocumentId()).toBe('document-native-1')
    expect(session.getSnapshot()).toEqual({
      phase: 'ready',
      persistence: 'clean',
      documentId: 'document-native-1',
    })
  })

  it('becomes dirty after a document change', () => {
    const session = createDocumentSession(null)

    session.initialize(snapshot({ shapes: [] }))

    session.recordDocumentChange(
      snapshot({
        shapes: [{ id: 'shape:1' }],
      }),
    )

    expect(session.isDirty()).toBe(true)
    expect(session.getSnapshot().persistence).toBe('dirty')
  })

  it('returns to clean when undo restores the saved checkpoint', () => {
    const session = createDocumentSession(null)

    const baseline = snapshot({ shapes: [] })

    session.initialize(baseline)

    session.recordDocumentChange(
      snapshot({
        shapes: [{ id: 'shape:1' }],
      }),
    )

    expect(session.isDirty()).toBe(true)

    session.recordDocumentChange(baseline)

    expect(session.isDirty()).toBe(false)
    expect(session.getSnapshot().persistence).toBe('clean')
  })

  it('ignores object key insertion order', () => {
    const session = createDocumentSession(null)

    session.initialize(
      snapshot({
        alpha: 1,
        beta: 2,
      }),
    )

    session.recordDocumentChange(
      snapshot({
        beta: 2,
        alpha: 1,
      }),
    )

    expect(session.isDirty()).toBe(false)
  })

  it('stays dirty when editing continues during save', () => {
    const session = createDocumentSession(null)

    session.initialize(snapshot({ shapes: [] }))

    const ticket = session.beginSave(
      snapshot({
        shapes: [{ id: 'shape:1' }],
      }),
    )

    session.recordDocumentChange(
      snapshot({
        shapes: [{ id: 'shape:1' }, { id: 'shape:2' }],
      }),
    )

    session.completeSave(ticket, 'document-native-1')

    expect(session.isDirty()).toBe(true)
    expect(session.getSnapshot()).toEqual({
      phase: 'ready',
      persistence: 'dirty',
      documentId: 'document-native-1',
    })
  })

  it('becomes clean after first Save As assigns a native document ID', () => {
    const session = createDocumentSession(null)

    const current = snapshot({
      shapes: [{ id: 'shape:1' }],
    })

    session.initialize(snapshot({ shapes: [] }))
    session.recordDocumentChange(current)

    const ticket = session.beginSave(current)

    session.completeSave(ticket, 'document-native-created')

    expect(session.isDirty()).toBe(false)
    expect(session.getSnapshot()).toEqual({
      phase: 'ready',
      persistence: 'clean',
      documentId: 'document-native-created',
    })
  })

  it('enters failed state after a native save failure', () => {
    const session = createDocumentSession('document-native-1')

    const current = snapshot({ shapes: [] })

    session.initialize(current)

    const ticket = session.beginSave(current)

    session.failSave(ticket)

    expect(session.getSnapshot()).toEqual({
      phase: 'save-failed',
      persistence: 'failed',
      documentId: 'document-native-1',
    })
  })
})
`

const documentServiceTest = `import type {
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
`

await Promise.all([
  write(files.documentSession, documentSessionTest),
  write(files.documentService, documentServiceTest),
])

console.log('已完成 document 生命周期测试迁移：')
console.log('- document-session.test.ts')
console.log('- canvas-document-service.test.ts')
console.log('')
console.log('执行：')
console.log('  pnpm format')
console.log('  pnpm test')
console.log('  pnpm typecheck')