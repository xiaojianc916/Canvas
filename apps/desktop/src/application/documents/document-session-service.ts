import type {
  EditorSession,
  EditorSessionRegistry,
  HybridCanvasExtension,
} from '@hybrid-canvas/canvas'
import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import type { DrawFileCommands, FileDialog } from '@hybrid-canvas/platforms-desktop-runtime'
import type { CanvasSessionId, WorkbenchSessionStore } from '@hybrid-canvas/workspace'
import type { TLEditorSnapshot } from 'tldraw'

export interface CanvasService {
  readonly create: (title: string, initialPageTitle: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly close: (sessionId: CanvasSessionId) => void
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
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

  function create(title: string, initialPageTitle: string): void {
    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = editorSessions.create({ documentId: canvasId, sessionId, extensions })
    sessions.set(sessionId, createOwnedSession(editor, null, 'dirty'))
    try {
      workspace.createCanvas({ canvasId, sessionId, title, initialPageTitle, persistence: 'dirty' })
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
        initialPageTitle: '画板',
        persistence: 'clean',
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
    const filePath = session.filePath ?? await dialog.save({
      filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
      defaultPath: '未命名画板.draw',
    })
    if (!filePath) return
    const capturedRevision = session.revision
    transition(session, 'saving')
    workspace.setLocalPersistence(sessionId, 'saving')
    try {
      await files.saveDraw(filePath, serializeDrawDocument(session.editor.getSnapshot()))
      session.filePath = filePath
      session.savedRevision = capturedRevision
      const nextState = session.revision === capturedRevision ? 'ready' : 'dirty'
      transition(session, nextState)
      workspace.setLocalPersistence(sessionId, nextState === 'ready' ? 'clean' : 'dirty')
    } catch (error) {
      transition(session, 'failed')
      workspace.setLocalPersistence(sessionId, 'failed')
      throw error
    }
  }

  function close(sessionId: CanvasSessionId): void {
    const session = sessions.get(sessionId)
    if (!session) return
    if (session.saveOperation) throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    transition(session, 'closing')
    workspace.closeCanvas(sessionId)
    transition(session, 'closed')
    release(sessionId)
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
    session.stopObserving = editor.store.listen(() => {
      if (session.state === 'closing' || session.state === 'closed') return
      session.revision += 1
      if (session.state !== 'saving') {
        if (session.state !== 'dirty') transition(session, 'dirty')
        workspace.setLocalPersistence(editor.sessionId, 'dirty')
      }
    }, { scope: 'document', source: 'user' })
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
    close,
    getEditorSession: (sessionId) => sessions.get(sessionId)?.editor ?? null,
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
