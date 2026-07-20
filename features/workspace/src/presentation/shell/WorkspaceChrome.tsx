import type { ReactNode } from 'react'

import { DesktopTitleBar } from './DesktopTitleBar'

export interface CanvasChromeProps {
  readonly rail: ReactNode
  readonly tabs: ReactNode
  readonly onWindowMinimize: () => void
  readonly onWindowMaximize: () => void
  readonly onWindowClose: () => void
  readonly onWindowStartDragging: () => void
}

export function CanvasChrome({
  rail,
  tabs,
  onWindowMinimize,
  onWindowMaximize,
  onWindowClose,
  onWindowStartDragging,
}: CanvasChromeProps) {
  return (
    <>
      <div className="row-[2/-1] min-h-0 border-r border-divider">{rail}</div>
      <div className="col-span-full row-1 min-w-0">
        <DesktopTitleBar
          onClose={onWindowClose}
          onMaximize={onWindowMaximize}
          onMinimize={onWindowMinimize}
          onStartDragging={onWindowStartDragging}
        >
          {tabs}
        </DesktopTitleBar>
      </div>
    </>
  )
}
