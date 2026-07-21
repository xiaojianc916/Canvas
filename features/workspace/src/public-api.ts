export {
  type ActiveCanvasViewModel,
  type CanvasId,
  type CanvasSessionId,
  type CanvasTabViewModel,
  type CreateCanvasRequest,
  EMPTY_WORKBENCH_VIEW_MODEL,
  type WorkbenchSessionCommands,
  type WorkbenchSessionStore,
  type WorkbenchViewModel,
} from './contracts/public-api'

export {
  type CommandRegistry,
  createCommandRegistry,
  createWorkbenchSessionController,
} from './application/public-api'

export type {
  WorkspaceShellActions,
  WorkspaceShellProps,
} from './contracts/shell-contract'

export { WorkspaceShell } from './presentation/shell/WorkspaceShell'
export { CommandPalette, type CommandPaletteProps } from './presentation/commands/CommandPalette'
