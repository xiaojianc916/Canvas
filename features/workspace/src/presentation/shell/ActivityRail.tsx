import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@hybrid-canvas/design-system'
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
import type { ComponentType } from 'react'

type NavigationIcon = ComponentType<{
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}>

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
  readonly icon: NavigationIcon
}

export interface ActivityRailProps {
  readonly activeItemId?: CanvasNavigationItemId

  readonly items?: readonly CanvasNavigationItem[]

  readonly onItemActivate?: (itemId: CanvasNavigationItemId) => void

  readonly onSettingsOpen: () => void
}

const DEFAULT_NAVIGATION: readonly CanvasNavigationItem[] = [
  {
    id: 'pages',
    label: '画布',
    icon: Grid2X2,
  },
  {
    id: 'search',
    label: '搜索',
    icon: Search,
  },
  {
    id: 'relations',
    label: '关系',
    icon: Network,
  },
  {
    id: 'assets',
    label: '素材',
    icon: Image,
  },
  {
    id: 'extensions',
    label: '插件',
    icon: Boxes,
  },
  {
    id: 'data',
    label: '自动化',
    icon: ChartNoAxesCombined,
  },
  {
    id: 'documents',
    label: '恢复',
    icon: Files,
  },
]

export function ActivityRail({
  activeItemId = 'pages',
  items = DEFAULT_NAVIGATION,
  onItemActivate,
  onSettingsOpen,
}: ActivityRailProps) {
  return (
    <nav
      aria-label="主导航"
      className={['flex h-full min-h-0', 'flex-col items-center', 'bg-sidebar py-2'].join(' ')}
    >
      <div className={['flex flex-col gap-1'].join(' ')}>
        {items.map((item) => (
          <RailButton
            active={item.id === activeItemId}
            icon={item.icon}
            key={item.id}
            label={item.label}
            onClick={() => {
              onItemActivate?.(item.id)
            }}
          />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-1">
        <RailButton icon={Settings} label="设置" onClick={onSettingsOpen} />

        <HelpMenu />
      </div>
    </nav>
  )
}

interface RailButtonProps {
  readonly label: string
  readonly icon: NavigationIcon
  readonly active?: boolean
  readonly onClick?: () => void
}

function RailButton({ label, icon: Icon, active = false, onClick }: RailButtonProps) {
  const className = active
    ? [
        'relative size-9',
        'bg-sidebar-accent',
        'text-muted-foreground',
        'hover:bg-sidebar-accent',
      ].join(' ')
    : ['size-9', 'text-muted-foreground', 'hover:bg-sidebar-accent', 'hover:text-foreground'].join(
        ' ',
      )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-current={active ? 'page' : undefined}
          aria-label={label}
          className={className}
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          {active ? (
            <span
              aria-hidden="true"
              className={['absolute -left-2', 'h-4 w-0.5', 'rounded-r', 'bg-primary'].join(' ')}
            />
          ) : null}

          <Icon aria-hidden="true" className="size-4" />
        </Button>
      </TooltipTrigger>

      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="帮助"
        className={[
          'grid size-9',
          'place-items-center',
          'rounded-md',
          'text-muted-foreground',
          'hover:bg-sidebar-accent',
          'hover:text-foreground',
          'data-[popup-open]:bg-sidebar-accent',
        ].join(' ')}
      >
        <CircleHelp aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className={['w-60 rounded-xl p-2'].join(' ')}
        side="right"
        sideOffset={8}
      >
        <HelpItem external icon={BookOpen} label="文档" />

        <HelpItem external icon={RefreshCcw} label="更新日志" />

        <DropdownMenuSeparator />

        <HelpItem external icon={MessageCircle} label="Discord" />

        <HelpItem icon={MessageCircle} label="反馈" />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface HelpItemProps {
  readonly label: string
  readonly icon: NavigationIcon
  readonly external?: boolean
}

function HelpItem({ label, icon: Icon, external = false }: HelpItemProps) {
  return (
    <DropdownMenuItem className={['min-h-10 gap-3', 'rounded-md'].join(' ')}>
      <Icon aria-hidden="true" className={['size-4', 'text-muted-foreground'].join(' ')} />

      <span className="flex-1">{label}</span>

      {external ? (
        <ExternalLink
          aria-hidden="true"
          className={['size-3.5', 'text-muted-foreground'].join(' ')}
        />
      ) : null}
    </DropdownMenuItem>
  )
}
