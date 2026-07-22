import type {
  ActiveCanvasViewModel,
  CanvasSessionId,
  CanvasTabViewModel,
  CreateCanvasRequest,
  OpenWorkspaceSurfaceRequest,
  WorkbenchSessionStore,
  WorkbenchSurfaceViewModel,
  WorkbenchTabId,
  WorkbenchTabViewModel,
  WorkbenchViewModel,
  WorkspaceSurfaceViewModel,
  WorkspaceTabViewModel,
} from '../../contracts/public-api'
import { EMPTY_WORKBENCH_VIEW_MODEL, START_TAB_ID } from '../../contracts/public-api'

export function createWorkbenchSessionController(): WorkbenchSessionStore {
  let snapshot = EMPTY_WORKBENCH_VIEW_MODEL
  const listeners = new Set<() => void>()
  const surfaces = new Map<WorkbenchTabId, WorkbenchSurfaceViewModel>([
    [START_TAB_ID, EMPTY_WORKBENCH_VIEW_MODEL.activeSurface],
  ])

  function publish(tabs: readonly WorkbenchTabViewModel[], activeTabId: WorkbenchTabId): void {
    const activeSurface = surfaces.get(activeTabId)

    if (!activeSurface) {
      throw new Error('WORKBENCH_SURFACE_NOT_FOUND')
    }

    const normalizedTabs = tabs.map((tab) => ({
      ...tab,
      isActive: tab.id === activeTabId,
    }))

    const activeCanvas = activeSurface.kind === 'canvas' ? activeSurface : null

    const nextSnapshot: WorkbenchViewModel = {
      activeTabId,
      activeSessionId: activeCanvas?.sessionId ?? null,
      tabs: normalizedTabs,
      activeSurface,
      activeCanvas,
    }

    assertWorkbenchInvariants(nextSnapshot)
    snapshot = nextSnapshot

    for (const listener of listeners) {
      listener()
    }
  }

  function createCanvas(request: CreateCanvasRequest): void {
    const canvasId = request.canvasId ?? crypto.randomUUID()
    const sessionId = request.sessionId ?? crypto.randomUUID()
    const existing = findCanvasTabBySessionId(snapshot.tabs, sessionId)

    if (existing) {
      activateTab(existing.id)
      return
    }

    const tabId = 'canvas:' + sessionId

    const surface: ActiveCanvasViewModel = {
      kind: 'canvas',
      tabId,
      sessionId,
      canvasId,
      title: request.title,
    }

    const tab: CanvasTabViewModel = {
      id: tabId,
      kind: 'canvas',
      sessionId,
      canvasId,
      title: request.title,
      isActive: true,
      canClose: true,
    }

    surfaces.set(tabId, surface)
    publish([...snapshot.tabs, tab], tabId)
  }

  function openWorkspaceSurface(request: OpenWorkspaceSurfaceRequest): void {
    const tabId = 'workspace:' + request.surfaceId
    const existing = snapshot.tabs.find((tab) => tab.id === tabId)

    if (existing) {
      activateTab(existing.id)
      return
    }

    const surface: WorkspaceSurfaceViewModel = {
      kind: 'workspace',
      tabId,
      surfaceId: request.surfaceId,
      title: request.title,
    }

    const tab: WorkspaceTabViewModel = {
      id: tabId,
      kind: 'workspace',
      surfaceId: request.surfaceId,
      title: request.title,
      isActive: true,
      canClose: true,
    }

    surfaces.set(tabId, surface)
    publish([...snapshot.tabs, tab], tabId)
  }

  function activateTab(tabId: WorkbenchTabId): void {
    if (tabId === snapshot.activeTabId) {
      return
    }

    if (!snapshot.tabs.some((tab) => tab.id === tabId)) {
      return
    }

    publish(snapshot.tabs, tabId)
  }

  function closeTab(tabId: WorkbenchTabId): void {
    const closingIndex = snapshot.tabs.findIndex((tab) => tab.id === tabId)

    if (closingIndex < 0) {
      return
    }

    const closingTab = snapshot.tabs[closingIndex]

    if (!closingTab?.canClose) {
      return
    }

    const remainingTabs = snapshot.tabs.filter((tab) => tab.id !== tabId)
    surfaces.delete(tabId)

    if (snapshot.activeTabId !== tabId) {
      publish(remainingTabs, snapshot.activeTabId)
      return
    }

    const adjacentIndex = Math.min(closingIndex, remainingTabs.length - 1)

    const nextTab =
      remainingTabs[adjacentIndex] ?? remainingTabs[adjacentIndex - 1] ?? remainingTabs[0]

    if (!nextTab) {
      throw new Error('WORKBENCH_PERMANENT_TAB_MISSING')
    }

    publish(remainingTabs, nextTab.id)
  }

  function activateCanvas(sessionId: CanvasSessionId): void {
    const tab = findCanvasTabBySessionId(snapshot.tabs, sessionId)

    if (tab) {
      activateTab(tab.id)
    }
  }

  function closeCanvas(sessionId: CanvasSessionId): void {
    const tab = findCanvasTabBySessionId(snapshot.tabs, sessionId)

    if (tab) {
      closeTab(tab.id)
    }
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    createCanvas,
    openWorkspaceSurface,
    activateTab,
    closeTab,
    activateCanvas,
    closeCanvas,
  }
}

function findCanvasTabBySessionId(
  tabs: readonly WorkbenchTabViewModel[],
  sessionId: CanvasSessionId,
): CanvasTabViewModel | undefined {
  return tabs.find(
    (tab): tab is CanvasTabViewModel => tab.kind === 'canvas' && tab.sessionId === sessionId,
  )
}

function assertWorkbenchInvariants(snapshot: WorkbenchViewModel): void {
  if (snapshot.tabs.length === 0) {
    throw new Error('WORKBENCH_REQUIRES_PERMANENT_TAB')
  }

  const ids = new Set(snapshot.tabs.map((tab) => tab.id))

  if (ids.size !== snapshot.tabs.length) {
    throw new Error('WORKBENCH_DUPLICATE_TAB_ID')
  }

  const startTab = snapshot.tabs.find((tab) => tab.id === START_TAB_ID)

  if (!startTab || startTab.kind !== 'start' || startTab.canClose) {
    throw new Error('WORKBENCH_INVALID_START_TAB')
  }

  const activeTabs = snapshot.tabs.filter((tab) => tab.isActive)

  if (activeTabs.length !== 1 || activeTabs[0]?.id !== snapshot.activeTabId) {
    throw new Error('WORKBENCH_ACTIVE_TAB_INCONSISTENT')
  }

  if (snapshot.activeSurface.tabId !== snapshot.activeTabId) {
    throw new Error('WORKBENCH_ACTIVE_SURFACE_INCONSISTENT')
  }

  if (snapshot.activeSurface.kind === 'canvas') {
    if (
      snapshot.activeCanvas?.tabId !== snapshot.activeTabId ||
      snapshot.activeSessionId !== snapshot.activeSurface.sessionId
    ) {
      throw new Error('WORKBENCH_ACTIVE_CANVAS_INCONSISTENT')
    }

    return
  }

  if (snapshot.activeCanvas !== null || snapshot.activeSessionId !== null) {
    throw new Error('WORKBENCH_NON_CANVAS_SESSION_INCONSISTENT')
  }
}
