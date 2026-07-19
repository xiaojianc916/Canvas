export type CanvasToolId = 'select' | 'hand' | 'geo' | 'arrow' | 'text' | 'draw' | 'note'

export interface CanvasBoundsViewModel {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface CanvasSelectionViewModel {
  readonly count: number
  readonly label: string | null
  readonly bounds: CanvasBoundsViewModel | null
}

export interface CanvasSessionViewModel {
  readonly activeToolId: CanvasToolId
  readonly zoomPercentage: number
  readonly gridSize: number
  readonly snapEnabled: boolean
  readonly selection: CanvasSelectionViewModel
}

export const EMPTY_CANVAS_SESSION_VIEW_MODEL: CanvasSessionViewModel = {
  activeToolId: 'select',
  zoomPercentage: 100,
  gridSize: 22,
  snapEnabled: true,
  selection: {
    count: 0,
    label: null,
    bounds: null,
  },
}
