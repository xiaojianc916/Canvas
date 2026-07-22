import { Button, TooltipProvider } from '@hybrid-canvas/design-system'
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
    const handlePointerMove = (event: PointerEvent) => {
      if (!isResizing || !rootRef.current) {
        return
      }

      const rectangle = rootRef.current.getBoundingClientRect()
      const style = window.getComputedStyle(rootRef.current)
      const railWidth = Number.parseFloat(style.getPropertyValue('--activity-rail-width')) || 48

      const width = event.clientX - rectangle.left - railWidth

      setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, width)))
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
      className="row-2 min-h-0 min-w-0 overflow-hidden"
      style={{ gridColumn: 3 }}
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
              <PanelRightClose aria-hidden="true" className="size-3.5" />
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
    <div className="min-w-0" style={{ gridColumn: 3, gridRow: 3 }}>
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
