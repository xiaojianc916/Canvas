import type { EditorSession, EditorSessionRegistry } from '@hybrid-canvas/canvas/application'
import type { HybridCanvasExtension } from '@hybrid-canvas/canvas/extensions'
import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'

export type CanvasId = string
export type CanvasSessionId = string

export type CanvasPersistenceState = 'clean' | 'dirty' | 'saving' | 'failed'

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
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (sessionId: CanvasSessionId) => CanvasSessionSnapshot | null
  /**
   * Monotonically increasing external-store snapshot.
   *
   * React consumers subscribe through subscribe() and read this value through
   * useSyncExternalStore(). The value changes whenever a public session
   * snapshot may have changed.
   */
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

type CanvasSessionState = 'clean' | 'dirty' | 'saving' | 'failed' | 'closing' | 'closed'

interface OwnedCanvasSession {
  readonly editor: EditorSession
  stopObserving: () => void
  filePath: string | null
  revision: number
  savedRevision: number
  state: CanvasSessionState
  saveOperation: Promise<void> | null
}

const ALLOWED_TRANSITIONS: Readonly<Record<CanvasSessionState, readonly CanvasSessionState[]>> = {
  clean: ['dirty', 'saving', 'closing'],
  dirty: ['saving', 'closing'],
  saving: ['clean', 'dirty', 'failed'],
  failed: ['dirty', 'saving', 'closing'],
  closing: ['closed'],
  closed: [],
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

    sessions.set(sessionId, createOwnedSession(editor, null, 'dirty'))

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

    sessions.set(sessionId, createOwnedSession(editor, filePath, 'clean'))

    return {
      canvasId,
      sessionId,
      title: getFileTitle(filePath),
    }
  }

  function save(sessionId: CanvasSessionId): Promise<void> {
    const session = requireSession(sessionId)

    if (session.saveOperation) {
      return session.saveOperation
    }

    const operation = performSave(session).finally(() => {
      session.saveOperation = null
    })

    session.saveOperation = operation
    return operation
  }

  async function performSave(session: OwnedCanvasSession): Promise<void> {
    const filePath = session.filePath ?? (await fileSelection.selectSavePath('未命名画布.draw'))

    if (!filePath) {
      return
    }

    const capturedRevision = session.revision
    transition(session, 'saving')
    emit()

    try {
      const snapshot = session.editor.getSnapshot()
      const content = serializeDrawDocument(snapshot)

      await persistence.write(filePath, content)

      session.filePath = filePath
      session.savedRevision = capturedRevision

      transition(session, session.revision === capturedRevision ? 'clean' : 'dirty')
      emit()
    } catch (error) {
      transition(session, 'failed')
      emit()
      throw error
    }
  }

  function requestClose(sessionId: CanvasSessionId): CanvasCloseDecision {
    const session = sessions.get(sessionId)

    if (!session) {
      return { kind: 'not-found' }
    }

    if (session.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: session.saveOperation,
      }
    }

    if (session.state === 'dirty' || session.state === 'failed') {
      return {
        kind: 'confirm-discard',
        persistence: session.state,
      }
    }

    closeNow(sessionId, session)
    return { kind: 'close-now' }
  }

  function discardAndClose(sessionId: CanvasSessionId): void {
    const session = requireSession(sessionId)

    if (session.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    closeNow(sessionId, session)
  }

  function closeNow(sessionId: CanvasSessionId, session: OwnedCanvasSession): void {
    transition(session, 'closing')
    transition(session, 'closed')
    release(sessionId)
    emit()
  }

  function release(sessionId: CanvasSessionId): void {
    const session = sessions.get(sessionId)

    session?.stopObserving()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
  }

  function planApplicationClose(): ApplicationClosePlan {
    const operations: Promise<void>[] = []
    const sessionIds: CanvasSessionId[] = []

    for (const [sessionId, session] of sessions) {
      if (session.saveOperation) {
        operations.push(session.saveOperation)
      } else if (session.state === 'dirty' || session.state === 'failed') {
        sessionIds.push(sessionId)
      }
    }

    if (operations.length > 0) {
      return {
        kind: 'wait-for-saves',
        operations,
      }
    }

    if (sessionIds.length > 0) {
      return {
        kind: 'confirm-discard',
        sessionIds,
      }
    }

    return { kind: 'close-now' }
  }

  function createOwnedSession(
    editor: EditorSession,
    filePath: string | null,
    initialState: 'clean' | 'dirty',
  ): OwnedCanvasSession {
    const session: OwnedCanvasSession = {
      editor,
      filePath,
      revision: 0,
      savedRevision: initialState === 'clean' ? 0 : -1,
      state: initialState,
      saveOperation: null,
      stopObserving: () => {},
    }

    session.stopObserving = editor.onUserDocumentChange(() => {
      if (session.state === 'closing' || session.state === 'closed') {
        return
      }

      session.revision += 1

      if (session.state !== 'saving' && session.state !== 'dirty') {
        transition(session, 'dirty')
        emit()
      }
    })

    return session
  }

  function requireSession(sessionId: CanvasSessionId): OwnedCanvasSession {
    const session = sessions.get(sessionId)

    if (!session) {
      throw new Error('CANVAS_SESSION_NOT_FOUND')
    }

    return session
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
      const session = sessions.get(sessionId)

      if (!session) {
        return null
      }

      return {
        sessionId,
        persistence: toPersistenceState(session.state),
      }
    },

    getVersion: () => version,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose() {
      for (const session of sessions.values()) {
        session.stopObserving()
      }

      sessions.clear()
      editorSessions.dispose()
    },
  }
}

function transition(session: OwnedCanvasSession, nextState: CanvasSessionState): void {
  if (session.state === nextState) {
    return
  }

  if (!ALLOWED_TRANSITIONS[session.state].includes(nextState)) {
    throw new Error(`CANVAS_SESSION_INVALID_TRANSITION:${session.state}->${nextState}`)
  }

  session.state = nextState
}

function toPersistenceState(state: CanvasSessionState): CanvasPersistenceState {
  switch (state) {
    case 'clean':
    case 'dirty':
    case 'saving':
    case 'failed':
      return state

    case 'closing':
    case 'closed':
      return 'clean'
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
      // Keep the validated container error as the public failure.
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
