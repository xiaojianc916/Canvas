import type {
  EditorSession,
  EditorSessionRegistry,
} from '@hybrid-canvas/canvas/application'
import type { HybridCanvasExtension } from '@hybrid-canvas/canvas/extensions'
import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'

import {
  createDocumentSession,
  type DocumentPersistenceState,
  type DocumentSaveTicket,
  type DocumentSession,
} from '../domain/document-session'
import type {
  EditorDocumentEvent,
  EditorDocumentPort,
} from '../ports/editor-document-port'

export type CanvasId = string
export type CanvasSessionId = string
export type CanvasPersistenceState = DocumentPersistenceState

export interface OpenedCanvasSession {
  readonly canvasId: CanvasId
  readonly sessionId: CanvasSessionId
  readonly title: string
}

export interface CanvasSessionSnapshot {
  readonly sessionId: CanvasSessionId
  readonly persistence: CanvasPersistenceState
}

export type CanvasCloseDecision =
  | { readonly kind: 'close-now' }
  | {
      readonly kind: 'confirm-discard'
      readonly persistence: 'dirty' | 'failed'
    }
  | {
      readonly kind: 'wait-for-save'
      readonly operation: Promise<void>
    }
  | { readonly kind: 'not-found' }

export type ApplicationClosePlan =
  | { readonly kind: 'close-now' }
  | {
      readonly kind: 'confirm-discard'
      readonly sessionIds: readonly CanvasSessionId[]
    }
  | {
      readonly kind: 'wait-for-saves'
      readonly operations: readonly Promise<void>[]
    }

export interface CanvasDocumentService {
  readonly create: (title: string) => OpenedCanvasSession
  readonly open: () => Promise<OpenedCanvasSession | null>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (sessionId: CanvasSessionId) => CanvasCloseDecision
  readonly close: (sessionId: CanvasSessionId) => Promise<void>
  readonly discardAndClose: (sessionId: CanvasSessionId) => Promise<void>
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void
}

export interface CanvasEditorSessionRegistryPort {
  readonly create: EditorSessionRegistry['create']
  readonly close: EditorSessionRegistry['close']
  readonly dispose: EditorSessionRegistry['dispose']
}

export interface OpenedNativeDocument {
  readonly id: string
  readonly displayName: string
  readonly content: string
}

export interface SavedNativeDocument {
  readonly id: string
  readonly displayName: string
}

export interface DocumentPersistencePort {
  readonly open: () => Promise<OpenedNativeDocument | null>
  readonly save: (documentId: string, content: string) => Promise<void>
  readonly saveAs: (
    content: string,
    options: {
      readonly documentId?: string
      readonly suggestedName?: string
    },
  ) => Promise<SavedNativeDocument | null>
  readonly close: (documentId: string) => Promise<void>
}

export interface CreateCanvasDocumentServiceDependencies {
  readonly editorSessions: CanvasEditorSessionRegistryPort
  readonly persistence: DocumentPersistencePort
  readonly extensions: readonly HybridCanvasExtension[]
}

interface OwnedCanvasSession {
  readonly editor: EditorSession
  readonly editorDocument: EditorDocumentPort
  readonly document: DocumentSession
  stopObservingDocument: () => void
  saveOperation: Promise<void> | null
}

export function createCanvasDocumentService({
  editorSessions,
  persistence,
  extensions,
}: CreateCanvasDocumentServiceDependencies): CanvasDocumentService {
  const sessions = new Map<CanvasSessionId, OwnedCanvasSession>()
  const listeners = new Set<() => void>()
  let version = 0

  function emit() {
    version += 1

    for (const listener of listeners) {
      listener()
    }
  }

  function create(title: string): OpenedCanvasSession {
    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()

    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      extensions,
    })

    sessions.set(sessionId, createOwnedSession(editor, null))

    return { canvasId, sessionId, title }
  }

  async function open(): Promise<OpenedCanvasSession | null> {
    const opened = await persistence.open()

    if (!opened) {
      return null
    }

    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const initialSnapshot = parseEditorSnapshot(opened.content)

    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      initialSnapshot,
      extensions,
    })

    sessions.set(sessionId, createOwnedSession(editor, opened.id))

    return {
      canvasId,
      sessionId,
      title: opened.displayName,
    }
  }

  function createOwnedSession(
    editor: EditorSession,
    documentId: string | null,
  ): OwnedCanvasSession {
    const editorDocument: EditorDocumentPort = editor
    const document = createDocumentSession(documentId)

    const owned: OwnedCanvasSession = {
      editor,
      editorDocument,
      document,
      stopObservingDocument: () => {},
      saveOperation: null,
    }

    owned.stopObservingDocument = editorDocument.subscribeDocumentEvents(
      (event) => {
        if (event.kind === 'ready') {
          if (!document.isInitialized()) {
            document.initialize(editorDocument.captureDocument())
            emit()
          }

          return
        }

        if (!document.isInitialized()) {
          throw new Error('DOCUMENT_CHANGE_BEFORE_EDITOR_READY')
        }

        document.recordDocumentChange(editorDocument.captureDocument())
        emit()
      },
    )

    return owned
  }

  function save(sessionId: CanvasSessionId): Promise<void> {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      return owned.saveOperation
    }

    owned.saveOperation = performSave(owned).finally(() => {
      owned.saveOperation = null
    })

    return owned.saveOperation
  }

  async function performSave(owned: OwnedCanvasSession): Promise<void> {
    if (!owned.document.isInitialized()) {
      throw new Error('DOCUMENT_SESSION_NOT_READY')
    }

    const snapshot = owned.editorDocument.captureDocument()
    const ticket = owned.document.beginSave(snapshot)

    emit()

    try {
      const content = serializeDrawDocument(snapshot)
      const currentDocumentId = owned.document.getDocumentId()

      const saved = currentDocumentId
        ? await saveExistingDocument(currentDocumentId, content)
        : await persistence.saveAs(content, {
            suggestedName: '未命名画布.draw',
          })

      if (!saved) {
        owned.document.failSave(ticket)
        emit()
        return
      }

      owned.document.completeSave(ticket, saved.id)
      emit()
    } catch (error) {
      owned.document.failSave(ticket)
      emit()
      throw error
    }
  }

  async function saveExistingDocument(
    documentId: string,
    content: string,
  ): Promise<SavedNativeDocument> {
    await persistence.save(documentId, content)

    return {
      id: documentId,
      displayName: '',
    }
  }

  function requestClose(sessionId: CanvasSessionId): CanvasCloseDecision {
    const owned = sessions.get(sessionId)

    if (!owned) {
      return { kind: 'not-found' }
    }

    if (owned.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: owned.saveOperation,
      }
    }

    const state = owned.document.getSnapshot().persistence

    if (state === 'dirty' || state === 'failed') {
      return {
        kind: 'confirm-discard',
        persistence: state,
      }
    }

    return { kind: 'close-now' }
  }

  async function close(sessionId: CanvasSessionId): Promise<void> {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    const state = owned.document.getSnapshot().persistence

    if (state === 'dirty' || state === 'failed') {
      throw new Error('CANVAS_SESSION_DISCARD_CONFIRMATION_REQUIRED')
    }

    await closeNow(sessionId, owned)
  }

  async function discardAndClose(sessionId: CanvasSessionId): Promise<void> {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    await closeNow(sessionId, owned)
  }

  async function closeNow(
    sessionId: CanvasSessionId,
    owned: OwnedCanvasSession,
  ): Promise<void> {
    owned.document.beginClosing()
    emit()

    const documentId = owned.document.getDocumentId()

    try {
      if (documentId) {
        await persistence.close(documentId)
      }
    } catch (error) {
      owned.document.cancelClosing()
      emit()
      throw error
    }

    owned.document.completeClosing()
    owned.stopObservingDocument()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
    emit()
  }

  function planApplicationClose(): ApplicationClosePlan {
    const operations: Promise<void>[] = []
    const dirtySessionIds: CanvasSessionId[] = []

    for (const [sessionId, owned] of sessions) {
      if (owned.saveOperation) {
        operations.push(owned.saveOperation)
        continue
      }

      const state = owned.document.getSnapshot().persistence

      if (state === 'dirty' || state === 'failed') {
        dirtySessionIds.push(sessionId)
      }
    }

    if (operations.length > 0) {
      return { kind: 'wait-for-saves', operations }
    }

    if (dirtySessionIds.length > 0) {
      return { kind: 'confirm-discard', sessionIds: dirtySessionIds }
    }

    return { kind: 'close-now' }
  }

  function requireSession(sessionId: CanvasSessionId) {
    const owned = sessions.get(sessionId)

    if (!owned) {
      throw new Error('CANVAS_SESSION_NOT_FOUND')
    }

    return owned
  }

  return {
    create,
    open,
    save,
    requestClose,
    close,
    discardAndClose,
    planApplicationClose,

    getEditorSession(sessionId) {
      return sessions.get(sessionId)?.editor ?? null
    },

    getSessionSnapshot(sessionId) {
      const owned = sessions.get(sessionId)

      return owned
        ? {
            sessionId,
            persistence: owned.document.getSnapshot().persistence,
          }
        : null
    },

    getVersion() {
      return version
    },

    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },

    dispose() {
      for (const [sessionId, owned] of sessions) {
        // dispose 只在应用运行时被销毁时执行。此时 native process 的退出会
        // 统一释放 DocumentRegistry；不得在这里 fire-and-forget document_close。
        owned.stopObservingDocument()
        editorSessions.close(sessionId)
      }

      sessions.clear()
      listeners.clear()
      editorSessions.dispose()
    },
  }
}

function parseEditorSnapshot(json: string): TLEditorSnapshot {
  try {
    return parseDrawDocument(json).content
  } catch (containerError) {
    try {
      const parsed: unknown = JSON.parse(json)

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'document' in parsed &&
        'session' in parsed
      ) {
        return parsed as TLEditorSnapshot
      }
    } catch {
      // Preserve the validated container error.
    }

    throw containerError
  }
}
