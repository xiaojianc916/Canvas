export type CanvasId = string
export type CanvasSessionId = string
export type PageId = string

export type LocalPersistenceState = 'clean' | 'dirty' | 'saving' | 'failed'

export type RemoteSynchronizationState =
  | 'not-configured'
  | 'offline'
  | 'syncing'
  | 'synced'
  | 'conflicted'

export interface CanvasPersistenceViewModel {
  readonly local: LocalPersistenceState
  readonly remote: RemoteSynchronizationState
}

export interface CanvasTabViewModel {
  readonly sessionId: CanvasSessionId
  readonly canvasId: CanvasId
  readonly title: string
  readonly persistence: CanvasPersistenceViewModel
  readonly isActive: boolean
  readonly canClose: boolean
}

export interface WorkspacePageViewModel {
  readonly pageId: PageId
  readonly title: string
  readonly kind: 'canvas'
  readonly isActive: boolean
  readonly isArchived: boolean
}

export interface ActiveCanvasViewModel {
  readonly sessionId: CanvasSessionId
  readonly canvasId: CanvasId
  readonly title: string
  readonly pages: readonly WorkspacePageViewModel[]
}

export interface WorkbenchViewModel {
  readonly activeSessionId: CanvasSessionId | null
  readonly tabs: readonly CanvasTabViewModel[]
  readonly activeCanvas: ActiveCanvasViewModel | null
}

export interface CreateCanvasRequest {
  readonly title: string
  readonly initialPageTitle: string
  readonly canvasId?: CanvasId
  readonly sessionId?: CanvasSessionId
  readonly persistence?: LocalPersistenceState
}

export interface WorkbenchSessionCommands {
  readonly createCanvas: (request: CreateCanvasRequest) => void
  readonly activateCanvas: (sessionId: CanvasSessionId) => void
  readonly closeCanvas: (sessionId: CanvasSessionId) => void
  readonly createPage: (sessionId: CanvasSessionId, title: string) => void
  readonly activatePage: (sessionId: CanvasSessionId, pageId: PageId) => void
  readonly setLocalPersistence: (
    sessionId: CanvasSessionId,
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
  activeCanvas: null,
})
