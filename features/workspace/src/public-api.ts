export {
  type ActiveDocumentViewModel,
  type DocumentId,
  type DocumentPersistenceViewModel,
  type DocumentSessionId,
  type DocumentTabViewModel,
  EMPTY_WORKBENCH_VIEW_MODEL,
  type LocalPersistenceState,
  type PageId,
  type RemoteSynchronizationState,
  type WorkbenchViewModel,
  type WorkspacePageViewModel,
} from './contracts/public-api'

export {
  WorkspaceShell,
  type WorkspaceShellActions,
  type WorkspaceShellProps,
} from './presentation/shell/WorkspaceShell'
export { CommandPalette, type CommandPaletteProps } from './presentation/commands/CommandPalette'
