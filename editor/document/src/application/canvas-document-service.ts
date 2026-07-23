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

export type CanvasCloseIntent = 'normal' | 'discard'

export type CanvasReleaseFailureCode =
  | 'permission-denied'
  | 'persistence'
  | 'not-found'
  | 'platform'

export interface CanvasReleaseFailure {
  readonly code: CanvasReleaseFailureCode
  readonly recoverable: boolean
}

export type CanvasCloseState =
  | {
      readonly state: 'confirmation-required'
    }
  | {
      readonly state: 'releasing'
      readonly intent: CanvasCloseIntent
    }
  | {
      readonly state: 'release-failed'
      readonly intent: CanvasCloseIntent
      readonly failure: CanvasReleaseFailure
    }

export interface CanvasCloseSnapshot {
  readonly states: Readonly<Record<CanvasSessionId, CanvasCloseState>>
}

export type CanvasReleaseResult =
  | { readonly kind: 'released' }
  | { readonly kind: 'confirmation-required' }
  | {
      readonly kind: 'release-failed'
      readonly failure: CanvasReleaseFailure
    }
  | { readonly kind: 'not-found' }

export interface CanvasDocumentLifecycleSnapshot {
  readonly savingOperations: readonly Promise<void>[]
  readonly unsavedSessionIds: readonly CanvasSessionId[]
}

export interface CanvasDocumentService {
  readonly create: (title: string) => OpenedCanvasSession
  readonly open: () => Promise<OpenedCanvasSession | null>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly releaseCanvas: (
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ) => Promise<CanvasReleaseResult>
  readonly getLifecycleSnapshot: () => CanvasDocumentLifecycleSnapshot
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

    /*
     * Native document_open registers an opaque document handle before the
     * renderer can validate the logical .draw payload with the complete tldraw
     * extension schema.
     *
     * Treat parsing, configured store creation and session registration as one
     * transaction. Until sessions.set() succeeds, any failure must release the
     * native document handle.
     */
    try {
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
    } catch (openError) {
      return rollbackOpenedNativeDocument(opened.id, openError)
    }
  }

  async function rollbackOpenedNativeDocument(
    documentId: string,
    openError: unknown,
  ): Promise<never> {
    try {
      await persistence.close(documentId)
    } catch (rollbackError) {
      /*
       * Never hide a leaked native handle behind the original parsing or
       * tldraw validation error. Preserve both failures for diagnostics while
       * exposing a stable application-level failure message.
       */
      throw new AggregateError(
        [openError, rollbackError],
        'DOCUMENT_OPEN_ROLLBACK_FAILED',
      )
    }

    throw openError
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

  async function releaseCanvas(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<CanvasReleaseResult> {
    const owned = sessions.get(sessionId)

    if (!owned) {
      return { kind: 'not-found' }
    }

    while (owned.saveOperation) {
      await owned.saveOperation.catch(() => undefined)
    }

    const persistenceState = owned.document.getSnapshot().persistence

    if (
      intent === 'normal' &&
      (persistenceState === 'dirty' || persistenceState === 'failed')
    ) {
      return { kind: 'confirmation-required' }
    }

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

      return {
        kind: 'release-failed',
        failure: toCanvasReleaseFailure(error),
      }
    }

    owned.document.completeClosing()
    owned.stopObservingDocument()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
    emit()

    return { kind: 'released' }
  }

  function toCanvasReleaseFailure(error: unknown): CanvasReleaseFailure {
    if (
      typeof error === 'object' &&
      error !== null &&
      'details' in error &&
      typeof error.details === 'object' &&
      error.details !== null
    ) {
      const details = error.details as Record<string, unknown>
      const code = details['code']
      const recoverable = details['recoverable']

      if (
        (code === 'permission-denied' ||
          code === 'persistence' ||
          code === 'not-found' ||
          code === 'platform') &&
        typeof recoverable === 'boolean'
      ) {
        return {
          code,
          recoverable,
        }
      }
    }

    return {
      code: 'platform',
      recoverable: false,
    }
  }

  function getLifecycleSnapshot(): CanvasDocumentLifecycleSnapshot {
    const savingOperations: Promise<void>[] = []
    const unsavedSessionIds: CanvasSessionId[] = []

    for (const [sessionId, owned] of sessions) {
      if (owned.saveOperation) {
        savingOperations.push(owned.saveOperation)
        continue
      }

      const persistence = owned.document.getSnapshot().persistence

      if (persistence === 'dirty' || persistence === 'failed') {
        unsavedSessionIds.push(sessionId)
      }
    }

    return {
      savingOperations,
      unsavedSessionIds,
    }
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
    releaseCanvas,
    getLifecycleSnapshot,

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
  /*
   * The application has exactly one supported persisted-document wire format:
   * the versioned Hybrid Canvas .draw container.
   *
   * Do not add a fallback that guesses whether arbitrary JSON is a tldraw
   * snapshot. Legacy formats must be recognized by an explicit importer or
   * migration pipeline with a bounded compatibility policy; they must never
   * bypass the canonical file-format validation path.
   */
  return parseDrawDocument(json).content
}
