export type DocumentId = string
export type DocumentSessionId = string
export type PageId = string

export type LocalPersistenceState = 'clean' | 'dirty' | 'saving' | 'failed'

export type RemoteSynchronizationState =
  | 'not-configured'
  | 'offline'
  | 'syncing'
  | 'synced'
  | 'conflicted'

export interface DocumentPersistenceViewModel {
  readonly local: LocalPersistenceState
  readonly remote: RemoteSynchronizationState
}

export interface DocumentTabViewModel {
  readonly sessionId: DocumentSessionId
  readonly documentId: DocumentId
  readonly title: string
  readonly persistence: DocumentPersistenceViewModel
  readonly isActive: boolean
  readonly canClose: boolean
}

export interface WorkspacePageViewModel {
  readonly pageId: PageId
  readonly title: string
  readonly kind: 'canvas' | 'document'
  readonly isActive: boolean
  readonly isArchived: boolean
}

export interface ActiveDocumentViewModel {
  readonly sessionId: DocumentSessionId
  readonly documentId: DocumentId
  readonly title: string
  readonly pages: readonly WorkspacePageViewModel[]
}

export interface WorkbenchViewModel {
  readonly activeSessionId: DocumentSessionId | null
  readonly tabs: readonly DocumentTabViewModel[]
  readonly activeDocument: ActiveDocumentViewModel | null
}

export interface CreateDocumentRequest {
  readonly title: string
  readonly initialPageTitle: string
  readonly documentId?: DocumentId
  readonly sessionId?: DocumentSessionId
  readonly persistence?: LocalPersistenceState
}

export interface WorkbenchSessionCommands {
  readonly createDocument: (request: CreateDocumentRequest) => void
  readonly activateDocument: (sessionId: DocumentSessionId) => void
  readonly closeDocument: (sessionId: DocumentSessionId) => void
  readonly createPage: (sessionId: DocumentSessionId, title: string) => void
  readonly activatePage: (sessionId: DocumentSessionId, pageId: PageId) => void
  readonly setLocalPersistence: (
    sessionId: DocumentSessionId,
    state: LocalPersistenceState,
  ) => void
}

export interface WorkbenchSessionStore extends WorkbenchSessionCommands {
  readonly getSnapshot: () => WorkbenchViewModel
  readonly subscribe: (listener: () => void) => () => void
}

export const EMPTY_WORKBENCH_VIEW_MODEL: WorkbenchViewModel = Object.freeze({
  activeSessionId: null,
  tabs: Object.freeze([]),
  activeDocument: null,
})
