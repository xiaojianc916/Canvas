import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type {
  ApplicationClosePlan,
  CanvasCloseIntent,
  CanvasDocumentService,
  CanvasReleaseResult,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

export type CanvasCloseSnapshot =
  | { readonly state: 'idle' }
  | {
      readonly state: 'confirmation-required'
      readonly sessionId: CanvasSessionId
    }
  | {
      readonly state: 'releasing'
      readonly sessionId: CanvasSessionId
      readonly intent: CanvasCloseIntent
    }
  | {
      readonly state: 'release-failed'
      readonly sessionId: CanvasSessionId
      readonly intent: CanvasCloseIntent
    }

export interface CanvasWorkflow {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>

  /**
   * 唯一的 canvas 关闭入口。
   *
   * normal：保留未保存内容，必要时进入确认状态。
   * discard：明确放弃未保存内容后释放 native document session。
   */
  readonly closeCanvas: (
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ) => Promise<void>

  readonly cancelCanvasClose: () => void
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

  let version = 0
  let closeSnapshot: CanvasCloseSnapshot = { state: 'idle' }
  let activeClose: Promise<void> | null = null

  const stopDocumentSubscription = documents.subscribe(emit)

  function emit(): void {
    version += 1

    for (const listener of listeners) {
      listener()
    }
  }

  function setCloseSnapshot(next: CanvasCloseSnapshot): void {
    closeSnapshot = next
    emit()
  }

  function create(title: string): void {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      void documents.releaseCanvas(opened.sessionId, 'discard')
      throw error
    }
  }

  async function open(): Promise<void> {
    const opened = await documents.open()

    if (!opened) {
      return
    }

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      await documents.releaseCanvas(opened.sessionId, 'discard')
      throw error
    }
  }

  async function closeCanvas(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<void> {
    if (activeClose) {
      return activeClose
    }

    activeClose = performClose(sessionId, intent).finally(() => {
      activeClose = null
    })

    return activeClose
  }

  async function performClose(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<void> {
    setCloseSnapshot({
      state: 'releasing',
      sessionId,
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
        setCloseSnapshot({ state: 'idle' })
        return

      case 'confirmation-required':
        setCloseSnapshot({
          state: 'confirmation-required',
          sessionId,
        })
        return

      case 'release-failed':
        setCloseSnapshot({
          state: 'release-failed',
          sessionId,
          intent,
        })
        return

      case 'not-found':
        setCloseSnapshot({ state: 'idle' })
        return

      case 'wait-for-save':
        setCloseSnapshot({
          state: 'release-failed',
          sessionId,
        })
    }
  }

  return {
    create,
    open,
    save: documents.save,
    closeCanvas,

    cancelCanvasClose() {
      if (closeSnapshot.state === 'releasing') {
        return
      }

      setCloseSnapshot({ state: 'idle' })
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
      listeners.clear()
      documents.dispose()
    },
  }
}
