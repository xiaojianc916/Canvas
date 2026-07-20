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

interface OwnedDocumentSession {
  readonly editor: EditorSession
  filePath: string | null
  revision: number
  savedRevision: number
  saveOperation: Promise<void> | null
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
    sessions.set(sessionId, {
      editor,
      filePath: null,
      revision: 0,
      savedRevision: -1,
      saveOperation: null,
    })

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
    sessions.set(sessionId, {
      editor,
      filePath,
      revision: 0,
      savedRevision: 0,
      saveOperation: null,
    })

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

  async function save(sessionId: DocumentSessionId): Promise<void> {
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
    workspace.setLocalPersistence(sessionId, 'saving')
    try {
      const json = serializeDrawDocument(session.editor.getSnapshot())
      await files.saveDraw(filePath, json)
      session.filePath = filePath
      session.savedRevision = capturedRevision
      workspace.setLocalPersistence(
        sessionId,
        session.revision === capturedRevision ? 'clean' : 'dirty',
      )
    } catch (error) {
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
    workspace.closeDocument(sessionId)
    release(sessionId)
  }

  function release(sessionId: DocumentSessionId): void {
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
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
      sessions.clear()
      editorSessions.dispose()
    },
  }
}

function getFileTitle(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1)
  return fileName.toLowerCase().endsWith('.draw') ? fileName.slice(0, -5) : fileName
}
