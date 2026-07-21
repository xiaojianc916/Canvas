import { Button, TooltipProvider } from '@hybrid-canvas/design-system'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { WorkspaceShellProps } from '../../contracts/shell-contract'
import { NoCanvasSurface } from '../empty/NoCanvasSurface'
import { InspectorHost } from '../inspector/InspectorHost'
import { StatusBarHost } from '../status/StatusBarHost'
import { ActivityRail, type CanvasNavigationItemId } from './ActivityRail'
import { SidebarSplitter } from './SidebarSplitter'
import { WorkspaceFrame } from './WorkspaceFrame'
import { WorkspaceSidebar } from './WorkspaceSidebar'

const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 420
const SIDEBAR_DEFAULT_WIDTH = 280
const RAIL_WIDTH = 'var(--activity-rail-width)'

export function WorkspaceShell({
  model,
  actions,
  pages,
  renderChrome,
  editor,
  inspector,
  statusLeft,
  statusRight,
  assistantOverlay,
  overlays,
}: WorkspaceShellProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [isInspectorOpen, setInspectorOpen] = useState(true)
  const [activeNavigationItem, setActiveNavigationItem] = useState<CanvasNavigationItemId>('pages')
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isResizingSidebar, setResizingSidebar] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const hasActiveCanvas = model.activeCanvas !== null
  const sidebarSize = isSidebarOpen ? sidebarWidth : 0
  const gridTemplateColumns = useMemo(
    () =>
      [
        RAIL_WIDTH,
        `${sidebarSize}px`,
        'minmax(0, 1fr)',
        isInspectorOpen && hasActiveCanvas ? 'var(--inspector-width)' : '0px',
      ].join(' '),
    [hasActiveCanvas, isInspectorOpen, sidebarSize],
  )
  const gridTemplateRows = hasActiveCanvas
    ? 'var(--chrome-height) minmax(0, 1fr) var(--status-height)'
    : 'var(--chrome-height) minmax(0, 1fr)'

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!isResizingSidebar || !rootRef.current) return
      const rootRect = rootRef.current.getBoundingClientRect()
      const railWidth = Number.parseFloat(
        getComputedStyle(rootRef.current).getPropertyValue('--activity-rail-width'),
      )
      const nextWidth = event.clientX - rootRect.left - railWidth
      setSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, nextWidth)))
    }

    function handlePointerUp() {
      setResizingSidebar(false)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
  }, [isResizingSidebar])

  const chrome = (
    <header
      className={
        hasActiveCanvas
          ? 'col-span-full row-1 min-h-0 min-w-0 bg-chrome'
          : 'col-span-full row-1 min-h-0 min-w-0 border-b border-divider bg-chrome'
      }
    >
      {renderChrome({
        isSidebarOpen,
        sidebarWidth,
        tabs: model.tabs,
        onSidebarToggle: () => setSidebarOpen((open) => !open),
        onActivateCanvas: actions.activateCanvas,
        onCloseCanvas: actions.closeCanvas,
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
        onItemActivate={(itemId) => {
          setActiveNavigationItem(itemId)
          setSidebarOpen(true)
        }}
        onSettingsOpen={actions.openSettingsWindow}
      />
    </div>
  )

  const sidebar = (
    <div
      className={
        isSidebarOpen
          ? 'relative row-[2/-1] min-h-0 min-w-0 border-r border-divider bg-sidebar'
          : 'relative row-[2/-1] min-h-0 min-w-0 bg-sidebar'
      }
      style={{ gridColumn: 2 }}
    >
      {isSidebarOpen ? (
        <WorkspaceSidebar
          activeNavigationItem={activeNavigationItem}
          onActivatePage={actions.activatePage}
          onClose={() => setSidebarOpen(false)}
          onCreatePage={actions.createPage}
          pages={pages}
        />
      ) : null}
      {isSidebarOpen ? (
        <SidebarSplitter
          onCollapse={() => setSidebarOpen(false)}
          onResizeStart={() => setResizingSidebar(true)}
        />
      ) : null}
    </div>
  )

  const canvas = (
    <section
      aria-label="内容区"
      className="row-2 min-h-0 min-w-0 overflow-hidden"
      style={{ gridColumn: 3 }}
    >
      <main className="relative h-full min-h-0 min-w-0 overflow-hidden">
        {hasActiveCanvas ? (
          editor
        ) : (
          <NoCanvasSurface
            onCreateDocument={actions.createCanvas}
            onOpenDocument={actions.openCanvas}
          />
        )}
      </main>
    </section>
  )

  const inspectorDock = hasActiveCanvas ? (
    <aside
      aria-label="属性检查器"
      className={
        isInspectorOpen
          ? 'row-[2/-1] min-h-0 min-w-0 border-l border-divider'
          : 'pointer-events-none'
      }
      style={{ gridColumn: 4 }}
    >
      {isInspectorOpen ? (
        <div className="relative h-full">
          <Button
            aria-label="收起属性面板"
            className="absolute -left-8 top-3 z-30 size-7 rounded-l-md rounded-r-none border border-r-0 bg-background/95 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
            onClick={() => setInspectorOpen(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <PanelRightClose className="size-3.5" />
          </Button>
          <InspectorHost>{inspector}</InspectorHost>
        </div>
      ) : (
        <Button
          aria-label="展开属性面板"
          className="pointer-events-auto absolute right-0 top-(--chrome-height) z-30 size-8 rounded-l-md rounded-r-none border border-r-0 bg-background/95 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
          onClick={() => setInspectorOpen(true)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <PanelRightOpen className="size-4" />
        </Button>
      )}
    </aside>
  ) : null

  const statusBar = hasActiveCanvas ? (
    <div className="min-w-0" style={{ gridColumn: 3, gridRow: 3 }}>
      <StatusBarHost left={statusLeft} right={statusRight} />
    </div>
  ) : null

  return (
    <TooltipProvider delayDuration={450}>
      <WorkspaceFrame
        rootRef={rootRef}
        chrome={chrome}
        rail={rail}
        sidebar={sidebar}
        canvas={canvas}
        inspector={inspectorDock}
        statusBar={statusBar}
        overlays={
          <>
            {assistantOverlay}
            {overlays}
          </>
        }
        gridTemplateColumns={gridTemplateColumns}
        gridTemplateRows={gridTemplateRows}
      />
    </TooltipProvider>
  )
}
