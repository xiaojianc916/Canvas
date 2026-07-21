import type {
  EditorSession,
  EditorSessionRegistry,
  HybridCanvasExtension,
} from '@hybrid-canvas/canvas'
import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import type { DrawFileCommands, FileDialog } from '@hybrid-canvas/platforms-desktop-runtime'
import type { CanvasSessionId, WorkbenchSessionStore } from '@hybrid-canvas/workspace'
import type { TLEditorSnapshot } from 'tldraw'

export type CanvasPersistenceState = 'clean' | 'dirty' | 'saving' | 'failed'

export interface CanvasSessionSnapshot {
  readonly sessionId: CanvasSessionId
  readonly persistence: CanvasPersistenceState
}

export type CanvasCloseDecision =
  | { readonly kind: 'close-now' }
  | { readonly kind: 'confirm-discard'; readonly persistence: 'dirty' | 'failed' }
  | { readonly kind: 'wait-for-save'; readonly operation: Promise<void> }
  | { readonly kind: 'not-found' }

export type ApplicationClosePlan =
  | { readonly kind: 'close-now' }
  | { readonly kind: 'confirm-discard'; readonly sessionIds: readonly CanvasSessionId[] }
  | { readonly kind: 'wait-for-saves'; readonly operations: readonly Promise<void>[] }

export interface CanvasService {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (sessionId: CanvasSessionId) => CanvasCloseDecision
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly discardAllAndClose: (sessionIds: readonly CanvasSessionId[]) => void
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (sessionId: CanvasSessionId) => CanvasSessionSnapshot | null
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void
}

export interface CreateCanvasServiceDependencies {
  readonly workspace: WorkbenchSessionStore
  readonly editorSessions: EditorSessionRegistry
  readonly files: DrawFileCommands
  readonly dialog: FileDialog
  readonly extensions: readonly HybridCanvasExtension[]
}

type CanvasSessionState = 'ready' | 'dirty' | 'saving' | 'failed' | 'closing' | 'closed'

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
  ready: ['dirty', 'saving', 'closing'],
  dirty: ['saving', 'closing'],
  saving: ['ready', 'dirty', 'failed'],
  failed: ['dirty', 'saving', 'closing'],
  closing: ['closed'],
  closed: [],
}

export function createCanvasService({
  workspace,
  editorSessions,
  files,
  dialog,
  extensions,
}: CreateCanvasServiceDependencies): CanvasService {
  const sessions = new Map<CanvasSessionId, OwnedCanvasSession>()
  const listeners = new Set<() => void>()

  function emit(): void {
    for (const listener of listeners) listener()
  }

  function create(title: string): void {
    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = editorSessions.create({ documentId: canvasId, sessionId, extensions })
    sessions.set(sessionId, createOwnedSession(editor, null, 'dirty'))
    try {
      workspace.createCanvas({ canvasId, sessionId, title })
    } catch (error) {
      release(sessionId)
      throw error
    }
  }

  async function open(): Promise<void> {
    const [filePath] = await dialog.open({
      filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
    })
    if (!filePath) return
    const initialSnapshot = parseEditorSnapshot(await files.readDraw(filePath))
    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      initialSnapshot,
      extensions,
    })
    sessions.set(sessionId, createOwnedSession(editor, filePath, 'ready'))
    try {
      workspace.createCanvas({
        canvasId,
        sessionId,
        title: getFileTitle(filePath),
      })
    } catch (error) {
      release(sessionId)
      throw error
    }
  }

  function save(sessionId: CanvasSessionId): Promise<void> {
    const session = requireSession(sessionId)
    if (session.saveOperation) return session.saveOperation
    const operation = performSave(sessionId, session).finally(() => {
      session.saveOperation = null
    })
    session.saveOperation = operation
    return operation
  }

  async function performSave(
    sessionId: CanvasSessionId,
    session: OwnedCanvasSession,
  ): Promise<void> {
    const filePath =
      session.filePath ??
      (await dialog.save({
        filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
        defaultPath: '未命名画板.draw',
      }))
    if (!filePath) return
    const capturedRevision = session.revision
    transition(session, 'saving')
    emit()
    try {
      await files.saveDraw(filePath, serializeDrawDocument(session.editor.getSnapshot()))
      session.filePath = filePath
      session.savedRevision = capturedRevision
      const nextState = session.revision === capturedRevision ? 'ready' : 'dirty'
      transition(session, nextState)
      emit()
    } catch (error) {
      transition(session, 'failed')
      emit()
      throw error
    }
  }

  function planApplicationClose(): ApplicationClosePlan {
    const operations: Promise<void>[] = []
    const sessionIds: CanvasSessionId[] = []
    for (const [sessionId, session] of sessions) {
      if (session.saveOperation) operations.push(session.saveOperation)
      else if (session.state === 'dirty' || session.state === 'failed') sessionIds.push(sessionId)
    }
    if (operations.length > 0) return { kind: 'wait-for-saves', operations }
    if (sessionIds.length > 0) return { kind: 'confirm-discard', sessionIds }
    return { kind: 'close-now' }
  }

  function discardAllAndClose(sessionIds: readonly CanvasSessionId[]): void {
    for (const sessionId of sessionIds) discardAndClose(sessionId)
  }

  function requestClose(sessionId: CanvasSessionId): CanvasCloseDecision {
    const session = sessions.get(sessionId)
    if (!session) return { kind: 'not-found' }
    if (session.saveOperation) return { kind: 'wait-for-save', operation: session.saveOperation }
    if (session.state === 'dirty' || session.state === 'failed') {
      return { kind: 'confirm-discard', persistence: session.state }
    }
    closeNow(sessionId, session)
    return { kind: 'close-now' }
  }

  function discardAndClose(sessionId: CanvasSessionId): void {
    const session = requireSession(sessionId)
    if (session.saveOperation) throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    closeNow(sessionId, session)
  }

  function closeNow(sessionId: CanvasSessionId, session: OwnedCanvasSession): void {
    transition(session, 'closing')
    workspace.closeCanvas(sessionId)
    transition(session, 'closed')
    release(sessionId)
    emit()
  }

  function release(sessionId: CanvasSessionId): void {
    sessions.get(sessionId)?.stopObserving()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
  }

  function createOwnedSession(
    editor: EditorSession,
    filePath: string | null,
    initialState: 'ready' | 'dirty',
  ): OwnedCanvasSession {
    const session: OwnedCanvasSession = {
      editor,
      filePath,
      revision: 0,
      savedRevision: initialState === 'ready' ? 0 : -1,
      state: initialState,
      saveOperation: null,
      stopObserving: () => {},
    }
    session.stopObserving = editor.store.listen(
      () => {
        if (session.state === 'closing' || session.state === 'closed') return
        session.revision += 1
        if (session.state !== 'saving' && session.state !== 'dirty') {
          transition(session, 'dirty')
          emit()
        }
      },
      { scope: 'document', source: 'user' },
    )
    return session
  }

  function requireSession(sessionId: CanvasSessionId): OwnedCanvasSession {
    const session = sessions.get(sessionId)
    if (!session) throw new Error('CANVAS_SESSION_NOT_FOUND')
    return session
  }

  return {
    create,
    open,
    save,
    requestClose,
    discardAndClose,
    planApplicationClose,
    discardAllAndClose,
    getEditorSession: (sessionId) => sessions.get(sessionId)?.editor ?? null,
    getSessionSnapshot(sessionId) {
      const session = sessions.get(sessionId)
      if (!session) return null
      return {
        sessionId,
        persistence:
          session.state === 'ready'
            ? 'clean'
            : session.state === 'closing' || session.state === 'closed'
              ? 'clean'
              : session.state,
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      for (const session of sessions.values()) session.stopObserving()
      sessions.clear()
      editorSessions.dispose()
    },
  }
}

function transition(session: OwnedCanvasSession, nextState: CanvasSessionState): void {
  if (session.state === nextState) return
  if (!ALLOWED_TRANSITIONS[session.state].includes(nextState)) {
    throw new Error(`CANVAS_SESSION_INVALID_TRANSITION:${session.state}->${nextState}`)
  }
  session.state = nextState
}

function parseEditorSnapshot(json: string): TLEditorSnapshot {
  try {
    return parseDrawDocument(json).content
  } catch (containerError) {
    try {
      const parsed: unknown = JSON.parse(json)
      if (isEditorSnapshot(parsed)) return parsed
    } catch {
      // Preserve the validated container error for non-JSON input.
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
