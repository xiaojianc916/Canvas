import type { ApplicationClosePlan, CanvasSessionId } from '@hybrid-canvas/document'

export type ApplicationTerminationIntent = 'window-close' | 'update-restart' | 'application-exit'

export type ApplicationTerminationSnapshot =
  | {
      readonly state: 'idle'
    }
  | {
      readonly state: 'confirmation-required'
      readonly intent: ApplicationTerminationIntent
      readonly sessionIds: readonly CanvasSessionId[]
    }
  | {
      readonly state: 'waiting-for-saves'
      readonly intent: ApplicationTerminationIntent
    }
  | {
      readonly state: 'terminating'
      readonly intent: ApplicationTerminationIntent
    }

export interface ApplicationTerminator {
  /**
   * Dispatches a one-way native termination command.
   *
   * The renderer cannot reliably await an acknowledgement because the
   * renderer itself is destroyed by a successful termination.
   */
  readonly terminate: (intent: ApplicationTerminationIntent) => void
}

export interface ApplicationClosePort {
  readonly planApplicationClose: () => ApplicationClosePlan

  readonly discardAllAndClose: (sessionIds: readonly CanvasSessionId[]) => void
}

export interface ApplicationTerminationCoordinator {
  readonly request: (intent: ApplicationTerminationIntent) => void

  readonly cancel: () => void
  readonly confirmDiscard: () => void

  readonly getSnapshot: () => ApplicationTerminationSnapshot

  readonly subscribe: (listener: () => void) => () => void

  readonly dispose: () => void
}

export function createApplicationTerminationCoordinator(
  canvases: ApplicationClosePort,
  terminator: ApplicationTerminator,
): ApplicationTerminationCoordinator {
  let snapshot: ApplicationTerminationSnapshot = {
    state: 'idle',
  }

  let generation = 0
  let disposed = false

  const listeners = new Set<() => void>()

  function emit(next: ApplicationTerminationSnapshot): void {
    snapshot = next

    for (const listener of listeners) {
      listener()
    }
  }

  function request(intent: ApplicationTerminationIntent): void {
    if (disposed || snapshot.state === 'terminating') {
      return
    }

    evaluate(intent, canvases.planApplicationClose())
  }

  function beginTermination(intent: ApplicationTerminationIntent): void {
    generation += 1

    emit({
      state: 'terminating',
      intent,
    })

    // A successful native termination destroys this JavaScript context.
    // Therefore this operation must not be modeled as a Promise whose
    // rejection controls user-facing state.
    terminator.terminate(intent)
  }

  function evaluate(intent: ApplicationTerminationIntent, plan: ApplicationClosePlan): void {
    if (plan.kind === 'close-now') {
      beginTermination(intent)
      return
    }

    if (plan.kind === 'confirm-discard') {
      emit({
        state: 'confirmation-required',
        intent,
        sessionIds: plan.sessionIds,
      })

      return
    }

    const currentGeneration = ++generation

    emit({
      state: 'waiting-for-saves',
      intent,
    })

    void Promise.allSettled(plan.operations).then(() => {
      if (!disposed && currentGeneration === generation) {
        request(intent)
      }
    })
  }

  return {
    request,

    cancel() {
      if (snapshot.state === 'terminating') {
        return
      }

      generation += 1
      emit({ state: 'idle' })
    },

    confirmDiscard() {
      if (snapshot.state !== 'confirmation-required') {
        return
      }

      const { intent, sessionIds } = snapshot

      canvases.discardAllAndClose(sessionIds)

      beginTermination(intent)
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      disposed = true
      generation += 1
      listeners.clear()
    },
  }
}
