import type {
  ActiveCanvasViewModel,
  CanvasSessionId,
  CanvasTabViewModel,
  CreateCanvasRequest,
  LocalPersistenceState,
  PageId,
  WorkbenchSessionStore,
  WorkbenchViewModel,
  WorkspacePageViewModel,
} from '../../contracts/public-api'
import { EMPTY_WORKBENCH_VIEW_MODEL } from '../../contracts/public-api'

export function createWorkbenchSessionController(): WorkbenchSessionStore {
  let snapshot = EMPTY_WORKBENCH_VIEW_MODEL
  const canvases = new Map<CanvasSessionId, ActiveCanvasViewModel>()
  const listeners = new Set<() => void>()

  function emit(nextSnapshot: WorkbenchViewModel): void {
    assertWorkbenchInvariants(nextSnapshot)
    snapshot = nextSnapshot
    for (const listener of listeners) listener()
  }

  function createCanvas(request: CreateCanvasRequest): void {
    const canvasId = request.canvasId ?? crypto.randomUUID()
    const sessionId = request.sessionId ?? crypto.randomUUID()
    const activeCanvas: ActiveCanvasViewModel = {
      canvasId,
      sessionId,
      title: request.title,
      pages: [{
        pageId: crypto.randomUUID(),
        title: request.initialPageTitle,
        kind: 'canvas',
        isActive: true,
        isArchived: false,
      }],
    }
    canvases.set(sessionId, activeCanvas)
    const tabs = snapshot.tabs.map((tab): CanvasTabViewModel => ({ ...tab, isActive: false }))
    emit({
      activeSessionId: sessionId,
      activeCanvas,
      tabs: [...tabs, {
        sessionId,
        canvasId,
        title: request.title,
        persistence: { local: request.persistence ?? 'dirty', remote: 'not-configured' },
        isActive: true,
        canClose: true,
      }],
    })
  }

  function activateCanvas(sessionId: CanvasSessionId): void {
    const target = snapshot.tabs.find((tab) => tab.sessionId === sessionId)
    if (!target || target.isActive) return
    const activeCanvas = canvases.get(sessionId)
    if (!activeCanvas) throw new Error('WORKBENCH_CANVAS_NOT_FOUND')
    emit({
      activeSessionId: sessionId,
      activeCanvas,
      tabs: snapshot.tabs.map((tab) => ({ ...tab, isActive: tab.sessionId === sessionId })),
    })
  }

  function closeCanvas(sessionId: CanvasSessionId): void {
    const closingIndex = snapshot.tabs.findIndex((tab) => tab.sessionId === sessionId)
    if (closingIndex < 0) return
    const remainingTabs = snapshot.tabs.filter((tab) => tab.sessionId !== sessionId)
    canvases.delete(sessionId)
    if (snapshot.activeSessionId !== sessionId) {
      emit({ ...snapshot, tabs: remainingTabs })
      return
    }
    const nextTab = remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)] ?? null
    if (!nextTab) {
      emit(EMPTY_WORKBENCH_VIEW_MODEL)
      return
    }
    const activeCanvas = canvases.get(nextTab.sessionId)
    if (!activeCanvas) throw new Error('WORKBENCH_CANVAS_NOT_FOUND')
    emit({
      activeSessionId: nextTab.sessionId,
      activeCanvas,
      tabs: remainingTabs.map((tab) => ({ ...tab, isActive: tab.sessionId === nextTab.sessionId })),
    })
  }

  function createPage(sessionId: CanvasSessionId, title: string): void {
    const activeCanvas = snapshot.activeCanvas
    if (!activeCanvas || activeCanvas.sessionId !== sessionId) return
    const page: WorkspacePageViewModel = {
      pageId: crypto.randomUUID(), title, kind: 'canvas', isActive: false, isArchived: false,
    }
    updateActiveCanvas({ ...activeCanvas, pages: [...activeCanvas.pages, page] })
  }

  function activatePage(sessionId: CanvasSessionId, pageId: PageId): void {
    const activeCanvas = snapshot.activeCanvas
    if (!activeCanvas || activeCanvas.sessionId !== sessionId) return
    if (!activeCanvas.pages.some((page) => page.pageId === pageId)) return
    updateActiveCanvas({
      ...activeCanvas,
      pages: activeCanvas.pages.map((page) => ({ ...page, isActive: page.pageId === pageId })),
    })
  }

  function updateActiveCanvas(canvas: ActiveCanvasViewModel): void {
    canvases.set(canvas.sessionId, canvas)
    emit({ ...snapshot, activeCanvas: canvas })
  }

  function setLocalPersistence(sessionId: CanvasSessionId, state: LocalPersistenceState): void {
    const tab = snapshot.tabs.find((candidate) => candidate.sessionId === sessionId)
    if (!tab || tab.persistence.local === state) return
    emit({
      ...snapshot,
      tabs: snapshot.tabs.map((candidate) => candidate.sessionId === sessionId
        ? { ...candidate, persistence: { ...candidate.persistence, local: state } }
        : candidate),
    })
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    createCanvas,
    activateCanvas,
    closeCanvas,
    createPage,
    activatePage,
    setLocalPersistence,
  }
}

function assertWorkbenchInvariants(snapshot: WorkbenchViewModel): void {
  const activeTabs = snapshot.tabs.filter((tab) => tab.isActive)
  const sessionIds = new Set(snapshot.tabs.map((tab) => tab.sessionId))
  if (sessionIds.size !== snapshot.tabs.length) throw new Error('WORKBENCH_DUPLICATE_SESSION_ID')
  if (activeTabs.length > 1) throw new Error('WORKBENCH_MULTIPLE_ACTIVE_SESSIONS')
  if (snapshot.activeSessionId === null) {
    if (activeTabs.length !== 0 || snapshot.activeCanvas !== null) throw new Error('WORKBENCH_EMPTY_STATE_INCONSISTENT')
    return
  }
  if (!sessionIds.has(snapshot.activeSessionId)) throw new Error('WORKBENCH_ACTIVE_SESSION_NOT_FOUND')
  if (activeTabs[0]?.sessionId !== snapshot.activeSessionId) throw new Error('WORKBENCH_ACTIVE_TAB_INCONSISTENT')
  if (snapshot.activeCanvas?.sessionId !== snapshot.activeSessionId) throw new Error('WORKBENCH_ACTIVE_CANVAS_INCONSISTENT')
}
