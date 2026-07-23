import { createEditorSessionRegistry } from '@hybrid-canvas/canvas/application'
import { createCanvasDocumentService } from '@hybrid-canvas/document'
import { flowchartExtension } from '@hybrid-canvas/flowchart'
import { freehandExtension } from '@hybrid-canvas/freehand'
import {
  createDesktopSettingsStore,
  createDocumentFileCommands,
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
import {
  type CanvasWorkflow,
  createCanvasWorkflow,
} from '../application/canvas/canvas-workflow'
import {
  type ApplicationTerminationCoordinator,
  createApplicationTerminationCoordinator,
} from '../application/termination/application-termination-coordinator'

export interface CreateApplicationRuntimeOptions {
  readonly tldrawLicenseKey: string
}

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: CanvasWorkflow
  readonly termination: ApplicationTerminationCoordinator
  readonly mainWindow: MainWindowController
  readonly settings: SettingsStore
  readonly tldrawLicenseKey: string
  readonly dispose: () => void
}

export function createApplicationRuntime({
  tldrawLicenseKey,
}: CreateApplicationRuntimeOptions): ApplicationRuntime {
  const workspace = createWorkbenchSessionController()
  const commands = createCommandRegistry()
  const documentsGateway = createDocumentFileCommands()
  const mainWindow = createMainWindowController()
  const settings = createDesktopSettingsStore()
  const editorSessions = createEditorSessionRegistry()

  const documents = createCanvasDocumentService({
    editorSessions,
    persistence: documentsGateway,
    extensions: [
      flowchartExtension,
      freehandExtension,
      scientificPlotExtension,
    ],
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
    tldrawLicenseKey,

    dispose() {
      termination.dispose()
      canvases.dispose()
    },
  }
}
