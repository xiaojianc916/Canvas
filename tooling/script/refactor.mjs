#!/usr/bin/env node

/**
 * Chrome-style Workbench Tabs full replacement.
 *
 * References:
 * - Chromium tab geometry and adjacent separator behavior:
 *   chrome/browser/ui/views/tabs/tab_style_views.cc
 * - MIT HTML/CSS Chrome tabs implementation:
 *   https://github.com/adamschwartz/chrome-tabs
 *
 * This script replaces the complete workbench-tab subsystem:
 * - generic workbench surface/tab model
 * - canonical controller with sequential ordering
 * - active-tab fallback rules
 * - workspace-surface deduplication
 * - tab movement
 * - Chrome-style React renderer
 * - Chrome-style static SVG geometry
 * - responsive small/smaller/mini states
 * - drag reorder, middle-click close and keyboard navigation
 * - architecture-check false-positive fix
 */

import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const apply = process.argv.includes('--apply')
const skipChecks = process.argv.includes('--skip-checks')
const backupRoot = join(
  root,
  '.refactor-backup',
  'chrome-workbench-tabs-' +
    new Date().toISOString().replaceAll(/[:.]/g, '-'),
)

assertRepository()

const replacements = new Map([
  [
    'features/workspace/src/contracts/workbench-contract.ts',
    String.raw`export type CanvasId = string
export type CanvasSessionId = string
export type WorkbenchTabId = string

export type CanvasTabStatus =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'failed'

export type WorkspaceSurfaceId =
  | 'pages'
  | 'documents'
  | 'search'
  | 'layers'
  | 'relations'
  | 'data'
  | 'assets'
  | 'extensions'

interface WorkbenchTabBase {
  readonly id: WorkbenchTabId
  readonly title: string
  readonly isActive: boolean
  readonly canClose: boolean
}

export interface StartTabViewModel extends WorkbenchTabBase {
  readonly kind: 'start'
}

export interface CanvasTabViewModel extends WorkbenchTabBase {
  readonly kind: 'canvas'
  readonly sessionId: CanvasSessionId
  readonly canvasId: CanvasId
  readonly status?: CanvasTabStatus
}

export interface WorkspaceTabViewModel extends WorkbenchTabBase {
  readonly kind: 'workspace'
  readonly surfaceId: WorkspaceSurfaceId
}

export type WorkbenchTabViewModel =
  | StartTabViewModel
  | CanvasTabViewModel
  | WorkspaceTabViewModel

export interface StartSurfaceViewModel {
  readonly kind: 'start'
  readonly tabId: WorkbenchTabId
}

export interface ActiveCanvasViewModel {
  readonly kind: 'canvas'
  readonly tabId: WorkbenchTabId
  readonly sessionId: CanvasSessionId
  readonly canvasId: CanvasId
  readonly title: string
}

export interface WorkspaceSurfaceViewModel {
  readonly kind: 'workspace'
  readonly tabId: WorkbenchTabId
  readonly surfaceId: WorkspaceSurfaceId
  readonly title: string
}

export type WorkbenchSurfaceViewModel =
  | StartSurfaceViewModel
  | ActiveCanvasViewModel
  | WorkspaceSurfaceViewModel

export interface WorkbenchViewModel {
  readonly activeTabId: WorkbenchTabId
  readonly activeSessionId: CanvasSessionId | null
  readonly tabs: readonly WorkbenchTabViewModel[]
  readonly activeSurface: WorkbenchSurfaceViewModel
  readonly activeCanvas: ActiveCanvasViewModel | null
}

export interface CreateCanvasRequest {
  readonly title: string
  readonly canvasId?: CanvasId
  readonly sessionId?: CanvasSessionId
}

export interface OpenWorkspaceSurfaceRequest {
  readonly surfaceId: WorkspaceSurfaceId
  readonly title: string
}

export interface WorkbenchSessionCommands {
  readonly createCanvas: (request: CreateCanvasRequest) => void
  readonly openWorkspaceSurface: (
    request: OpenWorkspaceSurfaceRequest,
  ) => void
  readonly activateTab: (tabId: WorkbenchTabId) => void
  readonly closeTab: (tabId: WorkbenchTabId) => void
  readonly moveTab: (
    tabId: WorkbenchTabId,
    targetIndex: number,
  ) => void

  /**
   * Document-boundary adapters.
   *
   * CanvasDocumentService continues to identify documents by session ID.
   * Workbench chrome must otherwise operate on WorkbenchTabId.
   */
  readonly activateCanvas: (
    sessionId: CanvasSessionId,
  ) => void
  readonly closeCanvas: (
    sessionId: CanvasSessionId,
  ) => void
}

export interface WorkbenchSessionStore
  extends WorkbenchSessionCommands {
  readonly getSnapshot: () => WorkbenchViewModel
  readonly subscribe: (
    listener: () => void,
  ) => () => void
}

export const START_TAB_ID: WorkbenchTabId =
  'workbench:start'

const START_TAB: StartTabViewModel = Object.freeze({
  id: START_TAB_ID,
  kind: 'start',
  title: '新标签页',
  isActive: true,
  canClose: false,
})

const START_SURFACE: StartSurfaceViewModel =
  Object.freeze({
    kind: 'start',
    tabId: START_TAB_ID,
  })

export const EMPTY_WORKBENCH_VIEW_MODEL: WorkbenchViewModel =
  Object.freeze({
    activeTabId: START_TAB_ID,
    activeSessionId: null,
    tabs: Object.freeze([START_TAB]),
    activeSurface: START_SURFACE,
    activeCanvas: null,
  })
`,
  ],
  [
    'features/workspace/src/contracts/public-api.ts',
    String.raw`export type {
  RegisteredCommand,
  UICommand,
  UICommandHandler,
} from './command-contract'

export {
  type ActiveCanvasViewModel,
  type CanvasId,
  type CanvasSessionId,
  type CanvasTabStatus,
  type CanvasTabViewModel,
  type CreateCanvasRequest,
  EMPTY_WORKBENCH_VIEW_MODEL,
  type OpenWorkspaceSurfaceRequest,
  START_TAB_ID,
  type StartSurfaceViewModel,
  type StartTabViewModel,
  type WorkbenchSessionCommands,
  type WorkbenchSessionStore,
  type WorkbenchSurfaceViewModel,
  type WorkbenchTabId,
  type WorkbenchTabViewModel,
  type WorkbenchViewModel,
  type WorkspaceSurfaceId,
  type WorkspaceSurfaceViewModel,
  type WorkspaceTabViewModel,
} from './workbench-contract'
`,
  ],
  [
    'features/workspace/src/contracts-entry.ts',
    String.raw`export {
  type ActiveCanvasViewModel,
  type CanvasId,
  type CanvasSessionId,
  type CanvasTabStatus,
  type CanvasTabViewModel,
  type CreateCanvasRequest,
  EMPTY_WORKBENCH_VIEW_MODEL,
  type OpenWorkspaceSurfaceRequest,
  START_TAB_ID,
  type StartSurfaceViewModel,
  type StartTabViewModel,
  type WorkbenchSessionCommands,
  type WorkbenchSessionStore,
  type WorkbenchSurfaceViewModel,
  type WorkbenchTabId,
  type WorkbenchTabViewModel,
  type WorkbenchViewModel,
  type WorkspaceSurfaceId,
  type WorkspaceSurfaceViewModel,
  type WorkspaceTabViewModel,
} from './contracts/public-api'

export type {
  CanvasPageViewModel,
  WorkspaceChromeRenderProps,
  WorkspaceShellActions,
  WorkspaceShellProps,
} from './contracts/shell-contract'
`,
  ],
  [
    'features/workspace/src/contracts/shell-contract.ts',
    String.raw`import type { ReactNode } from 'react'

import type {
  WorkbenchTabId,
  WorkbenchTabViewModel,
  WorkbenchViewModel,
  WorkspaceSurfaceId,
} from './public-api'

export interface CanvasPageViewModel {
  readonly id: string
  readonly title: string
  readonly isActive: boolean
}

export interface WorkspaceShellActions {
  readonly createCanvas: () => void
  readonly openCanvas: () => void
  readonly activateTab: (
    tabId: WorkbenchTabId,
  ) => void
  readonly closeTab: (
    tabId: WorkbenchTabId,
  ) => void
  readonly moveTab: (
    tabId: WorkbenchTabId,
    targetIndex: number,
  ) => void
  readonly openWorkspaceSurface: (
    surfaceId: WorkspaceSurfaceId,
    title: string,
  ) => void
  readonly activatePage: (pageId: string) => void
  readonly createPage: () => void
  readonly openCommandPalette: () => void
  readonly openSettingsWindow: () => void
}

export interface WorkspaceChromeRenderProps {
  readonly isSidebarOpen: boolean
  readonly sidebarWidth: number
  readonly tabs: readonly WorkbenchTabViewModel[]
  readonly onSidebarToggle: () => void
  readonly onActivateTab: (
    tabId: WorkbenchTabId,
  ) => void
  readonly onCloseTab: (
    tabId: WorkbenchTabId,
  ) => void
  readonly onMoveTab: (
    tabId: WorkbenchTabId,
    targetIndex: number,
  ) => void
  readonly onCreateCanvas: () => void
}

export interface WorkspaceShellProps {
  readonly model: WorkbenchViewModel
  readonly actions: WorkspaceShellActions
  readonly pages: readonly CanvasPageViewModel[]
  readonly renderChrome: (
    props: WorkspaceChromeRenderProps,
  ) => ReactNode
  readonly mainContent: ReactNode
  readonly inspector: ReactNode
  readonly statusLeft: ReactNode
  readonly statusRight?: ReactNode
  readonly assistantOverlay?: ReactNode
  readonly overlays?: ReactNode
}
`,
  ],
  [
    'features/workspace/src/application/session/workbench-session-controller.ts',
    String.raw`import type {
  ActiveCanvasViewModel,
  CanvasSessionId,
  CanvasTabViewModel,
  CreateCanvasRequest,
  OpenWorkspaceSurfaceRequest,
  StartSurfaceViewModel,
  StartTabViewModel,
  WorkbenchSessionStore,
  WorkbenchSurfaceViewModel,
  WorkbenchTabId,
  WorkbenchTabViewModel,
  WorkbenchViewModel,
  WorkspaceSurfaceViewModel,
  WorkspaceTabViewModel,
} from '../../contracts/public-api'
import { START_TAB_ID } from '../../contracts/public-api'

type WorkbenchEntry =
  | StartEntry
  | CanvasEntry
  | WorkspaceEntry

interface EntryBase {
  readonly id: WorkbenchTabId
  readonly title: string
  readonly canClose: boolean
}

interface StartEntry extends EntryBase {
  readonly kind: 'start'
}

interface CanvasEntry extends EntryBase {
  readonly kind: 'canvas'
  readonly sessionId: CanvasSessionId
  readonly canvasId: string
}

interface WorkspaceEntry extends EntryBase {
  readonly kind: 'workspace'
  readonly surfaceId:
    import('../../contracts/public-api').WorkspaceSurfaceId
}

const START_ENTRY: StartEntry = Object.freeze({
  id: START_TAB_ID,
  kind: 'start',
  title: '新标签页',
  canClose: false,
})

export function createWorkbenchSessionController():
  WorkbenchSessionStore {
  let entries: readonly WorkbenchEntry[] = [START_ENTRY]
  let activeTabId = START_TAB_ID
  const listeners = new Set<() => void>()

  let snapshot = projectSnapshot(entries, activeTabId)

  function emit(): void {
    snapshot = projectSnapshot(entries, activeTabId)
    assertInvariants(snapshot)

    for (const listener of listeners) {
      listener()
    }
  }

  function insertToActiveRight(
    entry: WorkbenchEntry,
  ): void {
    const activeIndex = entries.findIndex(
      (candidate) => candidate.id === activeTabId,
    )

    const insertionIndex =
      activeIndex < 0 ? entries.length : activeIndex + 1

    entries = [
      ...entries.slice(0, insertionIndex),
      entry,
      ...entries.slice(insertionIndex),
    ]

    activeTabId = entry.id
    emit()
  }

  function createCanvas(
    request: CreateCanvasRequest,
  ): void {
    const canvasId =
      request.canvasId ?? crypto.randomUUID()

    const sessionId =
      request.sessionId ?? crypto.randomUUID()

    const existing = entries.find(
      (entry) =>
        entry.kind === 'canvas' &&
        entry.sessionId === sessionId,
    )

    if (existing) {
      activateTab(existing.id)
      return
    }

    insertToActiveRight({
      id: 'canvas:' + sessionId,
      kind: 'canvas',
      title: request.title,
      canClose: true,
      sessionId,
      canvasId,
    })
  }

  function openWorkspaceSurface(
    request: OpenWorkspaceSurfaceRequest,
  ): void {
    const tabId = 'workspace:' + request.surfaceId

    const existing = entries.find(
      (entry) => entry.id === tabId,
    )

    if (existing) {
      activateTab(existing.id)
      return
    }

    insertToActiveRight({
      id: tabId,
      kind: 'workspace',
      title: request.title,
      canClose: true,
      surfaceId: request.surfaceId,
    })
  }

  function activateTab(
    tabId: WorkbenchTabId,
  ): void {
    if (
      tabId === activeTabId ||
      !entries.some((entry) => entry.id === tabId)
    ) {
      return
    }

    activeTabId = tabId
    emit()
  }

  function closeTab(
    tabId: WorkbenchTabId,
  ): void {
    const closingIndex = entries.findIndex(
      (entry) => entry.id === tabId,
    )

    if (closingIndex < 0) {
      return
    }

    const closingEntry = entries[closingIndex]

    if (!closingEntry?.canClose) {
      return
    }

    const wasActive = tabId === activeTabId

    entries = entries.filter(
      (entry) => entry.id !== tabId,
    )

    if (wasActive) {
      const nextEntry =
        entries[closingIndex] ??
        entries[closingIndex - 1] ??
        entries[0]

      if (!nextEntry) {
        entries = [START_ENTRY]
        activeTabId = START_TAB_ID
      } else {
        activeTabId = nextEntry.id
      }
    }

    emit()
  }

  function moveTab(
    tabId: WorkbenchTabId,
    targetIndex: number,
  ): void {
    const sourceIndex = entries.findIndex(
      (entry) => entry.id === tabId,
    )

    if (sourceIndex < 0) {
      return
    }

    const source = entries[sourceIndex]

    if (!source || source.kind === 'start') {
      return
    }

    const minimumIndex = 1
    const maximumIndex = entries.length - 1
    const boundedTarget = Math.max(
      minimumIndex,
      Math.min(maximumIndex, targetIndex),
    )

    if (sourceIndex === boundedTarget) {
      return
    }

    const mutableEntries = [...entries]
    mutableEntries.splice(sourceIndex, 1)

    const adjustedTarget =
      sourceIndex < boundedTarget
        ? boundedTarget - 1
        : boundedTarget

    mutableEntries.splice(
      Math.max(minimumIndex, adjustedTarget),
      0,
      source,
    )

    entries = mutableEntries
    emit()
  }

  function activateCanvas(
    sessionId: CanvasSessionId,
  ): void {
    const entry = findCanvasEntry(
      entries,
      sessionId,
    )

    if (entry) {
      activateTab(entry.id)
    }
  }

  function closeCanvas(
    sessionId: CanvasSessionId,
  ): void {
    const entry = findCanvasEntry(
      entries,
      sessionId,
    )

    if (entry) {
      closeTab(entry.id)
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
    moveTab,
    activateCanvas,
    closeCanvas,
  }
}

function projectSnapshot(
  entries: readonly WorkbenchEntry[],
  activeTabId: WorkbenchTabId,
): WorkbenchViewModel {
  const activeEntry = entries.find(
    (entry) => entry.id === activeTabId,
  )

  if (!activeEntry) {
    throw new Error(
      'WORKBENCH_ACTIVE_ENTRY_NOT_FOUND',
    )
  }

  const activeSurface =
    projectSurface(activeEntry)

  const activeCanvas =
    activeSurface.kind === 'canvas'
      ? activeSurface
      : null

  return {
    activeTabId,
    activeSessionId:
      activeCanvas?.sessionId ?? null,
    tabs: entries.map((entry) =>
      projectTab(entry, activeTabId),
    ),
    activeSurface,
    activeCanvas,
  }
}

function projectTab(
  entry: WorkbenchEntry,
  activeTabId: WorkbenchTabId,
): WorkbenchTabViewModel {
  const common = {
    id: entry.id,
    title: entry.title,
    canClose: entry.canClose,
    isActive: entry.id === activeTabId,
  }

  switch (entry.kind) {
    case 'start': {
      const tab: StartTabViewModel = {
        ...common,
        kind: 'start',
      }

      return tab
    }

    case 'canvas': {
      const tab: CanvasTabViewModel = {
        ...common,
        kind: 'canvas',
        sessionId: entry.sessionId,
        canvasId: entry.canvasId,
      }

      return tab
    }

    case 'workspace': {
      const tab: WorkspaceTabViewModel = {
        ...common,
        kind: 'workspace',
        surfaceId: entry.surfaceId,
      }

      return tab
    }
  }
}

function projectSurface(
  entry: WorkbenchEntry,
): WorkbenchSurfaceViewModel {
  switch (entry.kind) {
    case 'start': {
      const surface: StartSurfaceViewModel = {
        kind: 'start',
        tabId: entry.id,
      }

      return surface
    }

    case 'canvas': {
      const surface: ActiveCanvasViewModel = {
        kind: 'canvas',
        tabId: entry.id,
        sessionId: entry.sessionId,
        canvasId: entry.canvasId,
        title: entry.title,
      }

      return surface
    }

    case 'workspace': {
      const surface: WorkspaceSurfaceViewModel = {
        kind: 'workspace',
        tabId: entry.id,
        surfaceId: entry.surfaceId,
        title: entry.title,
      }

      return surface
    }
  }
}

function findCanvasEntry(
  entries: readonly WorkbenchEntry[],
  sessionId: CanvasSessionId,
): CanvasEntry | undefined {
  return entries.find(
    (entry): entry is CanvasEntry =>
      entry.kind === 'canvas' &&
      entry.sessionId === sessionId,
  )
}

function assertInvariants(
  snapshot: WorkbenchViewModel,
): void {
  if (snapshot.tabs.length === 0) {
    throw new Error(
      'WORKBENCH_REQUIRES_START_TAB',
    )
  }

  const ids = new Set(
    snapshot.tabs.map((tab) => tab.id),
  )

  if (ids.size !== snapshot.tabs.length) {
    throw new Error(
      'WORKBENCH_DUPLICATE_TAB_ID',
    )
  }

  const startTab = snapshot.tabs.find(
    (tab) => tab.id === START_TAB_ID,
  )

  if (
    !startTab ||
    startTab.kind !== 'start' ||
    startTab.canClose
  ) {
    throw new Error(
      'WORKBENCH_INVALID_START_TAB',
    )
  }

  const activeTabs = snapshot.tabs.filter(
    (tab) => tab.isActive,
  )

  if (
    activeTabs.length !== 1 ||
    activeTabs[0]?.id !== snapshot.activeTabId
  ) {
    throw new Error(
      'WORKBENCH_ACTIVE_TAB_INCONSISTENT',
    )
  }

  if (
    snapshot.activeSurface.tabId !==
    snapshot.activeTabId
  ) {
    throw new Error(
      'WORKBENCH_ACTIVE_SURFACE_INCONSISTENT',
    )
  }

  if (snapshot.activeSurface.kind === 'canvas') {
    if (
      snapshot.activeCanvas?.tabId !==
        snapshot.activeTabId ||
      snapshot.activeSessionId !==
        snapshot.activeSurface.sessionId
    ) {
      throw new Error(
        'WORKBENCH_ACTIVE_CANVAS_INCONSISTENT',
      )
    }

    return
  }

  if (
    snapshot.activeCanvas !== null ||
    snapshot.activeSessionId !== null
  ) {
    throw new Error(
      'WORKBENCH_NON_CANVAS_STATE_INCONSISTENT',
    )
  }
}
`,
  ],
  [
    'features/workspace/src/application/session/workbench-session-controller.test.ts',
    String.raw`import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  createWorkbenchSessionController,
} from './workbench-session-controller'

beforeEach(() => {
  let id = 0

  vi.stubGlobal('crypto', {
    randomUUID: () =>
      'generated-' + String(++id),
  })
})

describe('workbench session controller', () => {
  it('starts with a tab-driven new-tab surface', () => {
    const store =
      createWorkbenchSessionController()

    expect(store.getSnapshot()).toMatchObject({
      activeTabId: 'workbench:start',
      activeSurface: {
        kind: 'start',
        tabId: 'workbench:start',
      },
      tabs: [
        {
          id: 'workbench:start',
          kind: 'start',
          title: '新标签页',
          canClose: false,
          isActive: true,
        },
      ],
    })
  })

  it('opens new tabs immediately right of active tab', () => {
    const store =
      createWorkbenchSessionController()

    store.createCanvas({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'One',
    })

    store.activateTab('workbench:start')

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    expect(
      store
        .getSnapshot()
        .tabs.map((tab) => tab.id),
    ).toEqual([
      'workbench:start',
      'workspace:assets',
      'canvas:session-1',
    ])
  })

  it('deduplicates singleton workspace surfaces', () => {
    const store =
      createWorkbenchSessionController()

    store.openWorkspaceSurface({
      surfaceId: 'relations',
      title: '关系',
    })

    store.openWorkspaceSurface({
      surfaceId: 'relations',
      title: '关系',
    })

    expect(
      store
        .getSnapshot()
        .tabs.filter(
          (tab) =>
            tab.id === 'workspace:relations',
        ),
    ).toHaveLength(1)
  })

  it('selects the right adjacent tab after closing active', () => {
    const store =
      createWorkbenchSessionController()

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    store.openWorkspaceSurface({
      surfaceId: 'relations',
      title: '关系',
    })

    store.activateTab('workspace:assets')
    store.closeTab('workspace:assets')

    expect(
      store.getSnapshot().activeTabId,
    ).toBe('workspace:relations')
  })

  it('selects the left adjacent tab when closing the last tab', () => {
    const store =
      createWorkbenchSessionController()

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    store.closeTab('workspace:assets')

    expect(
      store.getSnapshot().activeTabId,
    ).toBe('workbench:start')
  })

  it('moves tabs without moving the permanent new-tab entry', () => {
    const store =
      createWorkbenchSessionController()

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    store.openWorkspaceSurface({
      surfaceId: 'relations',
      title: '关系',
    })

    store.moveTab('workspace:relations', 1)

    expect(
      store
        .getSnapshot()
        .tabs.map((tab) => tab.id),
    ).toEqual([
      'workbench:start',
      'workspace:relations',
      'workspace:assets',
    ])

    store.moveTab('workbench:start', 2)

    expect(
      store.getSnapshot().tabs[0]?.id,
    ).toBe('workbench:start')
  })

  it('keeps canvas document commands at the boundary', () => {
    const store =
      createWorkbenchSessionController()

    store.createCanvas({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'One',
    })

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    store.activateCanvas('session-1')

    expect(
      store.getSnapshot().activeSessionId,
    ).toBe('session-1')

    store.closeCanvas('session-1')

    expect(
      store
        .getSnapshot()
        .tabs.some(
          (tab) =>
            tab.id === 'canvas:session-1',
        ),
    ).toBe(false)
  })
})
`,
  ],
  [
    'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
    String.raw`import {
  Boxes,
  ChartNoAxesCombined,
  FilePlus2,
  FileText,
  Files,
  Grid2X2,
  Image,
  Layers3,
  Network,
  Plus,
  Search,
  X,
} from 'lucide-react'
import {
  type ComponentType,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
} from 'react'

import type {
  WorkbenchTabId,
  WorkbenchTabViewModel,
} from '../../contracts/workbench-contract'

import './chrome-workbench-tabs.css'

export interface WorkbenchTabsProps {
  readonly tabs:
    readonly WorkbenchTabViewModel[]
  readonly onActivate: (
    tabId: WorkbenchTabId,
  ) => void
  readonly onClose: (
    tabId: WorkbenchTabId,
  ) => void
  readonly onMove: (
    tabId: WorkbenchTabId,
    targetIndex: number,
  ) => void
  readonly onCreate: () => void
}

type TabIcon = ComponentType<{
  readonly className?: string
  readonly 'aria-hidden'?:
    | boolean
    | 'true'
    | 'false'
}>

export function WorkbenchTabs({
  tabs,
  onActivate,
  onClose,
  onMove,
  onCreate,
}: WorkbenchTabsProps) {
  const scrollerRef =
    useRef<HTMLDivElement | null>(null)

  const tabRefs = useRef(
    new Map<
      WorkbenchTabId,
      HTMLButtonElement
    >(),
  )

  const draggedTabIdRef =
    useRef<WorkbenchTabId | null>(null)

  const activeTabId = tabs.find(
    (tab) => tab.isActive,
  )?.id

  useEffect(() => {
    const scroller = scrollerRef.current

    if (!scroller) {
      return
    }

    const updateDensity = () => {
      for (const tab of tabs) {
        const element =
          tabRefs.current.get(tab.id)

        if (!element) {
          continue
        }

        const root =
          element.closest<HTMLElement>(
            '.chrome-workbench-tab',
          )

        if (!root) {
          continue
        }

        const width = root.getBoundingClientRect().width

        root.dataset.size =
          width < 58
            ? 'mini'
            : width < 78
              ? 'smaller'
              : width < 104
                ? 'small'
                : 'normal'
      }
    }

    updateDensity()

    const observer =
      new ResizeObserver(updateDensity)

    observer.observe(scroller)

    return () => observer.disconnect()
  }, [tabs])

  useEffect(() => {
    if (!activeTabId) {
      return
    }

    tabRefs.current
      .get(activeTabId)
      ?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      })
  }, [activeTabId])

  function handleKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    tabId: WorkbenchTabId,
  ): void {
    const currentIndex = tabs.findIndex(
      (tab) => tab.id === tabId,
    )

    if (currentIndex < 0) {
      return
    }

    let targetIndex: number | null = null

    switch (event.key) {
      case 'ArrowLeft':
        targetIndex =
          (currentIndex - 1 + tabs.length) %
          tabs.length
        break

      case 'ArrowRight':
        targetIndex =
          (currentIndex + 1) % tabs.length
        break

      case 'Home':
        targetIndex = 0
        break

      case 'End':
        targetIndex = tabs.length - 1
        break

      case 'Delete': {
        const tab = tabs[currentIndex]

        if (tab?.canClose) {
          event.preventDefault()
          onClose(tab.id)
        }

        return
      }

      default:
        return
    }

    const target = tabs[targetIndex]

    if (!target) {
      return
    }

    event.preventDefault()
    onActivate(target.id)

    requestAnimationFrame(() => {
      tabRefs.current
        .get(target.id)
        ?.focus()
    })
  }

  function handleDragStart(
    event: DragEvent<HTMLElement>,
    tab: WorkbenchTabViewModel,
  ): void {
    if (!tab.canClose) {
      event.preventDefault()
      return
    }

    draggedTabIdRef.current = tab.id

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(
      'application/x-hybrid-canvas-workbench-tab',
      tab.id,
    )
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    targetIndex: number,
  ): void {
    event.preventDefault()

    const draggedTabId =
      draggedTabIdRef.current ??
      event.dataTransfer.getData(
        'application/x-hybrid-canvas-workbench-tab',
      )

    draggedTabIdRef.current = null

    if (draggedTabId) {
      onMove(draggedTabId, targetIndex)
    }
  }

  return (
    <div className="chrome-workbench-tabs">
      <div
        aria-label="工作台标签页"
        className="chrome-workbench-tabs__scroller"
        onWheel={(event) => {
          const scroller = scrollerRef.current

          if (
            !scroller ||
            Math.abs(event.deltaY) <=
              Math.abs(event.deltaX)
          ) {
            return
          }

          scroller.scrollLeft += event.deltaY
        }}
        ref={scrollerRef}
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const Icon = resolveTabIcon(tab)

          return (
            <article
              className="chrome-workbench-tab"
              data-active={
                tab.isActive ? 'true' : 'false'
              }
              data-size="normal"
              draggable={tab.canClose}
              key={tab.id}
              onDragEnd={() => {
                draggedTabIdRef.current = null
              }}
              onDragOver={(event) => {
                if (draggedTabIdRef.current) {
                  event.preventDefault()
                  event.dataTransfer.dropEffect =
                    'move'
                }
              }}
              onDragStart={(event) =>
                handleDragStart(event, tab)
              }
              onDrop={(event) =>
                handleDrop(event, index)
              }
              onMouseDown={(event) => {
                if (
                  event.button === 1 &&
                  tab.canClose
                ) {
                  event.preventDefault()
                  onClose(tab.id)
                }
              }}
            >
              <ChromeTabBackground />

              <span
                aria-hidden="true"
                className="chrome-workbench-tab__divider chrome-workbench-tab__divider--leading"
              />

              <span
                aria-hidden="true"
                className="chrome-workbench-tab__divider chrome-workbench-tab__divider--trailing"
              />

              <div className="chrome-workbench-tab__content">
                <button
                  aria-controls={
                    'workbench-panel-' +
                    encodeDomId(tab.id)
                  }
                  aria-selected={tab.isActive}
                  className="chrome-workbench-tab__activation"
                  id={
                    'workbench-tab-' +
                    encodeDomId(tab.id)
                  }
                  onClick={() =>
                    onActivate(tab.id)
                  }
                  onKeyDown={(event) =>
                    handleKeyboard(event, tab.id)
                  }
                  ref={(node) => {
                    if (node) {
                      tabRefs.current.set(
                        tab.id,
                        node,
                      )
                    } else {
                      tabRefs.current.delete(
                        tab.id,
                      )
                    }
                  }}
                  role="tab"
                  tabIndex={
                    tab.isActive ? 0 : -1
                  }
                  title={tab.title}
                  type="button"
                >
                  <Icon
                    aria-hidden="true"
                    className="chrome-workbench-tab__icon"
                  />

                  <span className="chrome-workbench-tab__title">
                    {tab.title}
                  </span>
                </button>

                <TabEndAction
                  model={tab}
                  onClose={onClose}
                />
              </div>
            </article>
          )
        })}

        <button
          aria-label="新建画板"
          className="chrome-workbench-tabs__new-tab"
          onClick={onCreate}
          type="button"
        >
          <Plus
            aria-hidden="true"
            className="size-5"
          />
        </button>

        <div
          aria-hidden="true"
          className="chrome-workbench-tabs__drag-region"
          data-tauri-drag-region
        />
      </div>

      <div
        aria-hidden="true"
        className="chrome-workbench-tabs__bottom-bar"
      />
    </div>
  )
}

function ChromeTabBackground() {
  return (
    <div
      aria-hidden="true"
      className="chrome-workbench-tab__background"
    >
      <svg
        className="chrome-workbench-tab__background-left"
        preserveAspectRatio="none"
        viewBox="0 0 214 36"
      >
        <path d="M17 0h197v36H0v-2c4.5 0 9-3.5 9-8V8c0-4.5 3.5-8 8-8z" />
      </svg>

      <svg
        className="chrome-workbench-tab__background-right"
        preserveAspectRatio="none"
        viewBox="0 0 214 36"
      >
        <path d="M17 0h197v36H0v-2c4.5 0 9-3.5 9-8V8c0-4.5 3.5-8 8-8z" />
      </svg>
    </div>
  )
}

function TabEndAction({
  model,
  onClose,
}: {
  readonly model: WorkbenchTabViewModel
  readonly onClose: (
    tabId: WorkbenchTabId,
  ) => void
}) {
  if (!model.canClose) {
    return null
  }

  const status =
    model.kind === 'canvas'
      ? model.status
      : undefined

  return (
    <div className="chrome-workbench-tab__end">
      {status &&
      status !== 'clean' ? (
        <span
          aria-label={
            status === 'dirty'
              ? '未保存'
              : status === 'saving'
                ? '正在保存'
                : '保存失败'
          }
          className={
            'chrome-workbench-tab__status ' +
            'chrome-workbench-tab__status--' +
            status
          }
        />
      ) : null}

      <button
        aria-label={'关闭 ' + model.title}
        className="chrome-workbench-tab__close"
        onClick={(event) => {
          event.stopPropagation()
          onClose(model.id)
        }}
        tabIndex={-1}
        type="button"
      >
        <X
          aria-hidden="true"
          className="size-3.5"
        />
      </button>
    </div>
  )
}

function resolveTabIcon(
  model: WorkbenchTabViewModel,
): TabIcon {
  if (model.kind === 'start') {
    return FilePlus2
  }

  if (model.kind === 'canvas') {
    return FileText
  }

  switch (model.surfaceId) {
    case 'pages':
      return Grid2X2
    case 'documents':
      return Files
    case 'search':
      return Search
    case 'layers':
      return Layers3
    case 'relations':
      return Network
    case 'data':
      return ChartNoAxesCombined
    case 'assets':
      return Image
    case 'extensions':
      return Boxes
  }
}

function encodeDomId(
  value: string,
): string {
  return value.replaceAll(
    /[^a-zA-Z0-9_-]/g,
    '-',
  )
}
`,
  ],
  [
    'features/workspace/src/presentation/shell/chrome-workbench-tabs.css',
    String.raw`/*
 * Chrome-style workbench tabs.
 *
 * Geometry adapted from adamschwartz/chrome-tabs (MIT):
 * https://github.com/adamschwartz/chrome-tabs
 *
 * Interaction/state remains owned by WorkbenchSessionStore.
 */

.chrome-workbench-tabs,
.chrome-workbench-tabs * {
  box-sizing: border-box;
}

.chrome-workbench-tabs {
  --chrome-tab-height: 36px;
  --chrome-tab-margin: 9px;
  --chrome-tab-max-width: 240px;
  --chrome-tab-min-width: 48px;
  --chrome-tab-strip: var(--color-chrome);
  --chrome-tab-active: var(--color-background);
  --chrome-tab-hover: color-mix(
    in srgb,
    var(--color-background) 54%,
    transparent
  );
  --chrome-tab-divider: color-mix(
    in srgb,
    var(--color-foreground) 22%,
    transparent
  );

  position: relative;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--chrome-tab-strip);
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  font-size: 12px;
}

.chrome-workbench-tabs__scroller {
  position: relative;
  display: flex;
  align-items: end;
  width: 100%;
  height: 100%;
  min-width: 0;
  padding: 5px 3px 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.chrome-workbench-tabs__scroller::-webkit-scrollbar {
  display: none;
}

.chrome-workbench-tabs__drag-region {
  min-width: 24px;
  height: 100%;
  flex: 1 1 auto;
}

.chrome-workbench-tab {
  position: relative;
  z-index: 1;
  height: var(--chrome-tab-height);
  min-width: var(--chrome-tab-min-width);
  max-width: var(--chrome-tab-max-width);
  flex: 1 1 var(--chrome-tab-max-width);
  margin-left: -1px;
  user-select: none;
  isolation: isolate;
}

.chrome-workbench-tab:first-child {
  margin-left: 0;
}

.chrome-workbench-tab[data-active="true"] {
  z-index: 5;
}

.chrome-workbench-tab:hover:not(
    [data-active="true"]
  ) {
  z-index: 2;
}

.chrome-workbench-tab__background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease-out;
}

.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__background,
.chrome-workbench-tab:hover
  .chrome-workbench-tab__background {
  opacity: 1;
}

.chrome-workbench-tab__background-left,
.chrome-workbench-tab__background-right {
  position: absolute;
  top: 0;
  width: 52%;
  height: 100%;
  fill: var(--chrome-tab-hover);
}

.chrome-workbench-tab__background-left {
  left: 0;
}

.chrome-workbench-tab__background-right {
  right: 0;
  transform: scaleX(-1);
}

.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__background-left,
.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__background-right {
  fill: var(--chrome-tab-active);
}

.chrome-workbench-tab__content {
  position: absolute;
  inset: 0 var(--chrome-tab-margin);
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
}

.chrome-workbench-tab__activation {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  flex: 1 1 auto;
  gap: 8px;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--color-muted-foreground);
  background: transparent;
  text-align: left;
  cursor: default;
}

.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__activation {
  color: var(--color-foreground);
}

.chrome-workbench-tab__activation:focus-visible {
  border-radius: 7px;
  outline: 2px solid var(--color-primary);
  outline-offset: -3px;
}

.chrome-workbench-tab__icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  stroke-width: 1.7;
}

.chrome-workbench-tab__title {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 16px;
  mask-image: linear-gradient(
    90deg,
    #000 0%,
    #000 calc(100% - 16px),
    transparent
  );
}

.chrome-workbench-tab__end {
  position: relative;
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  place-items: center;
}

.chrome-workbench-tab__close {
  position: absolute;
  inset: 2px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: currentColor;
  background: transparent;
  opacity: 0.8;
}

.chrome-workbench-tab__close:hover {
  background: color-mix(
    in srgb,
    var(--color-foreground) 12%,
    transparent
  );
  opacity: 1;
}

.chrome-workbench-tab__close:active {
  background: color-mix(
    in srgb,
    var(--color-foreground) 20%,
    transparent
  );
}

.chrome-workbench-tab__close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.chrome-workbench-tab__status {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.chrome-workbench-tab__status--dirty {
  background: #d5803b;
}

.chrome-workbench-tab__status--saving {
  background: #2783de;
  animation: chrome-workbench-saving 900ms
    ease-in-out infinite alternate;
}

.chrome-workbench-tab__status--failed {
  background: #e56458;
}

.chrome-workbench-tab__status
  + .chrome-workbench-tab__close {
  opacity: 0;
}

.chrome-workbench-tab:hover
  .chrome-workbench-tab__status,
.chrome-workbench-tab[data-active="true"]:hover
  .chrome-workbench-tab__status {
  opacity: 0;
}

.chrome-workbench-tab:hover
  .chrome-workbench-tab__status
  + .chrome-workbench-tab__close,
.chrome-workbench-tab[data-active="true"]:hover
  .chrome-workbench-tab__status
  + .chrome-workbench-tab__close {
  opacity: 1;
}

.chrome-workbench-tab__divider {
  position: absolute;
  z-index: -1;
  top: 9px;
  bottom: 9px;
  width: 1px;
  background: var(--chrome-tab-divider);
  transition: opacity 120ms ease-out;
}

.chrome-workbench-tab__divider--leading {
  left: var(--chrome-tab-margin);
}

.chrome-workbench-tab__divider--trailing {
  right: var(--chrome-tab-margin);
}

.chrome-workbench-tab:first-child
  .chrome-workbench-tab__divider--leading,
.chrome-workbench-tab:last-of-type
  .chrome-workbench-tab__divider--trailing,
.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__divider,
.chrome-workbench-tab:hover
  .chrome-workbench-tab__divider,
.chrome-workbench-tab:has(
    + .chrome-workbench-tab[data-active="true"]
  )
  .chrome-workbench-tab__divider--trailing,
.chrome-workbench-tab:has(
    + .chrome-workbench-tab:hover
  )
  .chrome-workbench-tab__divider--trailing {
  opacity: 0;
}

.chrome-workbench-tab[data-size="small"]
  .chrome-workbench-tab__content {
  padding-inline: 5px;
}

.chrome-workbench-tab[data-size="small"]
  .chrome-workbench-tab__activation {
  gap: 5px;
}

.chrome-workbench-tab[data-size="smaller"]
  .chrome-workbench-tab__title,
.chrome-workbench-tab[data-size="mini"]
  .chrome-workbench-tab__title {
  display: none;
}

.chrome-workbench-tab[data-size="smaller"]
  .chrome-workbench-tab__activation {
  justify-content: center;
}

.chrome-workbench-tab[data-size="mini"]
  .chrome-workbench-tab__icon {
  display: none;
}

.chrome-workbench-tab[data-size="mini"]
  .chrome-workbench-tab__end {
  margin: auto;
}

.chrome-workbench-tab[data-size="mini"]:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__close {
  display: none;
}

.chrome-workbench-tabs__new-tab {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  margin-left: 3px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--color-muted-foreground);
  background: transparent;
}

.chrome-workbench-tabs__new-tab:hover {
  color: var(--color-foreground);
  background: color-mix(
    in srgb,
    var(--color-foreground) 9%,
    transparent
  );
}

.chrome-workbench-tabs__new-tab:active {
  background: color-mix(
    in srgb,
    var(--color-foreground) 15%,
    transparent
  );
}

.chrome-workbench-tabs__new-tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -3px;
}

.chrome-workbench-tabs__bottom-bar {
  position: absolute;
  z-index: 10;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: var(--chrome-tab-active);
  pointer-events: none;
}

@keyframes chrome-workbench-saving {
  from {
    opacity: 0.4;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chrome-workbench-tab__background,
  .chrome-workbench-tab__divider,
  .chrome-workbench-tab__status {
    transition: none;
    animation: none;
  }
}
`,
  ],
  [
    'features/workspace/src/presentation/public-api.ts',
    String.raw`export type {
  WorkspaceShellProps,
} from '../contracts/shell-contract'

export {
  CommandPalette,
  type CommandPaletteProps,
} from './commands/CommandPalette'

export {
  CommandProvider,
  type CommandProviderProps,
  useCommands,
} from './commands/CommandProvider'

export {
  NoCanvasSurface,
} from './empty/NoCanvasSurface'

export {
  InspectorHost,
} from './inspector/InspectorHost'

export {
  ActivityRail,
} from './shell/ActivityRail'

export {
  WorkbenchTabs,
  type WorkbenchTabsProps,
} from './shell/WorkbenchTabs'

export {
  WorkspaceShell,
} from './shell/WorkspaceShell'

export {
  WorkspaceSurface,
  type WorkspaceSurfaceProps,
} from './shell/WorkspaceSurface'

export {
  WorkspaceSidebar,
} from './shell/WorkspaceSidebar'

export {
  StatusBarHost,
} from './status/StatusBarHost'
`,
  ],
])

const deletions = [
  'features/workspace/src/presentation/shell/CanvasTabs.tsx',
  'features/workspace/src/presentation/shell/DocumentTabs.tsx',
]

if (!apply) {
  printPlan()
  process.exit(0)
}

mkdirSync(backupRoot, { recursive: true })

for (const relativePath of replacements.keys()) {
  backup(relativePath)
}

for (const relativePath of deletions) {
  backup(relativePath)
}

backup('features/workspace/package.json')
backup('features/workspace/src/presentation/shell/WorkspaceShell.tsx')
backup('apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx')
backup('tests/architecture/check.mjs')

for (const [relativePath, content] of replacements) {
  atomicWrite(relativePath, content)
  console.log('WRITE  ' + relativePath)
}

for (const relativePath of deletions) {
  const absolutePath = join(root, relativePath)

  if (existsSync(absolutePath)) {
    rmSync(absolutePath)
    console.log('DELETE ' + relativePath)
  }
}

patchWorkspacePackage()
patchWorkspaceShell()
patchWorkspaceContainer()
patchArchitectureCheck()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log('Chrome Workbench Tabs 全量替换完成。')
console.log('备份目录：' + backupRoot)

function patchWorkspacePackage() {
  const path = 'features/workspace/package.json'
  const absolutePath = join(root, path)
  const manifest = JSON.parse(
    readFileSync(absolutePath, 'utf8'),
  )

  manifest.sideEffects = ['**/*.css']

  atomicWrite(
    path,
    JSON.stringify(manifest, null, 2),
  )

  console.log('PATCH  ' + path)
}

function patchWorkspaceShell() {
  const path =
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx'

  let source = read(path)

  source = replaceRequired(
    source,
    /onCloseTab:\s*actions\.closeTab,\s*onCreateCanvas:/,
    [
      'onCloseTab: actions.closeTab,',
      '        onMoveTab: actions.moveTab,',
      '        onCreateCanvas:',
    ].join('\n'),
    path,
  )

  atomicWrite(path, source)
  console.log('PATCH  ' + path)
}

function patchWorkspaceContainer() {
  const path =
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

  let source = read(path)

  source = replaceRequired(
    source,
    /closeTab:\s*handleCloseTab,\s*openWorkspaceSurface/,
    [
      'closeTab: handleCloseTab,',
      '',
      '      moveTab(tabId, targetIndex) {',
      '        port.workspace.moveTab(',
      '          tabId,',
      '          targetIndex,',
      '        )',
      '      },',
      '',
      '      openWorkspaceSurface',
    ].join('\n'),
    path,
  )

  source = replaceRequired(
    source,
    /onCloseTab,\s*onCreateCanvas,/,
    [
      'onCloseTab,',
      '        onMoveTab,',
      '        onCreateCanvas,',
    ].join('\n'),
    path,
  )

  source = replaceRequired(
    source,
    /onClose=\{onCloseTab\}\s*onCreate=\{onCreateCanvas\}/,
    [
      'onClose={onCloseTab}',
      '            onMove={onMoveTab}',
      '            onCreate={onCreateCanvas}',
    ].join('\n'),
    path,
  )

  atomicWrite(path, source)
  console.log('PATCH  ' + path)
}

function patchArchitectureCheck() {
  const path = 'tests/architecture/check.mjs'
  let source = read(path)

  const start =
    source.indexOf(
      'function validateExtensionImport(',
    )

  const end =
    source.indexOf(
      'function findMatchingScaffold(',
      start,
    )

  if (start < 0 || end < 0) {
    throw new Error(
      path +
        ': 找不到 validateExtensionImport 函数边界',
    )
  }

  const replacement = String.raw`function validateExtensionImport(rel, text) {
  if (
    rel.startsWith('editor/core/') ||
    !/\bHybridCanvasExtension\b/.test(text)
  ) {
    return
  }

  const namedImportPattern =
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g

  let foundExtensionImport = false

  for (const match of text.matchAll(namedImportPattern)) {
    const bindings = match[1] ?? ''
    const source = match[2] ?? ''

    if (!/\bHybridCanvasExtension\b/.test(bindings)) {
      continue
    }

    foundExtensionImport = true

    if (
      source !==
      '@hybrid-canvas/canvas/extensions'
    ) {
      addViolation(
        rel +
          ': HybridCanvasExtension 必须从 ' +
          '@hybrid-canvas/canvas/extensions 导入',
      )
    }
  }

  if (!foundExtensionImport) {
    addViolation(
      rel +
        ': 无法确定 HybridCanvasExtension 的导入来源',
    )
  }
}

`

  source =
    source.slice(0, start) +
    replacement +
    source.slice(end)

  atomicWrite(path, source)
  console.log('PATCH  ' + path)
}

function runChecks() {
  const formattedFiles = [
    ...replacements.keys(),
    'features/workspace/package.json',
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
    'tests/architecture/check.mjs',
  ]

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    ...formattedFiles,
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'typecheck',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'test',
  ])

  run('pnpm', ['test:architecture'])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/desktop',
    'typecheck',
  ])

  run('pnpm', ['lint'])
}

function printPlan() {
  console.log('Chrome Workbench Tabs 全量替换计划：')

  for (const path of replacements.keys()) {
    console.log('WRITE  ' + path)
  }

  for (const path of deletions) {
    console.log('DELETE ' + path)
  }

  console.log(
    'PATCH  features/workspace/package.json',
  )
  console.log(
    'PATCH  features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  )
  console.log(
    'PATCH  apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  )
  console.log(
    'PATCH  tests/architecture/check.mjs',
  )
  console.log('')
  console.log(
    '确认后使用 --apply 执行。',
  )
}

function assertRepository() {
  const packagePath = join(root, 'package.json')

  if (!existsSync(packagePath)) {
    throw new Error(
      '请在 hybrid-canvas 仓库根目录执行脚本。',
    )
  }

  const manifest = JSON.parse(
    readFileSync(packagePath, 'utf8'),
  )

  if (manifest.name !== 'hybrid-canvas') {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库。',
    )
  }

  const required = [
    'features/workspace/src/contracts/workbench-contract.ts',
    'features/workspace/src/application/session/workbench-session-controller.ts',
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
    'tests/architecture/check.mjs',
  ]

  for (const path of required) {
    if (!existsSync(join(root, path))) {
      throw new Error(
        '缺少重构前置文件：' + path,
      )
    }
  }
}

function backup(relativePath) {
  const source = join(root, relativePath)

  if (!existsSync(source)) {
    return
  }

  const destination =
    join(backupRoot, relativePath)

  mkdirSync(dirname(destination), {
    recursive: true,
  })

  cpSync(source, destination, {
    recursive: true,
  })
}

function read(relativePath) {
  return readFileSync(
    join(root, relativePath),
    'utf8',
  )
}

function atomicWrite(relativePath, content) {
  const destination = join(root, relativePath)
  const temporary =
    destination +
    '.tmp-' +
    process.pid +
    '-' +
    Date.now()

  mkdirSync(dirname(destination), {
    recursive: true,
  })

  writeFileSync(
    temporary,
    normalize(content),
    'utf8',
  )

  renameSync(temporary, destination)
}

function replaceRequired(
  source,
  pattern,
  replacement,
  path,
) {
  if (!pattern.test(source)) {
    throw new Error(
      path +
        ': 找不到预期集成点，拒绝静默生成半成品。',
    )
  }

  return source.replace(pattern, replacement)
}

function normalize(content) {
  return content
    .replaceAll('\r\n', '\n')
    .trimStart() + '\n'
}

function run(command, args) {
  console.log('')
  console.log(
    'RUN    ' +
      command +
      ' ' +
      args.join(' '),
  )

  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}