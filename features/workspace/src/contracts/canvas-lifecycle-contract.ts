import type { CanvasSessionId } from './workbench-contract'

export type CanvasCloseIntent = 'normal' | 'discard'

export type CanvasReleaseFailureCode =
  | 'permission-denied'
  | 'persistence'
  | 'not-found'
  | 'platform'

export interface CanvasReleaseFailure {
  readonly code: CanvasReleaseFailureCode
  readonly recoverable: boolean
}

export type CanvasCloseState =
  | {
      readonly state: 'confirmation-required'
    }
  | {
      readonly state: 'releasing'
      readonly intent: CanvasCloseIntent
    }
  | {
      readonly state: 'release-failed'
      readonly intent: CanvasCloseIntent
      readonly failure: CanvasReleaseFailure
    }

export interface CanvasCloseSnapshot {
  readonly states: Readonly<Record<CanvasSessionId, CanvasCloseState>>
}
