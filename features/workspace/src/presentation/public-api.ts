export type { WorkspaceShellProps } from '../contracts/shell-contract'

export {
  CommandPalette,
  type CommandPaletteProps,
} from './commands/CommandPalette'

export {
  CommandProvider,
  type CommandProviderProps,
  useCommands,
} from './commands/CommandProvider'

export { NoCanvasSurface } from './empty/NoCanvasSurface'

export { InspectorHost } from './inspector/InspectorHost'

export { ActivityRail } from './shell/ActivityRail'

export {
  WorkbenchTabs,
  type WorkbenchTabsProps,
} from './shell/WorkbenchTabs'

export { WorkspaceShell } from './shell/WorkspaceShell'

export {
  WorkspaceSurface,
  type WorkspaceSurfaceProps,
} from './shell/WorkspaceSurface'

export { WorkspaceSidebar } from './shell/WorkspaceSidebar'

export { StatusBarHost } from './status/StatusBarHost'
