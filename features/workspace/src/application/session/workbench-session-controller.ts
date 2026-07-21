import type {
  ActiveDocumentViewModel,
  CreateDocumentRequest,
  DocumentSessionId,
  DocumentTabViewModel,
  LocalPersistenceState,
  PageId,
  WorkbenchSessionStore,
  WorkbenchViewModel,
  WorkspacePageViewModel,
} from '../../contracts/public-api'
import { EMPTY_WORKBENCH_VIEW_MODEL } from '../../contracts/public-api'

export function createWorkbenchSessionController(): WorkbenchSessionStore {
  let snapshot = EMPTY_WORKBENCH_VIEW_MODEL
  const documents = new Map<DocumentSessionId, ActiveDocumentViewModel>()
  const listeners = new Set<() => void>()

  function emit(nextSnapshot: WorkbenchViewModel): void {
    assertWorkbenchInvariants(nextSnapshot)
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

  function createDocument(request: CreateDocumentRequest): void {
    const documentId = request.documentId ?? crypto.randomUUID()
    const sessionId = request.sessionId ?? crypto.randomUUID()
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

    documents.set(sessionId, activeDocument)

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
            local: request.persistence ?? 'dirty',
            remote: 'not-configured',
          },
          isActive: true,
          canClose: true,
        },
      ],
    })
  }

  function activateDocument(sessionId: DocumentSessionId): void {
    const targetTab = snapshot.tabs.find((tab) => tab.sessionId === sessionId)
    if (!targetTab || targetTab.isActive) {
      return
    }

    const activeDocument = documents.get(sessionId)
    if (!activeDocument) {
      throw new Error('WORKBENCH_DOCUMENT_NOT_FOUND')
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

  function closeDocument(sessionId: DocumentSessionId): void {
    const closingIndex = snapshot.tabs.findIndex((tab) => tab.sessionId === sessionId)
    if (closingIndex < 0) {
      return
    }

    const remainingTabs = snapshot.tabs.filter((tab) => tab.sessionId !== sessionId)
    documents.delete(sessionId)

    if (snapshot.activeSessionId !== sessionId) {
      emit({ ...snapshot, tabs: remainingTabs })
      return
    }

    const nextActiveTab = remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)] ?? null

    if (!nextActiveTab) {
      emit(EMPTY_WORKBENCH_VIEW_MODEL)
      return
    }

    const nextActiveDocument = documents.get(nextActiveTab.sessionId)
    if (!nextActiveDocument) {
      throw new Error('WORKBENCH_DOCUMENT_NOT_FOUND')
    }

    emit({
      activeSessionId: nextActiveTab.sessionId,
      activeDocument: nextActiveDocument,
      tabs: remainingTabs.map((tab) => ({
        ...tab,
        isActive: tab.sessionId === nextActiveTab.sessionId,
      })),
    })
  }

  function createPage(sessionId: DocumentSessionId, title: string): void {
    const activeDocument = snapshot.activeDocument
    if (!activeDocument || activeDocument.sessionId !== sessionId) {
      return
    }
    const page: WorkspacePageViewModel = {
      pageId: crypto.randomUUID(),
      title,
      kind: 'canvas',
      isActive: false,
      isArchived: false,
    }
    const nextDocument = {
      ...activeDocument,
      pages: [...activeDocument.pages, page],
    }
    documents.set(sessionId, nextDocument)
    emit({
      ...snapshot,
      activeDocument: nextDocument,
    })
  }

  function activatePage(sessionId: DocumentSessionId, pageId: PageId): void {
    const activeDocument = snapshot.activeDocument
    if (!activeDocument || activeDocument.sessionId !== sessionId) {
      return
    }
    if (!activeDocument.pages.some((page) => page.pageId === pageId)) {
      return
    }
    const nextDocument = {
      ...activeDocument,
      pages: activeDocument.pages.map((page) => ({
        ...page,
        isActive: page.pageId === pageId,
      })),
    }
    documents.set(sessionId, nextDocument)
    emit({
      ...snapshot,
      activeDocument: nextDocument,
    })
  }

  function setLocalPersistence(sessionId: DocumentSessionId, state: LocalPersistenceState): void {
    const tab = snapshot.tabs.find((candidate) => candidate.sessionId === sessionId)
    if (!tab || tab.persistence.local === state) {
      return
    }

    emit({
      ...snapshot,
      tabs: snapshot.tabs.map((candidate) =>
        candidate.sessionId === sessionId
          ? { ...candidate, persistence: { ...candidate.persistence, local: state } }
          : candidate,
      ),
    })
  }

  return {
    getSnapshot,
    subscribe,
    createDocument,
    activateDocument,
    closeDocument,
    createPage,
    activatePage,
    setLocalPersistence,
  }
}

function assertWorkbenchInvariants(snapshot: WorkbenchViewModel): void {
  const activeTabs = snapshot.tabs.filter((tab) => tab.isActive)
  const sessionIds = new Set(snapshot.tabs.map((tab) => tab.sessionId))

  if (sessionIds.size !== snapshot.tabs.length) {
    throw new Error('WORKBENCH_DUPLICATE_SESSION_ID')
  }
  if (activeTabs.length > 1) {
    throw new Error('WORKBENCH_MULTIPLE_ACTIVE_SESSIONS')
  }
  if (snapshot.activeSessionId === null) {
    if (activeTabs.length !== 0 || snapshot.activeDocument !== null) {
      throw new Error('WORKBENCH_EMPTY_STATE_INCONSISTENT')
    }
    return
  }
  if (!sessionIds.has(snapshot.activeSessionId)) {
    throw new Error('WORKBENCH_ACTIVE_SESSION_NOT_FOUND')
  }
  if (activeTabs[0]?.sessionId !== snapshot.activeSessionId) {
    throw new Error('WORKBENCH_ACTIVE_TAB_INCONSISTENT')
  }
  if (snapshot.activeDocument?.sessionId !== snapshot.activeSessionId) {
    throw new Error('WORKBENCH_ACTIVE_DOCUMENT_INCONSISTENT')
  }
}
