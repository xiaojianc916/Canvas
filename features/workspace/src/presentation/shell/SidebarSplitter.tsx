export interface SidebarSplitterProps {
  readonly width: number
  readonly min: number
  readonly max: number
  readonly onResizeStart: () => void
  readonly onResize: (width: number) => void
  readonly onCollapse: () => void
}

export function SidebarSplitter({
  width,
  min,
  max,
  onResizeStart,
  onResize,
  onCollapse,
}: SidebarSplitterProps) {
  const clamp = (nextWidth: number) => {
    return Math.max(min, Math.min(max, nextWidth))
  }

  return (
    <div
      aria-label="调整侧边栏宽度"
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={Math.round(width)}
      className={[
        'absolute right-0 top-0',
        'z-20 h-full w-2',
        'translate-x-1/2',
        'cursor-col-resize',
        'bg-transparent',
        'outline-none',
        'hover:bg-primary/15',
        'focus-visible:bg-primary/25',
      ].join(' ')}
      onDoubleClick={onCollapse}
      onKeyDown={(event) => {
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault()

            onResize(clamp(width - 16))
            break

          case 'ArrowRight':
            event.preventDefault()

            onResize(clamp(width + 16))
            break

          case 'Home':
            event.preventDefault()
            onResize(min)
            break

          case 'End':
            event.preventDefault()
            onResize(max)
            break
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return
        }

        event.preventDefault()

        document.body.style.cursor = 'col-resize'

        document.body.style.userSelect = 'none'

        onResizeStart()
      }}
      role="separator"
      tabIndex={0}
    />
  )
}
