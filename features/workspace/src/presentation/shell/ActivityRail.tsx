import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@hybrid-canvas/design-system'
import { Boxes, ChartNoAxesCombined, CircleHelp, Files, Grid2X2, Image, Layers3, Network, PanelLeftOpen, Search, Settings, SlidersHorizontal } from 'lucide-react'
import type { ComponentType } from 'react'

export interface ActivityRailProps {
  readonly isSidebarOpen: boolean
  readonly onSidebarOpen: () => void
  readonly onSettingsOpen: () => void
}

const navigation: readonly { readonly label: string; readonly icon: ComponentType<{ className?: string }>; readonly active?: boolean }[] = [
  { label: '画布', icon: Grid2X2, active: true }, { label: '文件', icon: Files }, { label: '搜索', icon: Search },
  { label: '图层', icon: Layers3 }, { label: '关系图谱', icon: Network }, { label: '数据', icon: ChartNoAxesCombined },
  { label: '资源', icon: Image }, { label: '插件', icon: Boxes }, { label: '诊断', icon: SlidersHorizontal },
]

export function ActivityRail({ isSidebarOpen, onSidebarOpen, onSettingsOpen }: ActivityRailProps) {
  return (
    <nav aria-label="主导航" className="flex h-full min-h-0 flex-col items-center bg-sidebar py-2">
      <div className="flex flex-col gap-1">
        {!isSidebarOpen ? <RailButton icon={PanelLeftOpen} label="展开侧栏" onClick={onSidebarOpen} /> : null}
        {navigation.map(({ active, icon, label }) => <RailButton active={active ?? false} icon={icon} key={label} label={label} />)}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col gap-1">
        <RailButton icon={Settings} label="设置" onClick={onSettingsOpen} />
        <RailButton icon={CircleHelp} label="帮助" />
      </div>
    </nav>
  )
}

function RailButton({ label, icon: Icon, active = false, onClick }: { readonly label: string; readonly icon: ComponentType<{ className?: string }>; readonly active?: boolean; readonly onClick?: () => void }) {
  return <Tooltip><TooltipTrigger asChild><Button aria-current={active ? 'page' : undefined} aria-label={label} className={active ? 'relative size-8 bg-sidebar-accent text-primary' : 'size-8 text-muted-foreground'} onClick={onClick} size="icon" type="button" variant="ghost">{active ? <span className="absolute -left-2 h-4 w-0.5 rounded-r bg-primary" /> : null}<Icon className="size-4" /></Button></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
}
