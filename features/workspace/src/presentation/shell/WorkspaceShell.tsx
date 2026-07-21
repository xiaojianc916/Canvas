import { Button, TooltipProvider } from '@hybrid-canvas/design-system'
import { BotMessageSquare, PanelRightClose, PanelRightOpen, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { WorkspaceShellProps } from '../../contracts/shell-contract'
import { NoDocumentSurface } from '../empty/NoDocumentSurface'
import { InspectorHost } from '../inspector/InspectorHost'
import { StatusBarHost } from '../status/StatusBarHost'
import { ActivityRail, type CanvasNavigationItemId } from './ActivityRail'
import { DesktopTitleBar } from './DesktopTitleBar'
import { DocumentTabs } from './DocumentTabs'
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
  editor,
  inspector,
  statusLeft,
  statusRight,
}: WorkspaceShellProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [isInspectorOpen, setInspectorOpen] = useState(true)
  const [isAiChatOpen, setAiChatOpen] = useState(false)
  const [activeNavigationItem, setActiveNavigationItem] = useState<CanvasNavigationItemId>('pages')
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isResizingSidebar, setResizingSidebar] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const hasActiveCanvas = model.activeCanvas !== null
  const sidebarSize = isSidebarOpen ? sidebarWidth : 0
  const gridTemplateColumns = useMemo(
    () => [RAIL_WIDTH, `${sidebarSize}px`, 'minmax(0, 1fr)', isInspectorOpen && hasActiveCanvas ? 'var(--inspector-width)' : '0px'].join(' '),
    [hasActiveCanvas, isInspectorOpen, sidebarSize],
  )
  const gridTemplateRows = hasActiveDocument
    ? 'var(--chrome-height) minmax(0, 1fr) var(--status-height)'
    : 'var(--chrome-height) minmax(0, 1fr)'

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!isResizingSidebar || !rootRef.current) return
      const rootRect = rootRef.current.getBoundingClientRect()
      const railWidth = Number.parseFloat(getComputedStyle(rootRef.current).getPropertyValue('--activity-rail-width'))
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
    }
  }, [isResizingSidebar])

  const chrome = (
    <header className={hasActiveDocument
      ? 'col-span-full row-1 min-h-0 min-w-0 bg-chrome'
      : 'col-span-full row-1 min-h-0 min-w-0 border-b border-divider bg-chrome'}>
      <DesktopTitleBar
        onClose={actions.closeWindow}
        onMaximize={actions.maximizeWindow}
        onMinimize={actions.minimizeWindow}
        onStartDragging={actions.startWindowDragging}
        onSidebarToggle={() => setSidebarOpen((open) => !open)}
        isSidebarOpen={isSidebarOpen}
        sidebarWidth={sidebarWidth}
      >
        <DocumentTabs
          onActivate={actions.activateCanvas}
          onClose={actions.closeCanvas}
          onCreate={actions.createCanvas}
          tabs={model.tabs}
        />
      </DesktopTitleBar>
    </header>
  )

  const rail = (
    <div className="row-[2/-1] min-h-0 border-r border-divider bg-sidebar" style={{ gridColumn: 1 }}>
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
      className={isSidebarOpen
        ? 'relative row-[2/-1] min-h-0 min-w-0 border-r border-divider bg-sidebar'
        : 'relative row-[2/-1] min-h-0 min-w-0 bg-sidebar'}
      style={{ gridColumn: 2 }}
    >
      {isSidebarOpen ? (
        <WorkspaceSidebar
          activeNavigationItem={activeNavigationItem}
          onActivatePage={actions.activatePage}
          onClose={() => setSidebarOpen(false)}
          onCreatePage={actions.createPage}
          pages={model.activeCanvas?.pages ?? []}
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
    <section aria-label="内容区" className="row-2 min-h-0 min-w-0 overflow-hidden" style={{ gridColumn: 3 }}>
      <main className="relative h-full min-h-0 min-w-0 overflow-hidden">
        {hasActiveDocument ? (
          editor
        ) : (
          <NoDocumentSurface onCreateDocument={actions.createCanvas} onOpenDocument={actions.openCanvas} />
        )}
      </main>
    </section>
  )

  const inspectorDock = hasActiveDocument ? (
    <aside
      aria-label="属性检查器"
      className={isInspectorOpen ? 'row-[2/-1] min-h-0 min-w-0 border-l border-divider' : 'pointer-events-none'}
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

  const statusBar = hasActiveDocument ? (
    <div className="min-w-0" style={{ gridColumn: 3, gridRow: 3 }}>
      <StatusBarHost left={statusLeft} right={statusRight} />
    </div>
  ) : null

  return (
    <TooltipProvider delayDuration={450}>
      <WorkspaceFrame
        chrome={chrome}
        rail={rail}
        sidebar={sidebar}
        canvas={canvas}
        inspector={inspectorDock}
        statusBar={statusBar}
        overlays={<AiChatWidget open={isAiChatOpen} onOpenChange={setAiChatOpen} />}
        gridTemplateColumns={gridTemplateColumns}
        gridTemplateRows={gridTemplateRows}
      />
    </TooltipProvider>
  )
}

function AiChatWidget({
  open,
  onOpenChange,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-50">
      {open ? (
        <div className="pointer-events-auto mb-3 w-90 overflow-hidden rounded-2xl border border-divider bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BotMessageSquare className="size-4" />
              AI Chat
            </div>
            <Button aria-label="关闭 AI Chat" onClick={() => onOpenChange(false)} size="icon" type="button" variant="ghost">
              <X className="size-4" />
            </Button>
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-xl bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
              这里可以接入你的 AI 对话能力，支持基于当前画布上下文进行问答、总结和生成操作。
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-divider bg-background px-3 py-2">
              <Sparkles className="size-4 shrink-0 text-muted-foreground" />
              <input
                aria-label="输入 AI 问题"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="问我任何关于画布的问题…"
                type="text"
              />
            </div>
          </div>
        </div>
      ) : null}
      <Button
        aria-label="打开 AI Chat"
        className="pointer-events-auto size-14 rounded-full shadow-xl"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <BotMessageSquare className="size-5" />
      </Button>
    </div>
  )
}
