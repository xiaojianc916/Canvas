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
} from './model/workbench-view-model'

export {
  type CreateDocumentRequest,
  createWorkbenchSessionController,
  type WorkbenchSessionActions,
  type WorkbenchSessionStore,
} from './session/workbench-session-controller'

export {
  type CommandRegistry,
  createCommandRegistry,
} from './commands/command-registry'

export type {
  RegisteredCommand,
  UICommand,
  UICommandHandler,
} from '../contracts/public-api'
