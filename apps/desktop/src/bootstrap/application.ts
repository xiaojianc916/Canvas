import { createEditorSessionRegistry, type EditorSession } from '@hybrid-canvas/canvas'
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
  type CommandRegistry,
  createCommandRegistry,
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
  readonly commands: CommandRegistry
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
  const commands = createCommandRegistry()
  const drawFiles = createDrawFileCommands()
  const dialog = createFileDialog()
  const editorRegistry = createEditorSessionRegistry()
  const ownedSessions = new Map<DocumentSessionId, OwnedEditorSession>()

  function trackSession(sessionId: DocumentSessionId, filePath: string | null): EditorSession {
    const editor = editorRegistry.require(sessionId)
    ownedSessions.set(sessionId, { editor, filePath })
    return editor
  }

  function releaseSession(sessionId: DocumentSessionId): void {
    ownedSessions.delete(sessionId)
    editorRegistry.close(sessionId)
  }

  async function createDocument(title: string, initialPageTitle: string): Promise<void> {
    const documentId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    editorRegistry.create({
      documentId,
      sessionId,
      extensions: [flowchartExtension],
    })
    trackSession(sessionId, null)

    try {
      await workspace.createDocument({
        documentId,
        sessionId,
        title,
        initialPageTitle,
        persistence: 'dirty',
      })
    } catch (error) {
      releaseSession(sessionId)
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
    editorRegistry.create({
      documentId,
      sessionId,
      initialSnapshot: container.content,
      extensions: [flowchartExtension],
    })
    trackSession(sessionId, filePath)

    try {
      await workspace.createDocument({
        documentId,
        sessionId,
        title: getFileTitle(filePath),
        initialPageTitle: '画板',
        persistence: 'clean',
      })
    } catch (error) {
      releaseSession(sessionId)
      throw error
    }
  }

  async function saveDocument(sessionId: DocumentSessionId): Promise<void> {
    const ownedSession = ownedSessions.get(sessionId)
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
    releaseSession(sessionId)
  }

  return {
    workspace,
    commands,
    documents: {
      createDocument,
      openDocument,
      saveDocument,
      closeDocument,
    },
    editorSessions: {
      get(sessionId) {
        return editorRegistry.get(sessionId)
      },
    },
    windows: {
      async openSettingsWindow() {},
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
