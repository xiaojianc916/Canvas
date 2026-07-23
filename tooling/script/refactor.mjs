#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: overwrite script intentionally reports progress. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')

const FILES = Object.freeze({
  desktopTitleBar: 'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx',
  workspaceShell: 'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  workbenchTabs: 'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
  workbenchTabsCss: 'features/workspace/src/presentation/shell/chrome-workbench-tabs.css',
})

main()

function main() {
  assertRepositoryRoot()

  const updates = new Map([
    [FILES.desktopTitleBar, getDesktopTitleBarContent()],
    [FILES.workspaceShell, getWorkspaceShellContent()],
    [FILES.workbenchTabs, getWorkbenchTabsContent()],
    [FILES.workbenchTabsCss, getWorkbenchTabsCssContent()],
  ])

  if (!WRITE) {
    console.log('已生成覆盖式重构计划，但未写入。')
    console.log('')
    console.log('将覆盖以下文件：')
    for (const file of updates.keys()) {
      console.log(`- ${file}`)
    }
    console.log('')
    console.log('执行写入：')
    console.log('node tooling/script/refactor.mjs --write')
    return
  }

  for (const [relativePath, content] of updates) {
    const absolutePath = path.join(ROOT, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
    console.log(`已覆盖：${relativePath}`)
  }

  console.log('')
  console.log('顶部栏 / 激活标签重构已完成。')
  console.log('')
  console.log('现在的结构是：')
  console.log('- header 不再整体画底边')
  console.log('- 左上角按钮区自己画底边')
  console.log('- sidebar 占位区自己画底边，且仅在打开时显示右侧竖线')
  console.log('- 右侧窗口控制区自己画底边')
  console.log('- tabs viewport 自己画左右两段底边，激活标签下方从源头不画线')
}

function assertRepositoryRoot() {
  const packagePath = path.join(ROOT, 'package.json')

  if (!fs.existsSync(packagePath)) {
    fail('请在仓库根目录运行脚本：当前目录缺少 package.json')
  }

  let packageJson

  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } catch (cause) {
    fail(`无法读取 package.json：${formatCause(cause)}`)
  }

  if (packageJson.name !== 'hybrid-canvas') {
    fail(
      `仓库不匹配：期望 package.json.name 为 hybrid-canvas，实际为 ${String(
        packageJson.name,
      )}`,
    )
  }
}

function getDesktopTitleBarContent() {
  return `import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react'

const WINDOW_DRAG_EXCLUSION_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[data-window-drag-exclude]',
].join(',')

export interface DesktopTitleBarProps {
  readonly children: React.ReactNode
  readonly onMinimize: () => void
  readonly onMaximize: () => void
  readonly onClose: () => void
  readonly onStartDragging: () => void
  readonly onSidebarToggle: () => void
  readonly isSidebarOpen: boolean
  readonly isMaximized: boolean
  readonly sidebarWidth: number
}

export function DesktopTitleBar({
  children,
  onMinimize,
  onMaximize,
  onClose,
  onStartDragging,
  onSidebarToggle,
  isSidebarOpen,
  isMaximized,
}: DesktopTitleBarProps) {
  function handleDragMouseDown(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0) {
      return
    }

    const target = event.target

    if (!(target instanceof Element) || target.closest(WINDOW_DRAG_EXCLUSION_SELECTOR)) {
      return
    }

    event.preventDefault()

    if (event.detail === 2) {
      onMaximize()
      return
    }

    onStartDragging()
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 bg-chrome">
      <div
        aria-label="窗口标题栏"
        className="flex h-full min-h-0 w-full items-stretch"
        onMouseDownCapture={handleDragMouseDown}
        role="toolbar"
      >
        <div className="flex w-(--activity-rail-width) shrink-0 items-center justify-center border-b border-divider">
          <button
            aria-label={isSidebarOpen ? '收起侧边栏' : '展开侧边栏'}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            onClick={onSidebarToggle}
            type="button"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </button>
        </div>

        <div
          className="shrink-0 border-b border-divider"
          style={{
            borderRightStyle: 'solid',
            borderRightWidth: isSidebarOpen ? 1 : 0,
            width: 'var(--workspace-sidebar-column-width, 0px)',
          }}
        />

        <div className="flex min-w-0 flex-1 items-stretch">{children}</div>

        <div className="flex shrink-0 items-stretch border-b border-divider">
          <button
            aria-label="最小化"
            className="grid w-11 place-items-center text-muted-foreground hover:bg-black/5 hover:text-foreground"
            onClick={onMinimize}
            type="button"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
            className="grid w-11 place-items-center text-muted-foreground hover:bg-black/5 hover:text-foreground"
            onClick={onMaximize}
            title={isMaximized ? '还原窗口' : '最大化窗口'}
            type="button"
          >
            {isMaximized ? (
              <Copy aria-hidden="true" className="size-3.5" />
            ) : (
              <Square aria-hidden="true" className="size-3" />
            )}
          </button>
          <button
            aria-label="关闭"
            className="grid w-12 place-items-center text-muted-foreground hover:bg-[#c42b1c] hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
`
}

function getWorkspaceShellContent() {
  return `import { Button, TooltipProvider } from '@hybrid-canvas/design-system'
import { PanelLeftClose, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

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
const INSPECTOR_WIDTH = 276

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
  inspectorSelectionKey,
  statusLeft,
  statusRight,
  assistantOverlay,
  overlays,
}: WorkspaceShellProps) {
  const mode = useWorkspaceLayoutMode()
  const previousModeRef = useRef(mode)
  const previousInspectorSelectionKeyRef = useRef(inspectorSelectionKey ?? '')

  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [isInspectorOpen, setInspectorOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [isResizing, setResizing] = useState(false)

  const activeNavigationItem: WorkspaceSurfaceId =
    model.activeSurface.kind === 'workspace' ? model.activeSurface.surfaceId : 'pages'

  const hasCanvas = model.activeSurface.kind === 'canvas'
  const dockSidebar = mode !== 'narrow' && isSidebarOpen
  const dockInspector = mode === 'wide' && isInspectorOpen && hasCanvas

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
    const previousKey = previousInspectorSelectionKeyRef.current
    const nextKey = inspectorSelectionKey ?? ''

    previousInspectorSelectionKeyRef.current = nextKey

    if (!nextKey || nextKey === previousKey) {
      return
    }

    if (mode !== 'wide') {
      setSidebarOpen(false)
    }

    setInspectorOpen(true)
  }, [inspectorSelectionKey, mode])

  const openSidebar = () => {
    if (mode === 'narrow') {
      setInspectorOpen(false)
    }

    setSidebarOpen(true)
  }

  const sidebarColumnWidth = dockSidebar ? sidebarWidth : 0
  const inspectorColumnWidth = dockInspector ? INSPECTOR_WIDTH : 0

  const columns = useMemo(
    () =>
      [
        'var(--activity-rail-width)',
        'var(--workspace-sidebar-column-width, 0px)',
        'minmax(0, 1fr)',
        'var(--workspace-inspector-column-width, 0px)',
      ].join(' '),
    [],
  )

  const rows = hasCanvas
    ? ['var(--chrome-height)', 'minmax(0, 1fr)', 'var(--status-height)'].join(' ')
    : ['var(--chrome-height)', 'minmax(0, 1fr)'].join(' ')

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
    <header className="col-span-full row-1 min-h-0 min-w-0 bg-chrome">
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
        onMoveTab: actions.moveTab,
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
          actions.openWorkspaceSurface(surfaceId, SURFACE_TITLES[surfaceId])
          openSidebar()
        }}
        onDeveloperToolsOpen={actions.openDeveloperTools}
        onSettingsOpen={actions.openSettingsWindow}
      />
    </div>
  )

  const sidebar = (
    <>
      <div
        aria-hidden={!dockSidebar}
        className="relative z-20 row-[2/-1] min-h-0 min-w-0 overflow-visible border-r border-divider bg-sidebar"
        style={{
          borderRightWidth: dockSidebar ? 1 : 0,
          gridColumn: 2,
          pointerEvents: dockSidebar ? 'auto' : 'none',
        }}
      >
        {mode !== 'narrow' ? (
          <div className="h-full min-h-0 w-full overflow-hidden">
            <div
              className="h-full min-h-0"
              style={{ width: sidebarWidth }}
            >
              {sidebarContent}
            </div>
          </div>
        ) : null}

        {dockSidebar ? (
          <SidebarSplitter
            max={SIDEBAR_MAX}
            min={SIDEBAR_MIN}
            onCollapse={() => setSidebarOpen(false)}
            onResize={setSidebarWidth}
            onResizeEnd={() => setResizing(false)}
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
                <PanelLeftClose aria-hidden="true" className="size-4" />
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
      className="relative z-10 row-2 min-h-0 min-w-0 overflow-hidden border-r border-divider bg-background"
      style={{
        borderRightWidth: dockInspector ? 1 : 0,
        gridColumn: 3,
      }}
    >
      <main
        aria-labelledby={'workbench-tab-' + model.activeTabId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}
        className="relative h-full min-h-0 min-w-0 overflow-hidden"
        id={'workbench-panel-' + model.activeTabId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}
        role="tabpanel"
      >
        {mainContent}
      </main>
    </section>
  )

  const inspectorContent = <InspectorHost>{inspector}</InspectorHost>

  const inspectorRegion = hasCanvas ? (
    <>
      <aside
        aria-hidden={!dockInspector}
        aria-label="属性检查器"
        className={
          mode === 'wide'
            ? 'relative row-[2/-1] min-h-0 min-w-0 overflow-visible'
            : 'pointer-events-none'
        }
        style={{
          gridColumn: 4,
          pointerEvents: dockInspector ? 'auto' : 'none',
        }}
      >
        {mode === 'wide' ? (
          <div
            className="absolute inset-y-0 right-0 overflow-visible"
            style={{ width: INSPECTOR_WIDTH }}
          >
            <div className="relative h-full">
              {dockInspector ? (
                <Button
                  aria-label="收起属性面板"
                  className="absolute -left-8 top-3 z-30 size-7 rounded-r-none"
                  onClick={() => setInspectorOpen(false)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <PanelRightClose aria-hidden="true" className="size-3.5" />
                </Button>
              ) : null}

              {inspectorContent}
            </div>
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
          <PanelRightOpen aria-hidden="true" className="size-4" />
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
      className="relative z-10 min-w-0 border-r border-divider bg-background"
      style={{
        borderRightWidth: dockInspector ? 1 : 0,
        gridColumn: 3,
        gridRow: 3,
      }}
    >
      <StatusBarHost left={statusLeft} right={statusRight} />
    </div>
  ) : null

  return (
    <TooltipProvider delayDuration={450}>
      <WorkspaceFrame
        canvas={canvas}
        chrome={chrome}
        disableLayoutAnimation={isResizing}
        gridTemplateColumns={columns}
        gridTemplateRows={rows}
        inspector={inspectorRegion}
        inspectorColumnWidth={inspectorColumnWidth}
        overlays={
          <>
            {assistantOverlay}
            {overlays}
          </>
        }
        rail={rail}
        sidebar={sidebar}
        sidebarColumnWidth={sidebarColumnWidth}
        statusBar={status}
      />
    </TooltipProvider>
  )
}
`
}

function getWorkbenchTabsContent() {
  return `import {
  Boxes,
  ChartNoAxesCombined,
  FilePlus2,
  Files,
  FileText,
  Grid2X2,
  Image,
  Layers3,
  Network,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { type ComponentType, type DragEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react'

import type { WorkbenchTabId, WorkbenchTabViewModel } from '../../contracts/workbench-contract'

import './chrome-workbench-tabs.css'

export interface WorkbenchTabsProps {
  readonly tabs: readonly WorkbenchTabViewModel[]
  readonly onActivate: (tabId: WorkbenchTabId) => void
  readonly onClose: (tabId: WorkbenchTabId) => void
  readonly onMove: (tabId: WorkbenchTabId, targetIndex: number) => void
  readonly onCreate: () => void
}

type TabIcon = ComponentType<{
  readonly className?: string
  readonly 'aria-hidden'?: boolean | 'true' | 'false'
}>

export function WorkbenchTabs({ tabs, onActivate, onClose, onMove, onCreate }: WorkbenchTabsProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const viewportRef = useRef<HTMLDivElement | null>(null)

  const tabRefs = useRef(new Map<WorkbenchTabId, HTMLButtonElement>())

  const draggedTabIdRef = useRef<WorkbenchTabId | null>(null)

  const activeTabId = tabs.find((tab) => tab.isActive)?.id

  const previousActiveTabIdRef = useRef<WorkbenchTabId | undefined>(activeTabId)

  useEffect(() => {
    const previousActiveTabId = previousActiveTabIdRef.current

    if (previousActiveTabId && previousActiveTabId !== activeTabId) {
      const previousActivation = tabRefs.current.get(previousActiveTabId)

      const previousTab = previousActivation?.closest<HTMLElement>('.chrome-workbench-tab')

      if (previousTab?.matches(':hover')) {
        previousTab.setAttribute('data-suppress-hover', 'true')
      }
    }

    if (activeTabId) {
      const activeActivation = tabRefs.current.get(activeTabId)

      const activeTab = activeActivation?.closest<HTMLElement>('.chrome-workbench-tab')

      activeTab?.removeAttribute('data-suppress-hover')
    }

    previousActiveTabIdRef.current = activeTabId
  }, [activeTabId])

  useEffect(() => {
    if (!activeTabId) {
      return
    }

    const scroller = scrollerRef.current
    const activation = tabRefs.current.get(activeTabId)
    const tab = activation?.closest<HTMLElement>('.chrome-workbench-tab')

    if (!scroller || !tab) {
      return
    }

    const viewportPadding = 4
    const viewportStart = scroller.scrollLeft
    const viewportEnd = viewportStart + scroller.clientWidth
    const tabStart = tab.offsetLeft
    const tabEnd = tabStart + tab.offsetWidth

    let nextScrollLeft = viewportStart

    if (tabStart < viewportStart + viewportPadding) {
      nextScrollLeft = Math.max(0, tabStart - viewportPadding)
    } else if (tabEnd > viewportEnd - viewportPadding) {
      nextScrollLeft = tabEnd - scroller.clientWidth + viewportPadding
    }

    if (nextScrollLeft !== viewportStart) {
      scroller.scrollTo({
        left: nextScrollLeft,
        behavior: 'auto',
      })
    }
  }, [activeTabId])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const scroller = scrollerRef.current

    if (!viewport || !scroller) {
      return
    }

    const syncBaselineGap = () => {
      if (!activeTabId) {
        viewport.dataset.hasActiveTab = 'false'
        viewport.style.removeProperty('--chrome-active-tab-left')
        viewport.style.removeProperty('--chrome-active-tab-right')
        return
      }

      const activation = tabRefs.current.get(activeTabId)
      const activeTab = activation?.closest<HTMLElement>('.chrome-workbench-tab')

      if (!activeTab) {
        viewport.dataset.hasActiveTab = 'false'
        viewport.style.removeProperty('--chrome-active-tab-left')
        viewport.style.removeProperty('--chrome-active-tab-right')
        return
      }

      const viewportRect = viewport.getBoundingClientRect()
      const tabRect = activeTab.getBoundingClientRect()

      const left = Math.max(0, tabRect.left - viewportRect.left)
      const right = Math.min(viewportRect.width, tabRect.right - viewportRect.left)

      viewport.dataset.hasActiveTab = 'true'
      viewport.style.setProperty('--chrome-active-tab-left', \`\${left}px\`)
      viewport.style.setProperty('--chrome-active-tab-right', \`\${right}px\`)
    }

    syncBaselineGap()

    scroller.addEventListener('scroll', syncBaselineGap, { passive: true })
    window.addEventListener('resize', syncBaselineGap)

    return () => {
      scroller.removeEventListener('scroll', syncBaselineGap)
      window.removeEventListener('resize', syncBaselineGap)
    }
  }, [activeTabId, tabs])

  function handleKeyboard(event: KeyboardEvent<HTMLButtonElement>, tabId: WorkbenchTabId): void {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId)

    if (currentIndex < 0) {
      return
    }

    let targetIndex: number | null = null

    switch (event.key) {
      case 'ArrowLeft':
        targetIndex = (currentIndex - 1 + tabs.length) % tabs.length
        break

      case 'ArrowRight':
        targetIndex = (currentIndex + 1) % tabs.length
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
      tabRefs.current.get(target.id)?.focus()
    })
  }

  function handleDragStart(event: DragEvent<HTMLElement>, tab: WorkbenchTabViewModel): void {
    if (!tab.canClose) {
      event.preventDefault()
      return
    }

    draggedTabIdRef.current = tab.id

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-hybrid-canvas-workbench-tab', tab.id)
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetIndex: number): void {
    event.preventDefault()

    const draggedTabId =
      draggedTabIdRef.current ??
      event.dataTransfer.getData('application/x-hybrid-canvas-workbench-tab')

    draggedTabIdRef.current = null

    if (draggedTabId) {
      onMove(draggedTabId, targetIndex)
    }
  }

  return (
    <div className="chrome-workbench-tabs">
      <div
        className="chrome-workbench-tabs__viewport"
        data-has-active-tab={activeTabId ? 'true' : 'false'}
        ref={viewportRef}
      >
        <div
          aria-label="工作台标签页"
          className="chrome-workbench-tabs__scroller"
          onWheel={(event) => {
            const scroller = scrollerRef.current

            if (!scroller || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
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
                data-active={tab.isActive ? 'true' : 'false'}
                draggable={tab.canClose}
                key={tab.id}
                onDragEnd={() => {
                  draggedTabIdRef.current = null
                }}
                onDragOver={(event) => {
                  if (draggedTabIdRef.current) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }
                }}
                onDragStart={(event) => handleDragStart(event, tab)}
                onDrop={(event) => handleDrop(event, index)}
                onMouseDown={(event) => {
                  if (event.button === 1 && tab.canClose) {
                    event.preventDefault()
                    onClose(tab.id)
                  }
                }}
                onPointerLeave={(event) => {
                  event.currentTarget.removeAttribute('data-suppress-hover')
                }}
              >
                <ChromeActiveTabShape />

                <span aria-hidden="true" className="chrome-workbench-tab__separator" />

                <div className="chrome-workbench-tab__content">
                  <button
                    aria-controls={'workbench-panel-' + encodeDomId(tab.id)}
                    aria-selected={tab.isActive}
                    className="chrome-workbench-tab__activation"
                    id={'workbench-tab-' + encodeDomId(tab.id)}
                    onClick={() => onActivate(tab.id)}
                    onKeyDown={(event) => handleKeyboard(event, tab.id)}
                    ref={(node) => {
                      if (node) {
                        tabRefs.current.set(tab.id, node)
                      } else {
                        tabRefs.current.delete(tab.id)
                      }
                    }}
                    role="tab"
                    tabIndex={tab.isActive ? 0 : -1}
                    title={tab.title}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="chrome-workbench-tab__icon" />

                    <span className="chrome-workbench-tab__title">{tab.title}</span>
                  </button>

                  <TabEndAction model={tab} onClose={onClose} />
                </div>
              </article>
            )
          })}
          <button
            aria-label="新建画布"
            className="chrome-workbench-tabs__new-tab chrome-workbench-tabs__new-tab--sticky"
            data-window-drag-exclude
            onClick={onCreate}
            type="button"
          >
            <Plus aria-hidden="true" className="size-3.5" />
          </button>

          <div aria-hidden="true" className="chrome-workbench-tabs__drag-region" />
        </div>
      </div>
    </div>
  )
}

function ChromeActiveTabShape() {
  return (
    <div aria-hidden="true" className="chrome-workbench-tab__active-shape">
      <svg
        className="chrome-workbench-tab__active-cap chrome-workbench-tab__active-cap--left"
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 20 32"
      >
        <path
          className="chrome-workbench-tab__active-cap-fill"
          d="M0 32C5.5 32 9.5 28 9.5 23V10C9.5 5.6 13.1 2 17.5 2H20V32Z"
        />

        <path
          className="chrome-workbench-tab__active-cap-outline"
          d="M0 31.5C5.5 31.5 9.5 27.7 9.5 23V10C9.5 5.9 13.1 2.5 17.5 2.5H20"
        />
      </svg>

      <span className="chrome-workbench-tab__active-center" />

      <svg
        className="chrome-workbench-tab__active-cap chrome-workbench-tab__active-cap--right"
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 20 32"
      >
        <path
          className="chrome-workbench-tab__active-cap-fill"
          d="M0 32C5.5 32 9.5 28 9.5 23V10C9.5 5.6 13.1 2 17.5 2H20V32Z"
        />

        <path
          className="chrome-workbench-tab__active-cap-outline"
          d="M0 31.5C5.5 31.5 9.5 27.7 9.5 23V10C9.5 5.9 13.1 2.5 17.5 2.5H20"
        />
      </svg>
    </div>
  )
}

function TabEndAction({
  model,
  onClose,
}: {
  readonly model: WorkbenchTabViewModel
  readonly onClose: (tabId: WorkbenchTabId) => void
}) {
  if (!model.canClose) {
    return null
  }

  const status = model.kind === 'canvas' ? model.status : undefined

  return (
    <div className="chrome-workbench-tab__end">
      {status && status !== 'clean' ? (
        <span
          aria-label={status === 'dirty' ? '未保存' : status === 'saving' ? '正在保存' : '保存失败'}
          className={'chrome-workbench-tab__status ' + 'chrome-workbench-tab__status--' + status}
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
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
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

function encodeDomId(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '-')
}
`
}

function getWorkbenchTabsCssContent() {
  return `/*
 * Canonical Chrome-style workbench tabs.
 *
 * Region divider ownership:
 * - Left rail button zone owns its own bottom border.
 * - Sidebar placeholder owns its own bottom border and optional right border.
 * - Tab viewport owns the middle baseline.
 * - Right window control zone owns its own bottom border.
 * - The baseline under the active tab is intentionally not drawn.
 */

.chrome-workbench-tabs,
.chrome-workbench-tabs * {
  box-sizing: border-box;
}

.chrome-workbench-tabs {
  --chrome-tab-height: 32px;
  --chrome-tab-min-width: 88px;
  --chrome-tab-preferred-width: 168px;
  --chrome-tab-max-width: 220px;

  --chrome-tab-strip: var(--color-chrome);
  --chrome-tab-surface: var(--color-background);
  --chrome-tab-boundary: var(--color-divider);
  --chrome-tab-divider: var(--color-divider);
  --chrome-tab-hover: color-mix(in srgb, var(--color-foreground) 4%, var(--chrome-tab-strip) 96%);

  position: relative;
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  color: var(--color-foreground);
  background: var(--chrome-tab-strip);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 12px;
}

.chrome-workbench-tabs__viewport {
  --chrome-active-tab-left: 0px;
  --chrome-active-tab-right: 0px;
  position: relative;
  min-width: 0;
  height: 100%;
  flex: 1 1 auto;
  overflow: hidden;
}

.chrome-workbench-tabs__viewport::before,
.chrome-workbench-tabs__viewport::after {
  position: absolute;
  z-index: 2;
  bottom: 0;
  height: 1px;
  background: var(--color-divider);
  content: "";
  pointer-events: none;
}

.chrome-workbench-tabs__viewport[data-has-active-tab="true"]::before {
  left: 0;
  right: calc(100% - var(--chrome-active-tab-left));
}

.chrome-workbench-tabs__viewport[data-has-active-tab="true"]::after {
  left: var(--chrome-active-tab-right);
  right: 0;
}

.chrome-workbench-tabs__viewport[data-has-active-tab="false"]::before {
  display: none;
}

.chrome-workbench-tabs__viewport[data-has-active-tab="false"]::after {
  left: 0;
  right: 0;
}

.chrome-workbench-tabs__scroller {
  position: relative;
  display: flex;
  align-items: end;
  width: 100%;
  height: 100%;
  min-width: 0;
  padding: 4px 4px 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  scroll-padding-inline: 4px 34px;
  scroll-snap-type: x proximity;
  overscroll-behavior-inline: contain;
}

.chrome-workbench-tabs__scroller::-webkit-scrollbar {
  display: none;
}

.chrome-workbench-tabs__drag-region {
  height: 100%;
  min-width: 24px;
  flex: 1 0 24px;
}

.chrome-workbench-tab {
  position: relative;
  z-index: 1;
  height: var(--chrome-tab-height);
  min-width: var(--chrome-tab-min-width);
  max-width: var(--chrome-tab-max-width);
  flex: 0 1 var(--chrome-tab-preferred-width);
  margin-left: -4px;
  overflow: visible;
  isolation: isolate;
  user-select: none;
  scroll-snap-align: start;
  scroll-snap-stop: normal;
}

.chrome-workbench-tab:first-child {
  margin-left: 0;
}

.chrome-workbench-tab[data-active="true"] {
  z-index: 5;
}

.chrome-workbench-tab:hover:not([data-active="true"]) {
  z-index: 3;
}

.chrome-workbench-tab[data-active="true"]::before,
.chrome-workbench-tab[data-active="true"]::after {
  display: none;
  content: none;
  box-shadow: none;
}

.chrome-workbench-tab__active-shape {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: none;
  overflow: visible;
  pointer-events: none;
}

.chrome-workbench-tab[data-active="true"] .chrome-workbench-tab__active-shape {
  display: block;
}

.chrome-workbench-tab__active-cap {
  position: absolute;
  top: 0;
  display: block;
  width: 20px;
  height: 32px;
  overflow: visible;
}

.chrome-workbench-tab__active-cap--left {
  left: 0;
}

.chrome-workbench-tab__active-cap--right {
  right: 0;
  transform: scaleX(-1);
  transform-origin: center;
}

.chrome-workbench-tab__active-cap-fill {
  fill: var(--chrome-tab-surface);
}

.chrome-workbench-tab__active-cap-outline {
  fill: none;
  stroke: var(--chrome-tab-boundary);
  stroke-width: 1;
  stroke-linecap: round;
  stroke-linejoin: round;
  shape-rendering: geometricPrecision;
  vector-effect: non-scaling-stroke;
}

.chrome-workbench-tab__active-center {
  position: absolute;
  top: 2px;
  right: 20px;
  bottom: 0;
  left: 20px;
  border-top: 1px solid var(--chrome-tab-boundary);
  background: var(--chrome-tab-surface);
}

.chrome-workbench-tab__content {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  background: transparent;
  transition: color 80ms ease-out;
}

.chrome-workbench-tab .chrome-workbench-tab__content,
.chrome-workbench-tab[data-active="true"] .chrome-workbench-tab__content,
.chrome-workbench-tab:not([data-active="true"]) .chrome-workbench-tab__content {
  inset: 2px 12px 0;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  outline: 0;
  background: transparent;
  box-shadow: none;
}

.chrome-workbench-tab:hover:not([data-active="true"]) .chrome-workbench-tab__content,
.chrome-workbench-tab:hover:not([data-active="true"]):not([data-suppress-hover="true"])
  .chrome-workbench-tab__content {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.chrome-workbench-tab[data-suppress-hover="true"] .chrome-workbench-tab__content {
  transition: none;
}

.chrome-workbench-tab[data-suppress-hover="true"] .chrome-workbench-tab__separator {
  opacity: 0;
  transition: none;
}

.chrome-workbench-tab:not([data-active="true"])::before {
  position: absolute;
  z-index: 3;
  inset: 2px 3px;
  display: block;
  border: 0;
  border-radius: 8px;
  outline: 0;
  background: var(--chrome-tab-hover);
  box-shadow: none;
  content: "";
  opacity: 0;
  pointer-events: none;
  transition: opacity 80ms ease-out;
}

.chrome-workbench-tab:hover:not([data-active="true"]):not([data-suppress-hover="true"])::before {
  opacity: 1;
}

.chrome-workbench-tab[data-suppress-hover="true"]:not([data-active="true"])::before {
  opacity: 0;
  transition: none;
}

.chrome-workbench-tab[data-active="true"]::before {
  display: none;
  content: none;
}

.chrome-workbench-tab__activation {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  flex: 1 1 auto;
  gap: 7px;
  padding: 0;
  overflow: hidden;
  border: 0;
  outline: 0;
  color: var(--color-muted-foreground);
  background: transparent;
  text-align: left;
  cursor: default;
}

.chrome-workbench-tab[data-active="true"] .chrome-workbench-tab__activation,
.chrome-workbench-tab:hover:not([data-active="true"]) .chrome-workbench-tab__activation {
  color: var(--color-foreground);
}

.chrome-workbench-tab__activation:focus-visible {
  border-radius: 6px;
  outline: 2px solid var(--color-primary);
  outline-offset: -3px;
}

.chrome-workbench-tab__icon {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  stroke-width: 1.8;
}

.chrome-workbench-tab__title {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chrome-workbench-tab[data-active="true"] .chrome-workbench-tab__title {
  font-weight: 400;
}

.chrome-workbench-tab__end {
  position: relative;
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  margin-left: 3px;
  place-items: center;
}

.chrome-workbench-tab__close {
  position: absolute;
  inset: 2px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: currentColor;
  background: transparent;
  opacity: 0.78;
}

.chrome-workbench-tab__close:hover {
  background: color-mix(in srgb, var(--color-foreground) 10%, transparent);
  opacity: 1;
}

.chrome-workbench-tab__close:active {
  background: color-mix(in srgb, var(--color-foreground) 16%, transparent);
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
  animation: chrome-workbench-saving 900ms ease-in-out infinite alternate;
}

.chrome-workbench-tab__status--failed {
  background: #e56458;
}

.chrome-workbench-tab__status + .chrome-workbench-tab__close {
  opacity: 0;
}

.chrome-workbench-tab:hover .chrome-workbench-tab__status {
  opacity: 0;
}

.chrome-workbench-tab:hover .chrome-workbench-tab__status + .chrome-workbench-tab__close {
  opacity: 1;
}

.chrome-workbench-tab__separator {
  position: absolute;
  z-index: 2;
  top: 9px;
  right: 3px;
  bottom: 9px;
  width: 1px;
  background: var(--chrome-tab-divider);
  opacity: 1;
  pointer-events: none;
  transition: opacity 100ms ease-out;
}

.chrome-workbench-tab[data-active="true"] .chrome-workbench-tab__separator,
.chrome-workbench-tab:hover .chrome-workbench-tab__separator,
.chrome-workbench-tab:has(+ .chrome-workbench-tab[data-active="true"])
  .chrome-workbench-tab__separator,
.chrome-workbench-tab:has(+ .chrome-workbench-tab:hover) .chrome-workbench-tab__separator {
  opacity: 0;
}

.chrome-workbench-tabs__new-tab {
  align-self: center;
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  margin: 0 3px 1px 2px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: var(--color-muted-foreground);
  background: transparent;
}

.chrome-workbench-tabs__new-tab:hover {
  color: var(--color-foreground);
  background: color-mix(in srgb, var(--color-foreground) 8%, transparent);
}

.chrome-workbench-tabs__new-tab:active {
  background: color-mix(in srgb, var(--color-foreground) 14%, transparent);
}

.chrome-workbench-tabs__new-tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.chrome-workbench-tab:not([data-active="true"]):not(:hover) .chrome-workbench-tab__close {
  opacity: 0;
  pointer-events: none;
}

.chrome-workbench-tab:not([data-active="true"]):hover .chrome-workbench-tab__close {
  pointer-events: auto;
}

.chrome-workbench-tabs__new-tab--sticky {
  position: sticky;
  z-index: 8;
  right: 4px;
  align-self: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  margin: 0 3px 1px 2px;
  background: var(--chrome-tab-strip);
  isolation: isolate;
}

.chrome-workbench-tabs__new-tab--sticky:hover {
  color: var(--color-foreground);
  background: color-mix(in srgb, var(--color-foreground) 8%, var(--chrome-tab-strip));
}

.chrome-workbench-tabs__new-tab--sticky:active {
  background: color-mix(in srgb, var(--color-foreground) 14%, var(--chrome-tab-strip));
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
  .chrome-workbench-tab__content,
  .chrome-workbench-tab__separator,
  .chrome-workbench-tab__status,
  .chrome-workbench-tab::before {
    transition: none;
    animation: none;
  }

  .chrome-workbench-tabs__scroller {
    scroll-behavior: auto;
  }
}
`
}

function formatCause(cause) {
  if (cause instanceof Error) {
    return cause.message
  }

  return String(cause)
}

function fail(message) {
  console.error('')
  console.error('重构失败：')
  console.error(message)
  process.exit(1)
}