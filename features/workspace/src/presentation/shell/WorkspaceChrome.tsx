import type { ReactNode } from 'react'

import { DesktopTitleBar } from './DesktopTitleBar'

export interface CanvasChromeProps {
  readonly rail: ReactNode
  readonly tabs: ReactNode
  readonly onWindowMinimize: () => void
  readonly onWindowMaximize: () => void
  readonly onWindowClose: () => void
  readonly onWindowStartDragging: () => void
  readonly onSidebarToggle: () => void
  readonly isSidebarOpen: boolean
  readonly sidebarWidth: number
}

export function CanvasChrome({
  rail,
  tabs,
  onWindowMinimize,
  onWindowMaximize,
  onWindowClose,
  onWindowStartDragging,
  onSidebarToggle,
  isSidebarOpen,
  sidebarWidth,
}: CanvasChromeProps) {
  return (
    <>
      <div className="row-[2/-1] min-h-0 border-r border-divider" style={{ gridColumn: 1 }}>
        {rail}
      </div>
      <div className="row-1 min-w-0" style={{ gridColumn: '1 / -1' }}>
        <DesktopTitleBar
          onClose={onWindowClose}
          onMaximize={onWindowMaximize}
          onMinimize={onWindowMinimize}
          onStartDragging={onWindowStartDragging}
          onSidebarToggle={onSidebarToggle}
          isSidebarOpen={isSidebarOpen}
          sidebarWidth={sidebarWidth}
        >
          {tabs}
        </DesktopTitleBar>
      </div>
    </>
  )
}
