import { Button } from '@hybrid-canvas/design-system'
import { useEffect } from 'react'

export interface SidebarSplitterProps {
  readonly onResizeStart: () => void
  readonly onCollapse: () => void
}

export function SidebarSplitter({ onResizeStart, onCollapse }: SidebarSplitterProps) {
  useEffect(() => {
    return () => {
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
  }, [])

  return (
    <Button
      aria-label="调整侧边栏宽度"
      className="absolute right-0 top-0 z-20 h-full w-1 translate-x-1/2 cursor-col-resize rounded-none bg-transparent p-0 hover:bg-primary/20"
      onDoubleClick={onCollapse}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        onResizeStart()
      }}
      size="icon"
      type="button"
      variant="ghost"
    />
  )
}
