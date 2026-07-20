import { createEditorSessionRegistry } from '@hybrid-canvas/canvas'
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
  type WorkbenchSessionStore,
} from '@hybrid-canvas/workspace'
import { createDocumentService, type DocumentService } from '../application/documents/document-session-service'

export interface WindowApplicationPort {
  readonly openSettingsWindow: () => Promise<void>
}

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly documents: DocumentService
  readonly windows: WindowApplicationPort
  readonly drawFiles: DrawFileCommands
  readonly settings: SettingsStore
  readonly dialog: FileDialog
  readonly opener: ExternalOpener
  readonly theme: SystemTheme
}

export function createApplicationRuntime(): ApplicationRuntime {
  const workspace = createWorkbenchSessionController()
  const commands = createCommandRegistry()
  const drawFiles = createDrawFileCommands()
  const dialog = createFileDialog()
  const editorRegistry = createEditorSessionRegistry()
  const documents = createDocumentService({
    workspace,
    editorSessions: editorRegistry,
    files: drawFiles,
    dialog,
    extensions: [flowchartExtension],
  })

  return {
    workspace,
    commands,
    documents,
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
