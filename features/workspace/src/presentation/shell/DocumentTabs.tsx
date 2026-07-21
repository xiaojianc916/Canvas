import { Button, cn } from '@hybrid-canvas/design-system'
import { Plus, X } from 'lucide-react'
import { forwardRef, useLayoutEffect, useRef, useState } from 'react'

import type { CanvasSessionId, CanvasTabViewModel } from '../../contracts/workbench-contract'

export interface CanvasTabsProps {
  readonly tabs: readonly CanvasTabViewModel[]
  readonly onActivate: (sessionId: CanvasSessionId) => void
  readonly onClose: (sessionId: CanvasSessionId) => void
  readonly onCreate: () => void
}

interface SurfaceGeometry {
  readonly width: number
  readonly height: number
  readonly path: string
}

const EMPTY_SURFACE: SurfaceGeometry = { width: 1, height: 1, path: '' }
const TAB_WIDTH = 210
const TAB_TOP = 5
const TOP_RADIUS = 12
const OUTER_RADIUS = 15
const BEZIER_CIRCLE = 0.5522848

export function DocumentTabs({ tabs, onActivate, onClose, onCreate }: CanvasTabsProps) {
  const shellRef = useRef<HTMLElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef(new Map<CanvasSessionId, HTMLButtonElement>())
  const [surface, setSurface] = useState<SurfaceGeometry>(EMPTY_SURFACE)
  const activeSessionId = tabs.find((tab) => tab.isActive)?.sessionId
  const surfaceRef = useRef<SurfaceGeometry>(EMPTY_SURFACE)

  useLayoutEffect(() => {
    const shell = shellRef.current
    const scroller = scrollerRef.current
    if (!shell) return

    const updateSurface = () => {
      const activeTab = activeSessionId ? tabRefs.current.get(activeSessionId) : undefined
      const width = shell.clientWidth
      const height = shell.clientHeight

      if (!activeTab || width === 0 || height === 0) {
        const next = { width: Math.max(width, 1), height: Math.max(height, 1), path: '' }
        surfaceRef.current = next
        setSurface(next)
        return
      }

      const shellRect = shell.getBoundingClientRect()
      const tabRect = activeTab.getBoundingClientRect()
      const left = tabRect.left - shellRect.left
      const right = tabRect.right - shellRect.left
      const baseline = height
      const sideBottom = baseline - OUTER_RADIUS
      const outerControl = OUTER_RADIUS * BEZIER_CIRCLE
      const topControl = TOP_RADIUS * BEZIER_CIRCLE

      const path = [
        `M 0 ${baseline}`,
        `L ${left - OUTER_RADIUS} ${baseline}`,
        `C ${left - OUTER_RADIUS + outerControl} ${baseline} ${left} ${sideBottom + outerControl} ${left} ${sideBottom}`,
        `L ${left} ${TAB_TOP + TOP_RADIUS}`,
        `C ${left} ${TAB_TOP + TOP_RADIUS - topControl} ${left + TOP_RADIUS - topControl} ${TAB_TOP} ${left + TOP_RADIUS} ${TAB_TOP}`,
        `L ${right - TOP_RADIUS} ${TAB_TOP}`,
        `C ${right - TOP_RADIUS + topControl} ${TAB_TOP} ${right} ${TAB_TOP + TOP_RADIUS - topControl} ${right} ${TAB_TOP + TOP_RADIUS}`,
        `L ${right} ${sideBottom}`,
        `C ${right} ${sideBottom + outerControl} ${right + OUTER_RADIUS - outerControl} ${baseline} ${right + OUTER_RADIUS} ${baseline}`,
        `L ${width} ${baseline}`,
        `L ${width} ${height}`,
        `L 0 ${height}`,
        'Z',
      ].join(' ')

      const previous = surfaceRef.current
      if (previous.width === width && previous.height === height && previous.path === path) return
      const next = { width, height, path }
      surfaceRef.current = next
      setSurface(next)
    }

    updateSurface()
    const observer = new ResizeObserver(updateSurface)
    observer.observe(shell)
    if (scroller) observer.observe(scroller)
    scroller?.addEventListener('scroll', updateSurface, { passive: true })

    return () => {
      observer.disconnect()
      scroller?.removeEventListener('scroll', updateSurface)
    }
  }, [activeSessionId, tabs.length])

  return (
    <header ref={shellRef} className="relative h-full min-w-0 flex-1 overflow-hidden bg-chrome">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${surface.width} ${surface.height}`}
      >
        <path
          d={surface.path}
          fill="var(--color-background)"
          shapeRendering="geometricPrecision"
          stroke="var(--color-divider)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div
        ref={scrollerRef}
        aria-label="已打开文档"
        className="relative z-10 flex h-full min-w-0 items-end overflow-x-auto overflow-y-hidden px-7"
        role="tablist"
      >
        <div className="flex h-full min-w-max items-end gap-1.25">
          {tabs.map((tab) => (
            <DocumentTab
              key={tab.sessionId}
              model={tab}
              onActivate={onActivate}
              onClose={onClose}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.sessionId, node)
                else tabRefs.current.delete(tab.sessionId)
              }}
            />
          ))}
        </div>

        <div className="flex h-full shrink-0 items-center pb-px pl-2">
          <button
            aria-label="新建文档"
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition-[color,background-color] duration-150 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            onClick={onCreate}
            type="button"
          >
            <Plus className="size-4.5" strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </header>
  )
}

interface DocumentTabProps {
  readonly model: CanvasTabViewModel
  readonly onActivate: (sessionId: CanvasSessionId) => void
  readonly onClose: (sessionId: CanvasSessionId) => void
}

const DocumentTab = forwardRef<HTMLButtonElement, DocumentTabProps>(function DocumentTab(
  { model, onActivate, onClose },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-selected={model.isActive}
      className={cn(
        'group mb-0 flex h-[calc(100%-5px)] shrink-0 items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3.5 text-sm outline-none transition-[color,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-3px]',
        model.isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:bg-foreground/5.5 hover:text-foreground',
      )}
      onClick={() => onActivate(model.sessionId)}
      role="tab"
      style={{ width: TAB_WIDTH }}
      tabIndex={model.isActive ? 0 : -1}
      type="button"
    >
      <DocumentIcon />
      <span className="min-w-0 flex-1 truncate text-left">{model.title}</span>
      {model.status === 'dirty' ? (
        <span aria-label="未保存" className="size-2 shrink-0 rounded-full bg-amber-500" />
      ) : null}
      {model.status === 'saving' ? (
        <span
          aria-label="正在保存"
          className="size-2 shrink-0 animate-pulse rounded-full bg-sky-500"
        />
      ) : null}
      {model.status === 'failed' ? (
        <span aria-label="保存失败" className="size-2 shrink-0 rounded-full bg-destructive" />
      ) : null}
      {model.canClose ? (
        <Button
          aria-label={`关闭 ${model.title}`}
          className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-black/7 hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onClose(model.sessionId)
          }}
          size="icon"
          tabIndex={-1}
          type="button"
          variant="ghost"
        >
          <X className="size-4" strokeWidth={1.7} />
        </Button>
      ) : null}
    </button>
  )
})

function DocumentIcon() {
  return (
    <svg aria-hidden="true" className="size-4.5 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle cx="6" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 7.2 10.8 15.8M16 7.2 13.2 15.8M8.3 6h7.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}
