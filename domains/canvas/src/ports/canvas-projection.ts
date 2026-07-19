import type { CanvasViewport } from '../domain/canvas'

export interface CanvasProjection {
  readonly worldToScreen: (point: { x: number; y: number }) => { x: number; y: number }
  readonly screenToWorld: (point: { x: number; y: number }) => { x: number; y: number }
  readonly getViewport: () => CanvasViewport
}
