import { createEditorSessionRegistry } from '@hybrid-canvas/canvas/application'
import { flowchartExtension } from '@hybrid-canvas/flowchart'
import {
  createMainWindowController,
  createDrawFileCommands,
  createFileDialog,
  type MainWindowController,
} from '@hybrid-canvas/platforms-desktop-runtime'
import {
  type CommandRegistry,
  createCommandRegistry,
  createWorkbenchSessionController,
  type WorkbenchSessionStore,
} from '@hybrid-canvas/workspace/contracts'
import { createCanvasService, type CanvasService } from '@hybrid-canvas/canvas-session'
import {
  createApplicationTerminationCoordinator,
  type ApplicationTerminationCoordinator,
} from '../application/termination/application-termination-coordinator'

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: CanvasService
  readonly termination: ApplicationTerminationCoordinator
  readonly mainWindow: MainWindowController
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
    persistence: {
      read: drawFiles.readDraw,
      write: drawFiles.saveDraw,
    },
    fileSelection: {
      async selectOpenPath() {
        const [path] = await dialog.open({
          filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
        })
        return path ?? null
      },
      selectSavePath(suggestedName) {
        return dialog.save({
          filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
          defaultPath: suggestedName,
        })
      },
    },
    extensions: [flowchartExtension],
  })
  const termination = createApplicationTerminationCoordinator(canvases, {
    terminate: () => mainWindow.forceClose(),
  })

  return {
    workspace,
    commands,
    canvases,
    termination,
    mainWindow,
    dispose() {
      termination.dispose()
      canvases.dispose()
    },
  }
}
