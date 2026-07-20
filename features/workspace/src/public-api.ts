export {
  type ActiveDocumentViewModel,
  type DocumentId,
  type DocumentPersistenceViewModel,
  type DocumentSessionId,
  type DocumentTabViewModel,
  EMPTY_WORKBENCH_VIEW_MODEL,
  type PageId,
  type WorkbenchViewModel,
  type WorkspacePageViewModel,
} from './application/model/workbench-view-model'

export {
  type CreateDocumentRequest,
  createWorkbenchSessionController,
  type WorkbenchSessionActions,
  type WorkbenchSessionStore,
} from './application/session/workbench-session-controller'

export {
  type CommandRegistry,
  createCommandRegistry,
  type RegisteredCommand,
} from './application/commands/command-registry'
export { type UICommand, type UICommandHandler } from './application/commands/ui-command'

export {
  WorkspaceShell,
  type WorkspaceShellActions,
  type WorkspaceShellProps,
} from './presentation/shell/WorkspaceShell'
export { CommandPalette, type CommandPaletteProps } from './presentation/commands/CommandPalette'
