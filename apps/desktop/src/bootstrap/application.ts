import {
  createEditorSession,
  type EditorSession,
} from '@hybrid-canvas/canvas'
import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import { flowchartExtension } from '@hybrid-canvas/flowchart'
import {
  createDrawFileCommands,
  createDesktopSettingsStore,
  createExternalOpener,
  createFileDialog,
  createSystemTheme,
  type DrawFileCommands,
  type ExternalOpener,
  type FileDialog,
  type SettingsStore,
  type SystemTheme,
} from '@hybrid-canvas/platforms-desktop-runtime'
import {
  createWorkbenchSessionController,
  type DocumentSessionId,
  type WorkbenchSessionStore,
} from '@hybrid-canvas/workspace'

export interface WindowApplicationPort {
  readonly openSettingsWindow: () => Promise<void>
}

export interface DocumentApplicationPort {
  readonly createDocument: (title: string, initialPageTitle: string) => Promise<void>
  readonly openDocument: () => Promise<void>
  readonly saveDocument: (sessionId: DocumentSessionId) => Promise<void>
  readonly closeDocument: (sessionId: DocumentSessionId) => Promise<void>
}

export interface EditorSessionRegistry {
  readonly get: (sessionId: DocumentSessionId) => EditorSession | null
}

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly documents: DocumentApplicationPort
  readonly editorSessions: EditorSessionRegistry
  readonly windows: WindowApplicationPort
  readonly drawFiles: DrawFileCommands
  readonly settings: SettingsStore
  readonly dialog: FileDialog
  readonly opener: ExternalOpener
  readonly theme: SystemTheme
}

interface OwnedEditorSession {
  readonly editor: EditorSession
  filePath: string | null
}

export function createApplicationRuntime(): ApplicationRuntime {
  const workspace = createWorkbenchSessionController()
  const drawFiles = createDrawFileCommands()
  const dialog = createFileDialog()
  const sessions = new Map<DocumentSessionId, OwnedEditorSession>()

  async function createDocument(title: string, initialPageTitle: string): Promise<void> {
    const documentId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = createEditorSession({
      documentId,
      sessionId,
      extensions: [flowchartExtension],
    })
    sessions.set(sessionId, { editor, filePath: null })

    try {
      await workspace.createDocument({
        documentId,
        sessionId,
        title,
        initialPageTitle,
        persistence: 'dirty',
      })
    } catch (error) {
      sessions.delete(sessionId)
      editor.dispose()
      throw error
    }
  }

  async function openDocument(): Promise<void> {
    const paths = await dialog.open({
      filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
    })
    const filePath = paths[0]
    if (!filePath) {
      return
    }

    const json = await drawFiles.readDraw(filePath)
    const container = parseDrawDocument(json)
    const documentId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = createEditorSession({
      documentId,
      sessionId,
      initialSnapshot: container.content,
      extensions: [flowchartExtension],
    })
    sessions.set(sessionId, { editor, filePath })

    try {
      await workspace.createDocument({
        documentId,
        sessionId,
        title: getFileTitle(filePath),
        initialPageTitle: '画板',
        persistence: 'clean',
      })
    } catch (error) {
      sessions.delete(sessionId)
      editor.dispose()
      throw error
    }
  }

  async function saveDocument(sessionId: DocumentSessionId): Promise<void> {
    const ownedSession = sessions.get(sessionId)
    if (!ownedSession) {
      throw new Error('EDITOR_SESSION_NOT_FOUND')
    }

    let filePath = ownedSession.filePath
    if (!filePath) {
      filePath = await dialog.save({
        filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
        defaultPath: '未命名画板.draw',
      })
    }
    if (!filePath) {
      return
    }

    const json = serializeDrawDocument(ownedSession.editor.getSnapshot())
    await drawFiles.saveDraw(filePath, json)
    ownedSession.filePath = filePath
  }

  async function closeDocument(sessionId: DocumentSessionId): Promise<void> {
    await workspace.closeDocument(sessionId)
    const ownedSession = sessions.get(sessionId)
    sessions.delete(sessionId)
    ownedSession?.editor.dispose()
  }

  return {
    workspace,
    documents: {
      createDocument,
      openDocument,
      saveDocument,
      closeDocument,
    },
    editorSessions: {
      get(sessionId) {
        return sessions.get(sessionId)?.editor ?? null
      },
    },
    windows: {
      async openSettingsWindow(): Promise<void> {
        // Window creation remains a desktop composition concern.
      },
    },
    drawFiles,
    settings: createDesktopSettingsStore(),
    dialog,
    opener: createExternalOpener(),
    theme: createSystemTheme(),
  }
}

function getFileTitle(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1)
  return fileName.toLowerCase().endsWith('.draw') ? fileName.slice(0, -5) : fileName
}
