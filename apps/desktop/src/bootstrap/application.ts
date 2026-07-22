import { createEditorSessionRegistry } from '@hybrid-canvas/canvas/application'
import { createCanvasDocumentService } from '@hybrid-canvas/document'
import { flowchartExtension } from '@hybrid-canvas/flowchart'
import {
  createDesktopSettingsStore,
  createDrawFileCommands,
  createFileDialog,
  createMainWindowController,
  type MainWindowController,
  type SettingsStore,
} from '@hybrid-canvas/platforms-desktop-runtime'
import { scientificPlotExtension } from '@hybrid-canvas/scientific-plot'
import {
  type CommandRegistry,
  createCommandRegistry,
  createWorkbenchSessionController,
} from '@hybrid-canvas/workspace/application'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'
import { type CanvasWorkflow, createCanvasWorkflow } from '../application/canvas/canvas-workflow'
import {
  type ApplicationTerminationCoordinator,
  createApplicationTerminationCoordinator,
} from '../application/termination/application-termination-coordinator'

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: CanvasWorkflow
  readonly termination: ApplicationTerminationCoordinator
  readonly mainWindow: MainWindowController
  readonly settings: SettingsStore
  readonly dispose: () => void
}

export function createApplicationRuntime(): ApplicationRuntime {
  const workspace = createWorkbenchSessionController()
  const commands = createCommandRegistry()
  const drawFiles = createDrawFileCommands()
  const dialog = createFileDialog()
  const mainWindow = createMainWindowController()
  const settings = createDesktopSettingsStore()
  const editorSessions = createEditorSessionRegistry()

  const documents = createCanvasDocumentService({
    editorSessions,
    persistence: {
      read: drawFiles.readDraw,
      write: drawFiles.saveDraw,
    },
    fileSelection: {
      async selectOpenPath() {
        const [path] = await dialog.open({
          filters: [
            {
              name: 'Hybrid Canvas 画布',
              extensions: ['draw'],
            },
          ],
        })

        return path ?? null
      },

      selectSavePath(suggestedName) {
        return dialog.save({
          filters: [
            {
              name: 'Hybrid Canvas 画布',
              extensions: ['draw'],
            },
          ],
          defaultPath: suggestedName,
        })
      },
    },
    extensions: [flowchartExtension, scientificPlotExtension],
  })

  const canvases = createCanvasWorkflow(documents, workspace)

  const termination = createApplicationTerminationCoordinator(canvases, {
    terminate: () => mainWindow.forceClose(),
  })

  return {
    workspace,
    commands,
    canvases,
    termination,
    mainWindow,
    settings,

    dispose() {
      termination.dispose()
      canvases.dispose()
    },
  }
}
