import type {
  ApplicationClosePlan,
  CanvasCloseDecision,
  CanvasDocumentService,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

export interface CanvasWorkflow {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (sessionId: CanvasSessionId) => CanvasCloseDecision
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly discardAllAndClose: (sessionIds: readonly CanvasSessionId[]) => void
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (sessionId: CanvasSessionId) => CanvasSessionSnapshot | null
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

  function requestClose(sessionId: CanvasSessionId): CanvasCloseDecision {
    const decision = documents.requestClose(sessionId)

    if (decision.kind === 'close-now') {
      workspace.closeCanvas(sessionId)
    }

    return decision
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
    subscribe: documents.subscribe,
    dispose: documents.dispose,
  }
}
