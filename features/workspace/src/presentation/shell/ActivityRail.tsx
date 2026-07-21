import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@hybrid-canvas/design-system'
import {
  Boxes,
  ChartNoAxesCombined,
  CircleHelp,
  Files,
  Grid2X2,
  Image,
  Network,
  Search,
  Settings,
} from 'lucide-react'
import type { ComponentType } from 'react'

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
        <RailButton icon={CircleHelp} label="帮助" />
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
              ? 'relative size-8 bg-sidebar-accent text-primary'
              : 'size-8 text-muted-foreground'
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
