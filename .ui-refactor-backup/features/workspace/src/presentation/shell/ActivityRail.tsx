import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@hybrid-canvas/design-system'
import {
  BookOpen,
  Boxes,
  ChartNoAxesCombined,
  CircleHelp,
  ExternalLink,
  Files,
  Grid2X2,
  Image,
  MessageCircle,
  Network,
  RefreshCcw,
  Search,
  Settings,
} from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType } from 'react'

export type CanvasNavigationItemId =
  | 'pages'
  | 'documents'
  | 'search'
  | 'layers'
  | 'relations'
  | 'data'
  | 'assets'
  | 'extensions'

export interface CanvasNavigationItem {
  readonly id: CanvasNavigationItemId
  readonly label: string
  readonly icon: ComponentType<{ className?: string }>
}

export interface ActivityRailProps {
  readonly activeItemId?: CanvasNavigationItemId
  readonly items?: readonly CanvasNavigationItem[]
  readonly onItemActivate?: (itemId: CanvasNavigationItemId) => void
  readonly onSettingsOpen: () => void
}

const DEFAULT_NAVIGATION: readonly CanvasNavigationItem[] = [
  { id: 'pages', label: '画布', icon: Grid2X2 },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'relations', label: '关系', icon: Network },
  { id: 'assets', label: '素材', icon: Image },
  { id: 'extensions', label: '插件', icon: Boxes },
  { id: 'data', label: '自动化', icon: ChartNoAxesCombined },
  { id: 'documents', label: '恢复', icon: Files },
]

export function ActivityRail({
  activeItemId = 'pages',
  items = DEFAULT_NAVIGATION,
  onItemActivate,
  onSettingsOpen,
}: ActivityRailProps) {
  const [isHelpOpen, setHelpOpen] = useState(false)
  const helpMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isHelpOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!helpMenuRef.current?.contains(event.target as Node)) {
        setHelpOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setHelpOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isHelpOpen])

  return (
    <nav aria-label="主导航" className="flex h-full min-h-0 flex-col items-center bg-sidebar py-2">
      <div className="flex flex-col gap-1">
        {items.map(({ icon, id, label }) => (
          <RailButton
            active={id === activeItemId}
            icon={icon}
            key={id}
            label={label}
            onClick={() => onItemActivate?.(id)}
          />
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col gap-1">
        <RailButton icon={Settings} label="设置" onClick={onSettingsOpen} />
        <div className="relative" ref={helpMenuRef}>
          <RailButton icon={CircleHelp} label="帮助" onClick={() => setHelpOpen((open) => !open)} />
          {isHelpOpen ? <HelpMenu /> : null}
        </div>
      </div>
    </nav>
  )
}

function RailButton({
  label,
  icon: Icon,
  active = false,
  onClick,
}: {
  readonly label: string
  readonly icon: ComponentType<{ className?: string }>
  readonly active?: boolean
  readonly onClick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-current={active ? 'page' : undefined}
          aria-label={label}
          className={
            active
              ? 'relative size-8 bg-sidebar-accent text-primary hover:bg-sidebar-accent hover:text-primary'
              : 'size-8 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
          }
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          {active ? <span className="absolute -left-2 h-4 w-0.5 rounded-r bg-primary" /> : null}
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function HelpMenu() {
  const helpItems = [
    { label: '文档', icon: BookOpen },
    { label: '更新日志', icon: RefreshCcw },
    { label: 'Discord', icon: MessageCircle },
    { label: '反馈', icon: MessageCircle },
  ] satisfies readonly { label: string; icon: ComponentType<{ className?: string }> }[]

  return (
    <div className="absolute bottom-0 left-10 z-50 w-60 rounded-2xl border border-black/5 bg-white p-3 text-foreground shadow-2xl shadow-black/15">
      <div className="flex flex-col gap-1">
        {helpItems.map(({ icon: Icon, label }) => (
          <button
            aria-label={label}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-xl leading-none hover:bg-sidebar-accent"
            key={label}
            type="button"
          >
            <Icon className="size-5 shrink-0 stroke-[2.2] text-black" />
            <span className="min-w-0 flex-1">{label}</span>
            {label === '反馈' ? null : (
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
