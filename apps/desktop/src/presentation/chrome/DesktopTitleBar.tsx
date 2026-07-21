import { Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react'

export interface DesktopTitleBarProps {
  readonly children: React.ReactNode
  readonly onMinimize: () => void
  readonly onMaximize: () => void
  readonly onClose: () => void
  readonly onStartDragging: () => void
  readonly onSidebarToggle: () => void
  readonly isSidebarOpen: boolean
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
  sidebarWidth,
}: DesktopTitleBarProps) {
  function handleDragMouseDown(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) {
      return
    }
    if (event.detail === 2) {
      onMaximize()
      return
    }
    onStartDragging()
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 bg-chrome" data-tauri-drag-region>
      {/* Chrome owns drag behavior; only button elements opt out. */}
      <div className="flex h-full min-h-0 w-full items-stretch" onMouseDown={handleDragMouseDown}>
        <div
          className="flex w-(--activity-rail-width) shrink-0 items-center justify-center border-b border-divider"
          data-tauri-drag-region
        >
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
          className="shrink-0 border-b border-r border-divider"
          data-tauri-drag-region
          style={{ width: isSidebarOpen ? sidebarWidth : 0 }}
        />
        <div className="flex min-w-0 flex-1 items-stretch" data-tauri-drag-region>
          {children}
        </div>
        <div className="flex shrink-0 items-stretch border-b border-divider" data-tauri-drag-region>
          <button
            aria-label="最小化"
            className="grid w-11 place-items-center text-muted-foreground hover:bg-black/5 hover:text-foreground"
            onClick={onMinimize}
            type="button"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            aria-label="最大化或还原"
            className="grid w-11 place-items-center text-muted-foreground hover:bg-black/5 hover:text-foreground"
            onClick={onMaximize}
            type="button"
          >
            <Square className="size-3" />
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
