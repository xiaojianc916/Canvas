export type CanvasId = string
export type CanvasSessionId = string
export interface CanvasTabViewModel {
  readonly sessionId: CanvasSessionId
  readonly canvasId: CanvasId
  readonly title: string
  readonly isActive: boolean
  readonly canClose: boolean
}

export interface ActiveCanvasViewModel {
  readonly sessionId: CanvasSessionId
  readonly canvasId: CanvasId
  readonly title: string
}

export interface WorkbenchViewModel {
  readonly activeSessionId: CanvasSessionId | null
  readonly tabs: readonly CanvasTabViewModel[]
  readonly activeCanvas: ActiveCanvasViewModel | null
}

export interface CreateCanvasRequest {
  readonly title: string
  readonly canvasId?: CanvasId
  readonly sessionId?: CanvasSessionId
}

export interface WorkbenchSessionCommands {
  readonly createCanvas: (request: CreateCanvasRequest) => void
  readonly activateCanvas: (sessionId: CanvasSessionId) => void
  readonly closeCanvas: (sessionId: CanvasSessionId) => void
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
