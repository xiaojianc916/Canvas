import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type {
  ApplicationClosePlan,
  CanvasCloseIntent,
  CanvasDocumentService,
  CanvasReleaseFailure,
  CanvasReleaseResult,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

export type CanvasCloseState =
  | { readonly state: 'confirmation-required' }
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

const EMPTY_CLOSE_SNAPSHOT: CanvasCloseSnapshot = Object.freeze({
  states: Object.freeze({}),
})

export interface CanvasWorkflow {
  readonly create: (title: string) => Promise<void>
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>

  /**
   * 每个 canvas session 都拥有独立 close transaction。
   *
   * 同一 session 的重复请求复用同一 Promise；
   * 不同 session 的 native document release 可并行执行。
   */
  readonly closeCanvas: (
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ) => Promise<void>

  readonly cancelCanvasClose: (sessionId: CanvasSessionId) => void
  readonly getCloseSnapshot: () => CanvasCloseSnapshot

  readonly planApplicationClose: () => ApplicationClosePlan
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void
}

export function createCanvasWorkflow(
  documents: CanvasDocumentService,
  workspace: WorkbenchSessionStore,
): CanvasWorkflow {
  const listeners = new Set<() => void>()
  const closeOperations = new Map<CanvasSessionId, Promise<void>>()
  const closeStates = new Map<CanvasSessionId, CanvasCloseState>()

  let version = 0
  let closeSnapshot = EMPTY_CLOSE_SNAPSHOT

  const stopDocumentSubscription = documents.subscribe(emit)

  function emit(): void {
    version += 1

    for (const listener of listeners) {
      listener()
    }
  }

  function publishCloseStates(): void {
    closeSnapshot =
      closeStates.size === 0
        ? EMPTY_CLOSE_SNAPSHOT
        : {
            states: Object.freeze(
              Object.fromEntries(closeStates) as Record<
                CanvasSessionId,
                CanvasCloseState
              >,
            ),
          }

    emit()
  }

  function setCloseState(
    sessionId: CanvasSessionId,
    state: CanvasCloseState,
  ): void {
    closeStates.set(sessionId, state)
    publishCloseStates()
  }

  function clearCloseState(sessionId: CanvasSessionId): void {
    if (!closeStates.delete(sessionId)) {
      return
    }

    publishCloseStates()
  }

  async function create(title: string): Promise<void> {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (workspaceError) {
      const release = await documents.releaseCanvas(
        opened.sessionId,
        'discard',
      )

      if (
        release.kind !== 'released' &&
        release.kind !== 'not-found'
      ) {
        throw new Error('CANVAS_CREATION_ROLLBACK_FAILED')
      }

      throw workspaceError
    }
  }

  async function open(): Promise<void> {
    const opened = await documents.open()

    if (!opened) {
      return
    }

    try {
      workspace.createCanvas(opened)
    } catch (workspaceError) {
      const release = await documents.releaseCanvas(
        opened.sessionId,
        'discard',
      )

      if (
        release.kind !== 'released' &&
        release.kind !== 'not-found'
      ) {
        throw new Error('CANVAS_OPEN_ROLLBACK_FAILED')
      }

      throw workspaceError
    }
  }

  function closeCanvas(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<void> {
    const existingOperation = closeOperations.get(sessionId)

    if (existingOperation) {
      return existingOperation
    }

    const operation = performClose(sessionId, intent).finally(() => {
      closeOperations.delete(sessionId)
    })

    closeOperations.set(sessionId, operation)

    return operation
  }

  async function performClose(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<void> {
    setCloseState(sessionId, {
      state: 'releasing',
      intent,
    })

    let result = await documents.releaseCanvas(sessionId, intent)

    if (result.kind === 'wait-for-save') {
      await result.operation.catch(() => undefined)
      result = await documents.releaseCanvas(sessionId, intent)
    }

    applyReleaseResult(sessionId, intent, result)
  }

  function applyReleaseResult(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
    result: CanvasReleaseResult,
  ): void {
    switch (result.kind) {
      case 'released':
        workspace.closeCanvas(sessionId)
        clearCloseState(sessionId)
        return

      case 'confirmation-required':
        setCloseState(sessionId, {
          state: 'confirmation-required',
        })
        return

      case 'release-failed':
        setCloseState(sessionId, {
          state: 'release-failed',
          intent,
          failure: result.failure,
        })
        return

      case 'not-found':
        clearCloseState(sessionId)
        return

      case 'wait-for-save':
        setCloseState(sessionId, {
          state: 'release-failed',
          intent,
          failure: {
            code: 'platform',
            recoverable: false,
          },
        })
    }
  }

  return {
    create,
    open,
    save: documents.save,
    closeCanvas,

    cancelCanvasClose(sessionId) {
      const state = closeStates.get(sessionId)

      if (!state || state.state === 'releasing') {
        return
      }

      clearCloseState(sessionId)
    },

    getCloseSnapshot() {
      return closeSnapshot
    },

    planApplicationClose: documents.planApplicationClose,
    getEditorSession: documents.getEditorSession,
    getSessionSnapshot: documents.getSessionSnapshot,

    getVersion() {
      return version
    },

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      stopDocumentSubscription()
      closeOperations.clear()
      closeStates.clear()
      closeSnapshot = EMPTY_CLOSE_SNAPSHOT
      listeners.clear()
      documents.dispose()
    },
  }
}
