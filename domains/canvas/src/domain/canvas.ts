export interface CanvasViewport {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export function createViewport(x = 0, y = 0, zoom = 1): CanvasViewport {
  return { x, y, zoom }
}
