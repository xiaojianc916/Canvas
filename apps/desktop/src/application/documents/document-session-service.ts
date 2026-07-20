import type { EditorSession, EditorSessionRegistry } from '@hybrid-canvas/canvas'
import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import type { HybridCanvasExtension } from '@hybrid-canvas/canvas'
import type { DrawFileCommands, FileDialog } from '@hybrid-canvas/platforms-desktop-runtime'
import type { DocumentSessionId, WorkbenchSessionStore } from '@hybrid-canvas/workspace'

export interface DocumentService {
  readonly create: (title: string, initialPageTitle: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: DocumentSessionId) => Promise<void>
  readonly close: (sessionId: DocumentSessionId) => void
  readonly getEditorSession: (sessionId: DocumentSessionId) => EditorSession | null
  readonly dispose: () => void
}

export interface CreateDocumentServiceDependencies {
  readonly workspace: WorkbenchSessionStore
  readonly editorSessions: EditorSessionRegistry
  readonly files: DrawFileCommands
  readonly dialog: FileDialog
  readonly extensions: readonly HybridCanvasExtension[]
}

type DocumentSessionState = 'ready' | 'dirty' | 'saving' | 'failed' | 'closing' | 'closed'

interface OwnedDocumentSession {
  readonly editor: EditorSession
  stopObserving: () => void
  filePath: string | null
  revision: number
  savedRevision: number
  state: DocumentSessionState
  saveOperation: Promise<void> | null
}

const ALLOWED_TRANSITIONS: Readonly<Record<DocumentSessionState, readonly DocumentSessionState[]>> = {
  ready: ['dirty', 'saving', 'closing'],
  dirty: ['saving', 'closing'],
  saving: ['ready', 'dirty', 'failed'],
  failed: ['dirty', 'saving', 'closing'],
  closing: ['closed'],
  closed: [],
}

export function createDocumentService({
  workspace,
  editorSessions,
  files,
  dialog,
  extensions,
}: CreateDocumentServiceDependencies): DocumentService {
  const sessions = new Map<DocumentSessionId, OwnedDocumentSession>()

  function create(title: string, initialPageTitle: string): void {
    const documentId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = editorSessions.create({ documentId, sessionId, extensions })
    const session = createOwnedSession(editor, null, 'dirty')
    sessions.set(sessionId, session)

    try {
      workspace.createDocument({
        documentId,
        sessionId,
        title,
        initialPageTitle,
        persistence: 'dirty',
      })
    } catch (error) {
      release(sessionId)
      throw error
    }
  }

  async function open(): Promise<void> {
    const paths = await dialog.open({
      filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
    })
    const filePath = paths[0]
    if (!filePath) {
      return
    }

    const json = await files.readDraw(filePath)
    const container = parseDrawDocument(json)
    const documentId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = editorSessions.create({
      documentId,
      sessionId,
      initialSnapshot: container.content,
      extensions,
    })
    sessions.set(sessionId, createOwnedSession(editor, filePath, 'ready'))

    try {
      workspace.createDocument({
        documentId,
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

  function save(sessionId: DocumentSessionId): Promise<void> {
    const session = requireSession(sessionId)
    if (session.saveOperation) {
      return session.saveOperation
    }

    const operation = performSave(sessionId, session).finally(() => {
      session.saveOperation = null
    })
    session.saveOperation = operation
    return operation
  }

  async function performSave(
    sessionId: DocumentSessionId,
    session: OwnedDocumentSession,
  ): Promise<void> {
    let filePath = session.filePath
    if (!filePath) {
      filePath = await dialog.save({
        filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
        defaultPath: '未命名画板.draw',
      })
    }
    if (!filePath) {
      return
    }

    const capturedRevision = session.revision
    transition(session, 'saving')
    workspace.setLocalPersistence(sessionId, 'saving')
    try {
      const json = serializeDrawDocument(session.editor.getSnapshot())
      await files.saveDraw(filePath, json)
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

  function close(sessionId: DocumentSessionId): void {
    const session = sessions.get(sessionId)
    if (!session) {
      return
    }
    if (session.saveOperation) {
      throw new Error('DOCUMENT_SESSION_SAVE_IN_PROGRESS')
    }
    transition(session, 'closing')
    workspace.closeDocument(sessionId)
    transition(session, 'closed')
    release(sessionId)
  }

  function release(sessionId: DocumentSessionId): void {
    const session = sessions.get(sessionId)
    session?.stopObserving()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
  }

  function createOwnedSession(
    editor: EditorSession,
    filePath: string | null,
    initialState: 'ready' | 'dirty',
  ): OwnedDocumentSession {
    const session: OwnedDocumentSession = {
      editor,
      filePath,
      revision: 0,
      savedRevision: initialState === 'ready' ? 0 : -1,
      state: initialState,
      saveOperation: null,
      stopObserving: () => {},
    }
    const stopObserving = editor.store.listen(
      () => {
        if (session.state === 'closing' || session.state === 'closed') {
          return
        }
        session.revision += 1
        if (session.state !== 'saving') {
          if (session.state !== 'dirty') {
            transition(session, 'dirty')
          }
          workspace.setLocalPersistence(editor.sessionId, 'dirty')
        }
      },
      { scope: 'document', source: 'user' },
    )
    session.stopObserving = stopObserving
    return session
  }

  function requireSession(sessionId: DocumentSessionId): OwnedDocumentSession {
    const session = sessions.get(sessionId)
    if (!session) {
      throw new Error('DOCUMENT_SESSION_NOT_FOUND')
    }
    return session
  }

  return {
    create,
    open,
    save,
    close,
    getEditorSession(sessionId) {
      return sessions.get(sessionId)?.editor ?? null
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

function transition(session: OwnedDocumentSession, nextState: DocumentSessionState): void {
  if (session.state === nextState) {
    return
  }
  if (!ALLOWED_TRANSITIONS[session.state].includes(nextState)) {
    throw new Error(`DOCUMENT_SESSION_INVALID_TRANSITION:${session.state}->${nextState}`)
  }
  session.state = nextState
}

function getFileTitle(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1)
  return fileName.toLowerCase().endsWith('.draw') ? fileName.slice(0, -5) : fileName
}
