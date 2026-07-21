import { createEditorSessionRegistry } from '@hybrid-canvas/canvas'
import { flowchartExtension } from '@hybrid-canvas/flowchart'
import {
  createMainWindowController,
  createDrawFileCommands,
  createDesktopSettingsStore,
  createExternalOpener,
  createFileDialog,
  createSystemTheme,
  type MainWindowController,
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
import { createCanvasService, type CanvasService } from '../application/documents/document-session-service'

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: CanvasService
  readonly mainWindow: MainWindowController
  readonly drawFiles: DrawFileCommands
  readonly settings: SettingsStore
  readonly dialog: FileDialog
  readonly opener: ExternalOpener
  readonly theme: SystemTheme
  readonly dispose: () => void
}

export function createApplicationRuntime(): ApplicationRuntime {
  const workspace = createWorkbenchSessionController()
  const commands = createCommandRegistry()
  const drawFiles = createDrawFileCommands()
  const dialog = createFileDialog()
  const mainWindow = createMainWindowController()
  const editorRegistry = createEditorSessionRegistry()
  const canvases = createCanvasService({
    workspace,
    editorSessions: editorRegistry,
    files: drawFiles,
    dialog,
    extensions: [flowchartExtension],
  })

  return {
    workspace,
    commands,
    canvases,
    mainWindow,
    drawFiles,
    settings: createDesktopSettingsStore(),
    dialog,
    opener: createExternalOpener(),
    theme: createSystemTheme(),
    dispose() {
      canvases.dispose()
    },
  }
}
