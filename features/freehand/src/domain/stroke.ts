export type StrokeId = string & { readonly __brand: 'StrokeId' }

export interface PointSample {
  readonly x: number
  readonly y: number
  readonly pressure: number
}

export interface Stroke {
  readonly id: StrokeId
  readonly points: readonly PointSample[]
  readonly color: string
  readonly width: number
  readonly completed: boolean
}

export interface BrushSettings {
  readonly size: number
  readonly thinning: number
  readonly smoothing: number
  readonly streamline: number
  readonly color: string
}
