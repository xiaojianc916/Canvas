import {
  type ActiveDocumentViewModel,
  type DocumentSessionId,
  type DocumentTabViewModel,
  EMPTY_WORKBENCH_VIEW_MODEL,
  type WorkbenchViewModel,
} from '../model/workbench-view-model'

export interface CreateDocumentRequest {
  readonly title: string
  readonly initialPageTitle: string
}

export interface WorkbenchSessionActions {
  readonly createDocument: (request: CreateDocumentRequest) => Promise<void>
  readonly activateDocument: (sessionId: DocumentSessionId) => Promise<void>
  readonly closeDocument: (sessionId: DocumentSessionId) => Promise<void>
}

export interface WorkbenchSessionStore extends WorkbenchSessionActions {
  readonly getSnapshot: () => WorkbenchViewModel
  readonly subscribe: (listener: () => void) => () => void
}

export function createWorkbenchSessionController(): WorkbenchSessionStore {
  let snapshot = EMPTY_WORKBENCH_VIEW_MODEL
  const listeners = new Set<() => void>()

  function emit(nextSnapshot: WorkbenchViewModel): void {
    snapshot = nextSnapshot
    for (const listener of listeners) {
      listener()
    }
  }

  function getSnapshot(): WorkbenchViewModel {
    return snapshot
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  async function createDocument(request: CreateDocumentRequest): Promise<void> {
    const documentId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const pageId = crypto.randomUUID()

    const activeDocument: ActiveDocumentViewModel = {
      documentId,
      sessionId,
      title: request.title,
      pages: [
        {
          pageId,
          title: request.initialPageTitle,
          kind: 'canvas',
          isActive: true,
          isArchived: false,
        },
      ],
    }

    const previousTabs = snapshot.tabs.map(
      (tab): DocumentTabViewModel => ({
        ...tab,
        isActive: false,
      }),
    )

    emit({
      activeSessionId: sessionId,
      activeDocument,
      tabs: [
        ...previousTabs,
        {
          sessionId,
          documentId,
          title: request.title,
          persistence: {
            local: 'dirty',
            remote: 'not-configured',
          },
          isActive: true,
          canClose: true,
        },
      ],
    })
  }

  async function activateDocument(sessionId: DocumentSessionId): Promise<void> {
    const targetTab = snapshot.tabs.find((tab) => tab.sessionId === sessionId)
    if (!targetTab || targetTab.isActive) return

    const activeDocument: ActiveDocumentViewModel = {
      sessionId: targetTab.sessionId,
      documentId: targetTab.documentId,
      title: targetTab.title,
      pages: [],
    }

    emit({
      activeSessionId: sessionId,
      activeDocument,
      tabs: snapshot.tabs.map((tab) => ({
        ...tab,
        isActive: tab.sessionId === sessionId,
      })),
    })
  }

  async function closeDocument(sessionId: DocumentSessionId): Promise<void> {
    const closingIndex = snapshot.tabs.findIndex((tab) => tab.sessionId === sessionId)
    if (closingIndex < 0) return

    const remainingTabs = snapshot.tabs.filter((tab) => tab.sessionId !== sessionId)

    if (snapshot.activeSessionId !== sessionId) {
      emit({ ...snapshot, tabs: remainingTabs })
      return
    }

    const nextActiveTab = remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)] ?? null

    if (!nextActiveTab) {
      emit(EMPTY_WORKBENCH_VIEW_MODEL)
      return
    }

    emit({
      activeSessionId: nextActiveTab.sessionId,
      activeDocument: {
        sessionId: nextActiveTab.sessionId,
        documentId: nextActiveTab.documentId,
        title: nextActiveTab.title,
        pages: [],
      },
      tabs: remainingTabs.map((tab) => ({
        ...tab,
        isActive: tab.sessionId === nextActiveTab.sessionId,
      })),
    })
  }

  return {
    getSnapshot,
    subscribe,
    createDocument,
    activateDocument,
    closeDocument,
  }
}
