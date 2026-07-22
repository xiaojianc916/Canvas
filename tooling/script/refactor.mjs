#!/usr/bin/env node

/**
 * Workbench 通用标签页架构重构脚本
 *
 * 用法：
 *   node scripts/refactor-workbench-tabs.mjs
 *
 * 可选：
 *   node scripts/refactor-workbench-tabs.mjs --skip-checks
 *
 * 设计目标：
 * - “新标签页”、画布文档、素材、关系、搜索等统一为 Workbench Surface。
 * - 标签页只负责承载 Surface，不再与 .draw 文档强耦合。
 * - 画布生命周期仍由 CanvasDocumentService / EditorSession 负责。
 * - WorkbenchSessionStore 是 UI 标签与激活 Surface 的唯一事实来源。
 * - 删除 CanvasTabs / DocumentTabs 两套重复实现。
 * - 标签激活、关闭、去重、相邻标签选择统一由 Controller 管理。
 * - 支持键盘导航、ARIA tab 语义和 roving tabindex。
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const skipChecks = process.argv.includes('--skip-checks')

const files = new Map([
  [
    'features/workspace/src/contracts/workbench-contract.ts',
    String.raw`export type CanvasId = string
export type CanvasSessionId = string
export type WorkbenchTabId = string

export type CanvasTabStatus = 'clean' | 'dirty' | 'saving' | 'failed'

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
  readonly openWorkspaceSurface: (request: OpenWorkspaceSurfaceRequest) => void
  readonly activateTab: (tabId: WorkbenchTabId) => void
  readonly closeTab: (tabId: WorkbenchTabId) => void

  /**
   * Canvas workflow compatibility boundary.
   * Document services identify sessions by CanvasSessionId, while the
   * workbench itself is driven exclusively by WorkbenchTabId.
   */
  readonly activateCanvas: (sessionId: CanvasSessionId) => void
  readonly closeCanvas: (sessionId: CanvasSessionId) => void
}

export interface WorkbenchSessionStore extends WorkbenchSessionCommands {
  readonly getSnapshot: () => WorkbenchViewModel
  readonly subscribe: (listener: () => void) => () => void
}

export const START_TAB_ID: WorkbenchTabId = 'workbench:start'

const START_TAB: StartTabViewModel = Object.freeze({
  id: START_TAB_ID,
  kind: 'start',
  title: '新标签页',
  isActive: true,
  canClose: false,
})

const START_SURFACE: StartSurfaceViewModel = Object.freeze({
  kind: 'start',
  tabId: START_TAB_ID,
})

export const EMPTY_WORKBENCH_VIEW_MODEL: WorkbenchViewModel = Object.freeze({
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
    'features/workspace/src/application/session/workbench-session-controller.ts',
    String.raw`import type {
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
import {
  EMPTY_WORKBENCH_VIEW_MODEL,
  START_TAB_ID,
} from '../../contracts/public-api'

export function createWorkbenchSessionController(): WorkbenchSessionStore {
  let snapshot = EMPTY_WORKBENCH_VIEW_MODEL
  const listeners = new Set<() => void>()
  const surfaces = new Map<WorkbenchTabId, WorkbenchSurfaceViewModel>([
    [START_TAB_ID, EMPTY_WORKBENCH_VIEW_MODEL.activeSurface],
  ])

  function publish(
    tabs: readonly WorkbenchTabViewModel[],
    activeTabId: WorkbenchTabId,
  ): void {
    const activeSurface = surfaces.get(activeTabId)

    if (!activeSurface) {
      throw new Error('WORKBENCH_SURFACE_NOT_FOUND')
    }

    const normalizedTabs = tabs.map((tab) => ({
      ...tab,
      isActive: tab.id === activeTabId,
    }))

    const activeCanvas =
      activeSurface.kind === 'canvas' ? activeSurface : null

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

  function openWorkspaceSurface(
    request: OpenWorkspaceSurfaceRequest,
  ): void {
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

    const adjacentIndex = Math.min(
      closingIndex,
      remainingTabs.length - 1,
    )

    const nextTab =
      remainingTabs[adjacentIndex] ??
      remainingTabs[adjacentIndex - 1] ??
      remainingTabs[0]

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
    (tab): tab is CanvasTabViewModel =>
      tab.kind === 'canvas' && tab.sessionId === sessionId,
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

  if (
    activeTabs.length !== 1 ||
    activeTabs[0]?.id !== snapshot.activeTabId
  ) {
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

  if (
    snapshot.activeCanvas !== null ||
    snapshot.activeSessionId !== null
  ) {
    throw new Error('WORKBENCH_NON_CANVAS_SESSION_INCONSISTENT')
  }
}
`,
  ],
  [
    'features/workspace/src/application/session/workbench-session-controller.test.ts',
    String.raw`import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkbenchSessionController } from './workbench-session-controller'

beforeEach(() => {
  let id = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => 'generated-' + String(++id),
  })
})

describe('workbench session controller', () => {
  it('starts with a permanent 新标签页 surface', () => {
    const store = createWorkbenchSessionController()
    const snapshot = store.getSnapshot()

    expect(snapshot.activeSurface).toEqual({
      kind: 'start',
      tabId: 'workbench:start',
    })

    expect(snapshot.tabs).toEqual([
      {
        id: 'workbench:start',
        kind: 'start',
        title: '新标签页',
        isActive: true,
        canClose: false,
      },
    ])
  })

  it('drives canvas and workspace surfaces through one tab model', () => {
    const store = createWorkbenchSessionController()

    store.createCanvas({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'One.draw',
    })

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    expect(store.getSnapshot().tabs).toMatchObject([
      { id: 'workbench:start', kind: 'start' },
      {
        id: 'canvas:session-1',
        kind: 'canvas',
        sessionId: 'session-1',
      },
      {
        id: 'workspace:assets',
        kind: 'workspace',
        surfaceId: 'assets',
        isActive: true,
      },
    ])
  })

  it('deduplicates singleton workspace surfaces', () => {
    const store = createWorkbenchSessionController()

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
        .tabs.filter((tab) => tab.id === 'workspace:relations'),
    ).toHaveLength(1)
  })

  it('activates the adjacent tab after closing the active tab', () => {
    const store = createWorkbenchSessionController()

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    store.openWorkspaceSurface({
      surfaceId: 'relations',
      title: '关系',
    })

    store.closeTab('workspace:relations')

    expect(store.getSnapshot().activeTabId).toBe('workspace:assets')
  })

  it('does not close the permanent start tab', () => {
    const store = createWorkbenchSessionController()

    store.closeTab('workbench:start')

    expect(store.getSnapshot().tabs).toHaveLength(1)
    expect(store.getSnapshot().activeTabId).toBe('workbench:start')
  })

  it('keeps canvas compatibility commands at the document boundary', () => {
    const store = createWorkbenchSessionController()

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

    expect(store.getSnapshot().activeSessionId).toBe('session-1')

    store.closeCanvas('session-1')

    expect(
      store
        .getSnapshot()
        .tabs.some((tab) => tab.id === 'canvas:session-1'),
    ).toBe(false)
  })
})
`,
  ],
  [
    'features/workspace/src/contracts/shell-contract.ts',
    String.raw`import type { ReactNode } from 'react'

import type {
  CanvasSessionId,
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
  readonly activateTab: (tabId: WorkbenchTabId) => void
  readonly closeTab: (tabId: WorkbenchTabId) => void
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
  readonly onActivateTab: (tabId: WorkbenchTabId) => void
  readonly onCloseTab: (tabId: WorkbenchTabId) => void
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

/**
 * Kept here because the canvas/document boundary still uses session IDs.
 * Workbench chrome must use WorkbenchTabId instead.
 */
export type WorkspaceCanvasSessionId = CanvasSessionId
`,
  ],
  [
    'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
    String.raw`import { Button, cn } from '@hybrid-canvas/design-system'
import {
  Boxes,
  FilePlus2,
  FileText,
  Image,
  Network,
  Plus,
  Search,
  Workflow,
  X,
} from 'lucide-react'
import {
  type ComponentType,
  type KeyboardEvent,
  useEffect,
  useRef,
} from 'react'

import type {
  WorkbenchTabId,
  WorkbenchTabViewModel,
} from '../../contracts/workbench-contract'

export interface WorkbenchTabsProps {
  readonly tabs: readonly WorkbenchTabViewModel[]
  readonly onActivate: (tabId: WorkbenchTabId) => void
  readonly onClose: (tabId: WorkbenchTabId) => void
  readonly onCreate: () => void
}

type TabIcon = ComponentType<{
  readonly className?: string
  readonly 'aria-hidden'?: boolean | 'true' | 'false'
}>

export function WorkbenchTabs({
  tabs,
  onActivate,
  onClose,
  onCreate,
}: WorkbenchTabsProps) {
  const tabRefs = useRef(new Map<WorkbenchTabId, HTMLButtonElement>())

  const activeTabId = tabs.find((tab) => tab.isActive)?.id

  useEffect(() => {
    if (!activeTabId) {
      return
    }

    tabRefs.current
      .get(activeTabId)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    tabId: WorkbenchTabId,
  ): void {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId)

    if (currentIndex < 0) {
      return
    }

    let nextIndex = currentIndex

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
        break
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = tabs.length - 1
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

    const nextTab = tabs[nextIndex]

    if (!nextTab) {
      return
    }

    event.preventDefault()
    onActivate(nextTab.id)
    tabRefs.current.get(nextTab.id)?.focus()
  }

  return (
    <div className="flex h-full min-w-0 flex-1 bg-chrome">
      <div
        aria-label="工作台标签页"
        className="flex h-full min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden px-3"
        role="tablist"
      >
        {tabs.map((tab) => {
          const Icon = resolveTabIcon(tab)

          return (
            <div
              className={cn(
                'group relative flex h-[calc(100%-5px)] w-52 shrink-0 items-center',
                'border-r border-divider/70',
                tab.isActive
                  ? 'rounded-t-lg border-x border-t border-divider bg-background'
                  : 'bg-transparent hover:bg-foreground/5',
              )}
              key={tab.id}
            >
              <button
                aria-controls={'workbench-panel-' + encodeDomId(tab.id)}
                aria-selected={tab.isActive}
                className={cn(
                  'flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-xs',
                  'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                  tab.isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                id={'workbench-tab-' + encodeDomId(tab.id)}
                onClick={() => onActivate(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                ref={(node) => {
                  if (node) {
                    tabRefs.current.set(tab.id, node)
                  } else {
                    tabRefs.current.delete(tab.id)
                  }
                }}
                role="tab"
                tabIndex={tab.isActive ? 0 : -1}
                type="button"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {tab.title}
                </span>
                <TabStatus model={tab} />
              </button>

              {tab.canClose ? (
                <Button
                  aria-label={'关闭 ' + tab.title}
                  className={cn(
                    'mr-1 size-7 shrink-0 rounded-md',
                    'text-muted-foreground opacity-0',
                    'hover:bg-foreground/10 hover:text-foreground',
                    'focus-visible:opacity-100 group-hover:opacity-100',
                    tab.isActive && 'opacity-100',
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose(tab.id)
                  }}
                  size="icon"
                  tabIndex={-1}
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Button>
              ) : null}
            </div>
          )
        })}

        <div className="flex h-full shrink-0 items-center px-2">
          <Button
            aria-label="新建画板"
            className="size-8 rounded-full"
            onClick={onCreate}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function TabStatus({
  model,
}: {
  readonly model: WorkbenchTabViewModel
}) {
  if (model.kind !== 'canvas' || !model.status || model.status === 'clean') {
    return null
  }

  const label = {
    dirty: '未保存',
    saving: '正在保存',
    failed: '保存失败',
  }[model.status]

  return (
    <span
      aria-label={label}
      className={cn(
        'size-2 shrink-0 rounded-full',
        model.status === 'dirty' && 'bg-amber-500',
        model.status === 'saving' && 'animate-pulse bg-sky-500',
        model.status === 'failed' && 'bg-destructive',
      )}
    />
  )
}

function resolveTabIcon(model: WorkbenchTabViewModel): TabIcon {
  if (model.kind === 'start') {
    return FilePlus2
  }

  if (model.kind === 'canvas') {
    return FileText
  }

  switch (model.surfaceId) {
    case 'assets':
      return Image
    case 'relations':
      return Network
    case 'search':
      return Search
    case 'extensions':
      return Boxes
    case 'data':
      return Workflow
    default:
      return FileText
  }
}

function encodeDomId(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '-')
}
`,
  ],
  [
    'features/workspace/src/presentation/shell/WorkspaceSurface.tsx',
    String.raw`import {
  Boxes,
  ChartNoAxesCombined,
  Files,
  Grid2X2,
  Image,
  Layers3,
  Network,
  Search,
} from 'lucide-react'
import type { ComponentType } from 'react'

import type { WorkspaceSurfaceId } from '../../contracts/workbench-contract'

interface WorkspaceSurfaceDefinition {
  readonly title: string
  readonly description: string
  readonly icon: ComponentType<{ readonly className?: string }>
}

const SURFACES: Record<WorkspaceSurfaceId, WorkspaceSurfaceDefinition> = {
  pages: {
    title: '画布',
    description: '浏览当前文档中的画布页面。',
    icon: Grid2X2,
  },
  search: {
    title: '搜索',
    description: '搜索工作区中的画布、对象和文本内容。',
    icon: Search,
  },
  layers: {
    title: '图层',
    description: '浏览、选择和组织当前画布中的对象层级。',
    icon: Layers3,
  },
  relations: {
    title: '关系',
    description: '查看并维护画布内容之间的结构化关系。',
    icon: Network,
  },
  assets: {
    title: '素材',
    description: '统一管理图片、附件和可复用素材。',
    icon: Image,
  },
  extensions: {
    title: '插件',
    description: '管理为编辑器提供能力的扩展。',
    icon: Boxes,
  },
  data: {
    title: '自动化',
    description: '创建和管理可执行的画布自动化流程。',
    icon: ChartNoAxesCombined,
  },
  documents: {
    title: '恢复',
    description: '恢复最近打开的画板和本地文件。',
    icon: Files,
  },
}

export interface WorkspaceSurfaceProps {
  readonly surfaceId: WorkspaceSurfaceId
}

export function WorkspaceSurface({
  surfaceId,
}: WorkspaceSurfaceProps) {
  const definition = SURFACES[surfaceId]
  const Icon = definition.icon

  return (
    <section
      aria-labelledby={'workspace-surface-title-' + surfaceId}
      className="relative grid h-full place-items-center overflow-hidden bg-canvas px-8"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(var(--color-divider)_0.7px,transparent_0.7px)] bg-size-[18px_18px] opacity-35"
      />

      <div className="relative max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl border border-divider bg-background shadow-sm">
          <Icon className="size-5 text-muted-foreground" />
        </div>

        <h1
          className="mt-4 text-base font-semibold tracking-tight"
          id={'workspace-surface-title-' + surfaceId}
        >
          {definition.title}
        </h1>

        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {definition.description}
        </p>
      </div>
    </section>
  )
}
`,
  ],
  [
    'features/workspace/src/presentation/public-api.ts',
    String.raw`export type { WorkspaceShellProps } from '../contracts/shell-contract'

export {
  CommandPalette,
  type CommandPaletteProps,
} from './commands/CommandPalette'

export {
  CommandProvider,
  type CommandProviderProps,
  useCommands,
} from './commands/CommandProvider'

export { NoCanvasSurface } from './empty/NoCanvasSurface'
export { InspectorHost } from './inspector/InspectorHost'
export { ActivityRail } from './shell/ActivityRail'
export {
  WorkbenchTabs,
  type WorkbenchTabsProps,
} from './shell/WorkbenchTabs'
export { WorkspaceShell } from './shell/WorkspaceShell'
export {
  WorkspaceSurface,
  type WorkspaceSurfaceProps,
} from './shell/WorkspaceSurface'
export { WorkspaceSidebar } from './shell/WorkspaceSidebar'
export { StatusBarHost } from './status/StatusBarHost'
`,
  ],
  [
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
    String.raw`import {
  Button,
  TooltipProvider,
} from '@hybrid-canvas/design-system'
import {
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { WorkspaceShellProps } from '../../contracts/shell-contract'
import type { WorkspaceSurfaceId } from '../../contracts/workbench-contract'
import { InspectorHost } from '../inspector/InspectorHost'
import { StatusBarHost } from '../status/StatusBarHost'
import { ActivityRail } from './ActivityRail'
import { SidebarSplitter } from './SidebarSplitter'
import { useWorkspaceLayoutMode } from './useWorkspaceLayout'
import { WorkspaceFrame } from './WorkspaceFrame'
import { WorkspaceSidebar } from './WorkspaceSidebar'

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 420
const SIDEBAR_DEFAULT = 280

const SURFACE_TITLES: Record<WorkspaceSurfaceId, string> = {
  pages: '画布',
  documents: '恢复',
  search: '搜索',
  layers: '图层',
  relations: '关系',
  data: '自动化',
  assets: '素材',
  extensions: '插件',
}

export function WorkspaceShell({
  model,
  actions,
  pages,
  renderChrome,
  mainContent,
  inspector,
  statusLeft,
  statusRight,
  assistantOverlay,
  overlays,
}: WorkspaceShellProps) {
  const mode = useWorkspaceLayoutMode()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const previousModeRef = useRef(mode)

  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [isInspectorOpen, setInspectorOpen] = useState(mode === 'wide')
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [isResizing, setResizing] = useState(false)

  const activeNavigationItem: WorkspaceSurfaceId =
    model.activeSurface.kind === 'workspace'
      ? model.activeSurface.surfaceId
      : 'pages'

  const hasCanvas = model.activeSurface.kind === 'canvas'
  const dockSidebar = mode !== 'narrow' && isSidebarOpen
  const dockInspector =
    mode === 'wide' && isInspectorOpen && hasCanvas

  useEffect(() => {
    const previousMode = previousModeRef.current

    if (previousMode === mode) {
      return
    }

    previousModeRef.current = mode

    if (mode === 'compact') {
      setInspectorOpen(false)
    }

    if (mode === 'narrow') {
      setSidebarOpen(false)
      setInspectorOpen(false)
    }
  }, [mode])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isResizing || !rootRef.current) {
        return
      }

      const rectangle = rootRef.current.getBoundingClientRect()
      const style = window.getComputedStyle(rootRef.current)
      const railWidth =
        Number.parseFloat(
          style.getPropertyValue('--activity-rail-width'),
        ) || 48

      const width = event.clientX - rectangle.left - railWidth

      setSidebarWidth(
        Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, width)),
      )
    }

    const stopResize = () => {
      setResizing(false)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
    window.addEventListener('blur', stopResize)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
      window.removeEventListener('blur', stopResize)
      stopResize()
    }
  }, [isResizing])

  const openSidebar = () => {
    if (mode === 'narrow') {
      setInspectorOpen(false)
    }

    setSidebarOpen(true)
  }

  const columns = useMemo(
    () =>
      [
        'var(--activity-rail-width)',
        dockSidebar ? String(sidebarWidth) + 'px' : '0px',
        'minmax(0, 1fr)',
        dockInspector ? 'var(--inspector-width)' : '0px',
      ].join(' '),
    [dockInspector, dockSidebar, sidebarWidth],
  )

  const rows = hasCanvas
    ? [
        'var(--chrome-height)',
        'minmax(0, 1fr)',
        'var(--status-height)',
      ].join(' ')
    : [
        'var(--chrome-height)',
        'minmax(0, 1fr)',
      ].join(' ')

  const sidebarContent = (
    <WorkspaceSidebar
      activeNavigationItem={activeNavigationItem}
      onActivatePage={actions.activatePage}
      onClose={() => setSidebarOpen(false)}
      onCreatePage={actions.createPage}
      pages={pages}
    />
  )

  const chrome = (
    <header className="col-span-full row-1 min-h-0 min-w-0 border-b border-divider bg-chrome">
      {renderChrome({
        isSidebarOpen,
        sidebarWidth: dockSidebar ? sidebarWidth : 0,
        tabs: model.tabs,
        onSidebarToggle: () => {
          if (isSidebarOpen) {
            setSidebarOpen(false)
          } else {
            openSidebar()
          }
        },
        onActivateTab: actions.activateTab,
        onCloseTab: actions.closeTab,
        onCreateCanvas: actions.createCanvas,
      })}
    </header>
  )

  const rail = (
    <div
      className="row-[2/-1] min-h-0 border-r border-divider bg-sidebar"
      style={{ gridColumn: 1 }}
    >
      <ActivityRail
        activeItemId={activeNavigationItem}
        onItemActivate={(surfaceId) => {
          actions.openWorkspaceSurface(
            surfaceId,
            SURFACE_TITLES[surfaceId],
          )
          openSidebar()
        }}
        onSettingsOpen={actions.openSettingsWindow}
      />
    </div>
  )

  const sidebar = (
    <>
      <div
        className="relative row-[2/-1] min-h-0 min-w-0 border-r border-divider bg-sidebar"
        style={{ gridColumn: 2 }}
      >
        {dockSidebar ? sidebarContent : null}

        {dockSidebar ? (
          <SidebarSplitter
            max={SIDEBAR_MAX}
            min={SIDEBAR_MIN}
            onCollapse={() => setSidebarOpen(false)}
            onResize={setSidebarWidth}
            onResizeStart={() => setResizing(true)}
            width={sidebarWidth}
          />
        ) : null}
      </div>

      {mode === 'narrow' && isSidebarOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-[var(--chrome-height)] z-[var(--ui-z-popover)]">
          <button
            aria-label="关闭工作区导航"
            className="absolute inset-0 cursor-default bg-black/35"
            onClick={() => setSidebarOpen(false)}
            type="button"
          />

          <aside
            aria-label="工作区导航"
            className="relative ml-[var(--activity-rail-width)] h-full w-[min(82vw,320px)] border-r border-divider bg-sidebar shadow-2xl"
          >
            <div className="relative h-full">
              {sidebarContent}

              <Button
                aria-label="关闭侧边栏"
                className="absolute right-2 top-2"
                onClick={() => setSidebarOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <PanelLeftClose
                  aria-hidden="true"
                  className="size-4"
                />
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )

  const canvas = (
    <section
      aria-label="内容区"
      className="row-2 min-h-0 min-w-0 overflow-hidden"
      style={{ gridColumn: 3 }}
    >
      <main
        aria-labelledby={
          'workbench-tab-' +
          model.activeTabId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')
        }
        className="relative h-full min-h-0 min-w-0 overflow-hidden"
        id={
          'workbench-panel-' +
          model.activeTabId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')
        }
        role="tabpanel"
      >
        {mainContent}
      </main>
    </section>
  )

  const inspectorContent = (
    <InspectorHost>{inspector}</InspectorHost>
  )

  const inspectorRegion = hasCanvas ? (
    <>
      <aside
        aria-label="属性检查器"
        className={
          dockInspector
            ? 'row-[2/-1] min-h-0 min-w-0 border-l border-divider'
            : 'pointer-events-none'
        }
        style={{ gridColumn: 4 }}
      >
        {dockInspector ? (
          <div className="relative h-full">
            <Button
              aria-label="收起属性面板"
              className="absolute -left-8 top-3 z-30 size-7 rounded-r-none"
              onClick={() => setInspectorOpen(false)}
              size="icon"
              type="button"
              variant="outline"
            >
              <PanelRightClose
                aria-hidden="true"
                className="size-3.5"
              />
            </Button>

            {inspectorContent}
          </div>
        ) : null}
      </aside>

      {!dockInspector && !isInspectorOpen ? (
        <Button
          aria-expanded={false}
          aria-label="展开属性面板"
          className="fixed right-0 top-[calc(var(--chrome-height)+12px)] z-30 rounded-r-none"
          onClick={() => {
            if (mode !== 'wide') {
              setSidebarOpen(false)
            }

            setInspectorOpen(true)
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <PanelRightOpen
            aria-hidden="true"
            className="size-4"
          />
        </Button>
      ) : null}

      {mode !== 'wide' && isInspectorOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-[var(--chrome-height)] z-[var(--ui-z-popover)]">
          <button
            aria-label="关闭属性检查器"
            className="absolute inset-0 cursor-default bg-black/35"
            onClick={() => setInspectorOpen(false)}
            type="button"
          />

          <aside
            aria-label="属性检查器"
            className="relative ml-auto h-full w-[min(92vw,340px)] border-l border-divider bg-sidebar shadow-2xl"
          >
            {inspectorContent}
          </aside>
        </div>
      ) : null}
    </>
  ) : null

  const status = hasCanvas ? (
    <div
      className="min-w-0"
      style={{ gridColumn: 3, gridRow: 3 }}
    >
      <StatusBarHost left={statusLeft} right={statusRight} />
    </div>
  ) : null

  return (
    <TooltipProvider delayDuration={450}>
      <WorkspaceFrame
        canvas={canvas}
        chrome={chrome}
        gridTemplateColumns={columns}
        gridTemplateRows={rows}
        inspector={inspectorRegion}
        overlays={
          <>
            {assistantOverlay}
            {overlays}
          </>
        }
        rail={rail}
        rootRef={rootRef}
        sidebar={sidebar}
        statusBar={status}
      />
    </TooltipProvider>
  )
}
`,
  ],
  [
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
    String.raw`import type { EditorSession } from '@hybrid-canvas/canvas/application'
import { EditorSessionHost } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'
import type {
  CanvasSessionId,
  WorkbenchSessionStore,
  WorkbenchTabId,
  WorkspaceShellActions,
} from '@hybrid-canvas/workspace/contracts'
import {
  NoCanvasSurface,
  WorkbenchTabs,
  WorkspaceShell,
  WorkspaceSurface,
} from '@hybrid-canvas/workspace/react'
import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'
import { DesktopTitleBar } from '../chrome/DesktopTitleBar'
import { reportUiError as reportError } from '../ui/ui-feedback'

const EMPTY_EDITOR_SESSION_SNAPSHOT = Object.freeze({
  pages: Object.freeze([]),
})

const EMPTY_SUBSCRIBE = () => () => {}
const EMPTY_EDITOR_SNAPSHOT = () => EMPTY_EDITOR_SESSION_SNAPSHOT

export type WorkspaceCanvasCloseResult =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'confirmation-required'
      readonly sessionId: CanvasSessionId
    }
  | { readonly kind: 'not-found' }

export interface WorkspaceCanvasUIPort {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (
    sessionId: CanvasSessionId,
  ) => Promise<WorkspaceCanvasCloseResult>
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly getEditorSession: (
    sessionId: CanvasSessionId,
  ) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/document').CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void
}

export interface WorkspaceUIPort {
  readonly canvases: WorkspaceCanvasUIPort
  readonly workspace: WorkbenchSessionStore
}

export interface WorkspaceContainerProps {
  readonly port: WorkspaceUIPort
  readonly onCommandPaletteOpen: () => void
  readonly onSettingsOpen: () => void
  readonly onWindowMinimize: () => void
  readonly onWindowMaximize: () => void
  readonly onWindowClose: () => void
  readonly onWindowStartDragging: () => void
}

export function WorkspaceContainer({
  port,
  onCommandPaletteOpen,
  onSettingsOpen,
  onWindowMinimize,
  onWindowMaximize,
  onWindowClose,
  onWindowStartDragging,
}: WorkspaceContainerProps) {
  const [pendingCloseSessionId, setPendingCloseSessionId] =
    useState<CanvasSessionId | null>(null)

  const workbench = useSyncExternalStore(
    port.workspace.subscribe,
    port.workspace.getSnapshot,
    port.workspace.getSnapshot,
  )

  useSyncExternalStore(
    port.canvases.subscribe,
    port.canvases.getVersion,
    port.canvases.getVersion,
  )

  const activeSessionId =
    workbench.activeSurface.kind === 'canvas'
      ? workbench.activeSurface.sessionId
      : null

  const activeEditorSession = activeSessionId
    ? port.canvases.getEditorSession(activeSessionId)
    : null

  const pages = useSyncExternalStore(
    activeEditorSession?.subscribe ?? EMPTY_SUBSCRIBE,
    activeEditorSession?.getSessionSnapshot ??
      EMPTY_EDITOR_SNAPSHOT,
    activeEditorSession?.getSessionSnapshot ??
      EMPTY_EDITOR_SNAPSHOT,
  ).pages

  const handleSave = useCallback(
    (sessionId: CanvasSessionId) => {
      void port.canvases.save(sessionId).catch((cause: unknown) => {
        reportError('canvas save failed', {
          scope: 'workspace',
          operation: 'save-canvas',
          sessionId,
          cause,
        })
      })
    },
    [port.canvases],
  )

  const handleCloseCanvas = useCallback(
    (sessionId: CanvasSessionId) => {
      void port.canvases
        .requestClose(sessionId)
        .then((result) => {
          if (result.kind === 'confirmation-required') {
            setPendingCloseSessionId(result.sessionId)
          }
        })
        .catch((cause: unknown) => {
          reportError('canvas close request failed', {
            scope: 'workspace',
            operation: 'request-close-canvas',
            sessionId,
            cause,
          })
        })
    },
    [port.canvases],
  )

  const handleCloseTab = useCallback(
    (tabId: WorkbenchTabId) => {
      const tab = port.workspace
        .getSnapshot()
        .tabs.find((candidate) => candidate.id === tabId)

      if (!tab || !tab.canClose) {
        return
      }

      if (tab.kind === 'canvas') {
        handleCloseCanvas(tab.sessionId)
        return
      }

      port.workspace.closeTab(tab.id)
    },
    [handleCloseCanvas, port.workspace],
  )

  const actions = useMemo<WorkspaceShellActions>(
    () => ({
      createCanvas() {
        const existingTitles = workbench.tabs
          .filter((tab) => tab.kind === 'canvas')
          .map((tab) => tab.title)

        port.canvases.create(
          createUntitledCanvasTitle(existingTitles),
        )
      },

      openCanvas() {
        void port.canvases.open().catch((cause: unknown) => {
          reportError('canvas open failed', {
            scope: 'workspace',
            operation: 'open-canvas',
            cause,
          })
        })
      },

      activateTab(tabId) {
        port.workspace.activateTab(tabId)
      },

      closeTab: handleCloseTab,

      openWorkspaceSurface(surfaceId, title) {
        port.workspace.openWorkspaceSurface({
          surfaceId,
          title,
        })
      },

      activatePage(pageId) {
        activeEditorSession?.activatePage(pageId)
      },

      createPage() {
        activeEditorSession?.createPage(
          '画板 ' + String(pages.length + 1),
        )
      },

      openCommandPalette: onCommandPaletteOpen,
      openSettingsWindow: onSettingsOpen,
    }),
    [
      activeEditorSession,
      handleCloseTab,
      onCommandPaletteOpen,
      onSettingsOpen,
      pages.length,
      port.canvases,
      port.workspace,
      workbench.tabs,
    ],
  )

  const tabs = workbench.tabs.map((tab) => {
    if (tab.kind !== 'canvas') {
      return tab
    }

    const status = port.canvases.getSessionSnapshot(
      tab.sessionId,
    )?.persistence

    return status ? { ...tab, status } : tab
  })

  const model = {
    ...workbench,
    tabs,
  }

  const hostedSessions = useMemo(
    () =>
      workbench.tabs.flatMap((tab) => {
        if (tab.kind !== 'canvas') {
          return []
        }

        const session = port.canvases.getEditorSession(
          tab.sessionId,
        )

        return session
          ? [{ sessionId: tab.sessionId, session }]
          : []
      }),
    [port.canvases, workbench.tabs],
  )

  const mainContent = renderActiveSurface({
    activeSurface: workbench.activeSurface,
    activeSessionId,
    hostedSessions,
    onCreateCanvas: actions.createCanvas,
    onOpenCanvas: actions.openCanvas,
    onSave: handleSave,
  })

  return (
    <WorkspaceShell
      actions={actions}
      inspector={
        <CanvasInspectorContent
          hasActiveCanvas={workbench.activeCanvas !== null}
        />
      }
      mainContent={mainContent}
      model={model}
      overlays={
        <ConfirmationDialog
          confirmLabel="放弃并关闭"
          description="关闭画布会丢失自上次保存后的更改，此操作无法撤销。"
          destructive
          onCancel={() => setPendingCloseSessionId(null)}
          onConfirm={() => {
            if (!pendingCloseSessionId) {
              return
            }

            try {
              port.canvases.discardAndClose(
                pendingCloseSessionId,
              )
            } catch (cause) {
              reportError('discard and close canvas failed', {
                scope: 'workspace',
                operation: 'discard-and-close-canvas',
                sessionId: pendingCloseSessionId,
                cause,
              })

              return
            }

            setPendingCloseSessionId(null)
          }}
          open={pendingCloseSessionId !== null}
          title="放弃未保存的更改？"
        />
      }
      pages={pages}
      renderChrome={({
        isSidebarOpen,
        sidebarWidth,
        tabs: chromeTabs,
        onSidebarToggle,
        onActivateTab,
        onCloseTab,
        onCreateCanvas,
      }) => (
        <DesktopTitleBar
          isSidebarOpen={isSidebarOpen}
          onClose={onWindowClose}
          onMaximize={onWindowMaximize}
          onMinimize={onWindowMinimize}
          onSidebarToggle={onSidebarToggle}
          onStartDragging={onWindowStartDragging}
          sidebarWidth={sidebarWidth}
        >
          <WorkbenchTabs
            onActivate={onActivateTab}
            onClose={onCloseTab}
            onCreate={onCreateCanvas}
            tabs={chromeTabs}
          />
        </DesktopTitleBar>
      )}
      statusLeft={
        <CanvasStatusLeftContent
          hasActiveCanvas={workbench.activeCanvas !== null}
        />
      }
      statusRight={
        <CanvasStatusRightContent pageCount={pages.length} />
      }
    />
  )
}

interface ActiveSurfaceRendererProps {
  readonly activeSurface:
    import('@hybrid-canvas/workspace/contracts').WorkbenchSurfaceViewModel
  readonly activeSessionId: CanvasSessionId | null
  readonly hostedSessions: readonly {
    readonly sessionId: CanvasSessionId
    readonly session: EditorSession
  }[]
  readonly onCreateCanvas: () => void
  readonly onOpenCanvas: () => void
  readonly onSave: (sessionId: CanvasSessionId) => void
}

function renderActiveSurface({
  activeSurface,
  activeSessionId,
  hostedSessions,
  onCreateCanvas,
  onOpenCanvas,
  onSave,
}: ActiveSurfaceRendererProps) {
  switch (activeSurface.kind) {
    case 'start':
      return (
        <NoCanvasSurface
          onCreateDocument={onCreateCanvas}
          onOpenDocument={onOpenCanvas}
        />
      )

    case 'workspace':
      return (
        <WorkspaceSurface
          surfaceId={activeSurface.surfaceId}
        />
      )

    case 'canvas':
      return (
        <UiErrorBoundary area="画布编辑器">
          <EditorSessionHost
            activeSessionId={activeSessionId}
            onSave={onSave}
            sessions={hostedSessions}
          />
        </UiErrorBoundary>
      )
  }
}

function CanvasInspectorContent({
  hasActiveCanvas,
}: {
  readonly hasActiveCanvas: boolean
}) {
  if (!hasActiveCanvas) {
    return (
      <div className="py-10 text-center text-xs text-muted-foreground">
        激活画布标签后可查看属性
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <section className="rounded-md border border-divider p-3">
        <h3 className="text-xs font-medium">画布属性</h3>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          选择画布中的对象后，可在这里编辑对应属性。
        </p>
      </section>
    </div>
  )
}

function CanvasStatusLeftContent({
  hasActiveCanvas,
}: {
  readonly hasActiveCanvas: boolean
}) {
  return <span>{hasActiveCanvas ? '本地画布' : null}</span>
}

function CanvasStatusRightContent({
  pageCount,
}: {
  readonly pageCount: number
}) {
  return pageCount > 0 ? <span>{pageCount} 个页面</span> : null
}

function createUntitledCanvasTitle(
  existingTitles: readonly string[],
): string {
  const baseTitle = '未命名画板'

  if (!existingTitles.includes(baseTitle)) {
    return baseTitle
  }

  let suffix = 2

  while (
    existingTitles.includes(
      baseTitle + ' ' + String(suffix),
    )
  ) {
    suffix += 1
  }

  return baseTitle + ' ' + String(suffix)
}
`,
  ],
])

const deletePaths = [
  'features/workspace/src/presentation/shell/CanvasTabs.tsx',
  'features/workspace/src/presentation/shell/DocumentTabs.tsx',
]

await assertRepository()
await writeAllFiles()
await deleteLegacyFiles()

if (!skipChecks) {
  runChecks()
}

console.log(
  '\nWorkbench 通用标签页架构重构完成：' +
    String(files.size) +
    ' 个文件已写入，' +
    String(deletePaths.length) +
    ' 个旧实现已删除。',
)

async function assertRepository() {
  const packagePath = join(root, 'package.json')

  if (!existsSync(packagePath)) {
    throw new Error(
      '未找到 package.json。请在 hybrid-canvas 仓库根目录执行脚本。',
    )
  }

  const packageJson = JSON.parse(
    await readFile(packagePath, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库，已拒绝修改。',
    )
  }

  const requiredPaths = [
    'features/workspace/src/contracts/workbench-contract.ts',
    'features/workspace/src/application/session/workbench-session-controller.ts',
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ]

  for (const path of requiredPaths) {
    if (!existsSync(join(root, path))) {
      throw new Error('缺少预期文件：' + path)
    }
  }
}

async function writeAllFiles() {
  for (const [relativePath, content] of files) {
    const destination = join(root, relativePath)
    const destinationDirectory = dirname(destination)
    const temporaryPath =
      destination +
      '.tmp-' +
      process.pid +
      '-' +
      Date.now()

    await mkdir(destinationDirectory, { recursive: true })
    await writeFile(
      temporaryPath,
      normalizeContent(content),
      'utf8',
    )
    await rename(temporaryPath, destination)

    console.log('WRITE  ' + relativePath)
  }
}

async function deleteLegacyFiles() {
  for (const relativePath of deletePaths) {
    const destination = join(root, relativePath)

    if (!existsSync(destination)) {
      continue
    }

    await rm(destination)
    console.log('DELETE ' + relativePath)
  }
}

function runChecks() {
  const changedFiles = [...files.keys()]

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    ...changedFiles,
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
}

function run(command, args) {
  console.log('\nRUN    ' + command + ' ' + args.join(' '))

  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function normalizeContent(content) {
  return content.replaceAll('\r\n', '\n').trimStart() + '\n'
}