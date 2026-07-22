import type { EditorSession, EditorSessionRegistry } from '@hybrid-canvas/canvas/application'
import type { HybridCanvasExtension } from '@hybrid-canvas/canvas/extensions'
import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'

import {
  createDocumentSession,
  type DocumentSaveTicket,
  type DocumentSession,
  type DocumentPersistenceState,
} from '../domain/document-session'
import type { EditorDocumentEvent, EditorDocumentPort } from '../ports/editor-document-port'

// Tests: tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

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
  | {
      readonly kind: 'close-now'
    }
  | {
      readonly kind: 'confirm-discard'
      readonly persistence: 'dirty' | 'failed'
    }
  | {
      readonly kind: 'wait-for-save'
      readonly operation: Promise<void>
    }
  | {
      readonly kind: 'not-found'
    }

export type ApplicationClosePlan =
  | {
      readonly kind: 'close-now'
    }
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

  readonly discardAndClose: (sessionId: CanvasSessionId) => void

  readonly planApplicationClose: () => ApplicationClosePlan

  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null

  readonly getSessionSnapshot: (sessionId: CanvasSessionId) => CanvasSessionSnapshot | null

  readonly getVersion: () => number

  readonly subscribe: (listener: () => void) => () => void

  readonly dispose: () => void
}

export interface CanvasEditorSessionRegistryPort {
  readonly create: EditorSessionRegistry['create']

  readonly close: EditorSessionRegistry['close']

  readonly dispose: EditorSessionRegistry['dispose']
}

export interface DrawPersistencePort {
  readonly read: (path: string) => Promise<string>

  readonly write: (path: string, content: string) => Promise<void>
}

export interface CanvasFileSelectionPort {
  readonly selectOpenPath: () => Promise<string | null>

  readonly selectSavePath: (suggestedName: string) => Promise<string | null>
}

export interface CreateCanvasDocumentServiceDependencies {
  readonly editorSessions: CanvasEditorSessionRegistryPort

  readonly persistence: DrawPersistencePort

  readonly fileSelection: CanvasFileSelectionPort

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
  fileSelection,
  extensions,
}: CreateCanvasDocumentServiceDependencies): CanvasDocumentService {
  const sessions = new Map<CanvasSessionId, OwnedCanvasSession>()

  const listeners = new Set<() => void>()

  let version = 0

  function emit(): void {
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

    const owned = createOwnedSession(editor, null)

    sessions.set(sessionId, owned)

    return {
      canvasId,
      sessionId,
      title,
    }
  }

  async function open(): Promise<OpenedCanvasSession | null> {
    const filePath = await fileSelection.selectOpenPath()

    if (!filePath) {
      return null
    }

    const content = await persistence.read(filePath)

    const initialSnapshot = parseEditorSnapshot(content)

    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()

    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      initialSnapshot,
      extensions,
    })

    const owned = createOwnedSession(editor, filePath)

    sessions.set(sessionId, owned)

    return {
      canvasId,
      sessionId,
      title: getFileTitle(filePath),
    }
  }

  function createOwnedSession(editor: EditorSession, filePath: string | null): OwnedCanvasSession {
    /*
     * EditorSession structurally implements EditorDocumentPort without
     * editor/core depending on editor/document.
     */
    const editorDocument: EditorDocumentPort = editor

    const document = createDocumentSession(filePath)

    const owned: OwnedCanvasSession = {
      editor,
      editorDocument,
      document,
      stopObservingDocument: () => {},
      saveOperation: null,
    }

    owned.stopObservingDocument = editorDocument.subscribeDocumentEvents((event) => {
      handleEditorDocumentEvent(owned, event)
    })

    return owned
  }

  function handleEditorDocumentEvent(owned: OwnedCanvasSession, event: EditorDocumentEvent): void {
    if (event.kind === 'ready') {
      /*
       * React StrictMode or tab remounting may attach the same session more
       * than once. Only the first explicit ready event establishes the saved
       * baseline.
       */
      if (!owned.document.isInitialized()) {
        owned.document.initialize(owned.editorDocument.captureDocument())

        emit()
      }

      return
    }

    if (!owned.document.isInitialized()) {
      throw new Error('DOCUMENT_CHANGE_BEFORE_EDITOR_READY')
    }

    owned.document.recordDocumentChange(owned.editorDocument.captureDocument())

    emit()
  }

  function save(sessionId: CanvasSessionId): Promise<void> {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      return owned.saveOperation
    }

    const operation = performSave(owned).finally(() => {
      owned.saveOperation = null
    })

    owned.saveOperation = operation

    return operation
  }

  async function performSave(owned: OwnedCanvasSession): Promise<void> {
    if (!owned.document.isInitialized()) {
      throw new Error('DOCUMENT_SESSION_NOT_READY')
    }

    const existingPath = owned.document.getFilePath()

    const filePath = existingPath ?? (await fileSelection.selectSavePath('未命名画布.draw'))

    if (!filePath) {
      return
    }

    /*
     * Snapshot and save checkpoint are created from the same synchronous
     * capture. Concurrent edits after this point update currentCheckpoint but
     * cannot incorrectly become part of the completed savepoint.
     */
    const snapshot = owned.editorDocument.captureDocument()

    let ticket: DocumentSaveTicket | null = null

    try {
      ticket = owned.document.beginSave(snapshot)

      emit()

      const content = serializeDrawDocument(snapshot)

      await persistence.write(filePath, content)

      owned.document.completeSave(ticket, filePath)

      emit()
    } catch (error) {
      if (ticket) {
        owned.document.failSave(ticket)
        emit()
      }

      throw error
    }
  }

  function requestClose(sessionId: CanvasSessionId): CanvasCloseDecision {
    const owned = sessions.get(sessionId)

    if (!owned) {
      return {
        kind: 'not-found',
      }
    }

    if (owned.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: owned.saveOperation,
      }
    }

    const persistenceState = owned.document.getSnapshot().persistence

    if (persistenceState === 'dirty' || persistenceState === 'failed') {
      return {
        kind: 'confirm-discard',
        persistence: persistenceState,
      }
    }

    closeNow(sessionId, owned)

    return {
      kind: 'close-now',
    }
  }

  function discardAndClose(sessionId: CanvasSessionId): void {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    closeNow(sessionId, owned)
  }

  function closeNow(sessionId: CanvasSessionId, owned: OwnedCanvasSession): void {
    owned.document.beginClosing()
    owned.document.completeClosing()

    release(sessionId, owned)
    emit()
  }

  function release(sessionId: CanvasSessionId, owned: OwnedCanvasSession): void {
    owned.stopObservingDocument()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
  }

  function planApplicationClose(): ApplicationClosePlan {
    const operations: Promise<void>[] = []
    const dirtySessionIds: CanvasSessionId[] = []

    for (const [sessionId, owned] of sessions) {
      if (owned.saveOperation) {
        operations.push(owned.saveOperation)

        continue
      }

      const persistenceState = owned.document.getSnapshot().persistence

      if (persistenceState === 'dirty' || persistenceState === 'failed') {
        dirtySessionIds.push(sessionId)
      }
    }

    if (operations.length > 0) {
      return {
        kind: 'wait-for-saves',
        operations,
      }
    }

    if (dirtySessionIds.length > 0) {
      return {
        kind: 'confirm-discard',
        sessionIds: dirtySessionIds,
      }
    }

    return {
      kind: 'close-now',
    }
  }

  function requireSession(sessionId: CanvasSessionId): OwnedCanvasSession {
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
    discardAndClose,
    planApplicationClose,

    getEditorSession(sessionId) {
      return sessions.get(sessionId)?.editor ?? null
    },

    getSessionSnapshot(sessionId) {
      const owned = sessions.get(sessionId)

      if (!owned) {
        return null
      }

      return {
        sessionId,
        persistence: owned.document.getSnapshot().persistence,
      }
    },

    getVersion() {
      return version
    },

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      for (const [sessionId, owned] of sessions) {
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

      if (isEditorSnapshot(parsed)) {
        return parsed
      }
    } catch {
      // Preserve the validated container error as the public failure.
    }

    throw containerError
  }
}

function isEditorSnapshot(value: unknown): value is TLEditorSnapshot {
  return typeof value === 'object' && value !== null && 'document' in value && 'session' in value
}

function getFileTitle(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')

  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1)

  return fileName.toLowerCase().endsWith('.draw') ? fileName.slice(0, -5) : fileName
}
