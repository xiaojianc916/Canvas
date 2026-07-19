import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@hybrid-canvas/design-system'
import { Grid2X2, HelpCircle, PanelLeftOpen, Settings } from 'lucide-react'

export interface ActivityRailProps {
  readonly isSidebarOpen: boolean
  readonly onSidebarOpen: () => void
  readonly onSettingsOpen: () => void
}

export function ActivityRail({ isSidebarOpen, onSidebarOpen, onSettingsOpen }: ActivityRailProps) {
  return (
    <nav
      aria-label="主导航"
      className="flex min-h-0 flex-col items-center border-r bg-sidebar px-1.5 py-2"
    >
      <div className="flex flex-col gap-1">
        {!isSidebarOpen ? (
          <RailButton
            icon={<PanelLeftOpen className="size-4" />}
            label="展开侧栏"
            onClick={onSidebarOpen}
          />
        ) : null}
        <RailButton active icon={<Grid2X2 className="size-4" />} label="画布" />
      </div>
      <div className="flex-1" />
      <div className="flex flex-col gap-1">
        <RailButton icon={<Settings className="size-4" />} label="设置" onClick={onSettingsOpen} />
        <RailButton icon={<HelpCircle className="size-4" />} label="帮助" />
      </div>
    </nav>
  )
}

interface RailButtonProps {
  readonly label: string
  readonly icon: React.JSX.Element
  readonly active?: boolean
  readonly onClick?: () => void
}

function RailButton({ label, icon, active = false, onClick }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-current={active ? 'page' : undefined}
          aria-label={label}
          className={
            active
              ? 'relative size-8 bg-sidebar-accent text-primary hover:text-primary'
              : 'size-8 text-muted-foreground'
          }
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          {active ? (
            <span className="absolute -left-1.5 h-4 w-0.5 rounded-full bg-primary" />
          ) : null}
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
