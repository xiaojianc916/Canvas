import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type {
  ApplicationClosePlan,
  CanvasDocumentService,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

export type CanvasCloseRequestResult =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'confirmation-required'
      readonly sessionId: CanvasSessionId
    }
  | { readonly kind: 'not-found' }

export interface CanvasWorkflow {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (sessionId: CanvasSessionId) => Promise<CanvasCloseRequestResult>
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly discardAllAndClose: (sessionIds: readonly CanvasSessionId[]) => void
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (sessionId: CanvasSessionId) => CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void
}

export function createCanvasWorkflow(
  documents: CanvasDocumentService,
  workspace: WorkbenchSessionStore,
): CanvasWorkflow {
  function create(title: string): void {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      documents.discardAndClose(opened.sessionId)
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
      documents.discardAndClose(opened.sessionId)
      throw error
    }
  }

  async function requestClose(sessionId: CanvasSessionId): Promise<CanvasCloseRequestResult> {
    let decision = documents.requestClose(sessionId)

    if (decision.kind === 'wait-for-save') {
      // 保存失败时 CanvasDocumentService 会进入 failed 状态。
      // 此处只等待状态稳定，随后重新计算关闭决策。
      await decision.operation.catch(() => undefined)
      decision = documents.requestClose(sessionId)
    }

    switch (decision.kind) {
      case 'close-now':
        workspace.closeCanvas(sessionId)
        return { kind: 'closed' }

      case 'confirm-discard':
        return {
          kind: 'confirmation-required',
          sessionId,
        }

      case 'not-found':
        return { kind: 'not-found' }

      case 'wait-for-save':
        // 理论上不会进入：同一 saveOperation 已在上方等待。
        // 保留防御性处理，避免未来文档实现改变后静默关闭。
        return {
          kind: 'confirmation-required',
          sessionId,
        }
    }
  }

  function discardAndClose(sessionId: CanvasSessionId): void {
    documents.discardAndClose(sessionId)
    workspace.closeCanvas(sessionId)
  }

  function discardAllAndClose(sessionIds: readonly CanvasSessionId[]): void {
    for (const sessionId of sessionIds) {
      discardAndClose(sessionId)
    }
  }

  return {
    create,
    open,
    save: documents.save,
    requestClose,
    discardAndClose,
    planApplicationClose: documents.planApplicationClose,
    discardAllAndClose,
    getEditorSession: documents.getEditorSession,
    getSessionSnapshot: documents.getSessionSnapshot,
    getVersion: documents.getVersion,
    subscribe: documents.subscribe,
    dispose: documents.dispose,
  }
}
