export { WorkspaceShell } from './shell/WorkspaceShell'
export { CanvasChrome, type CanvasChromeProps } from './shell/WorkspaceChrome'
export type { WorkspaceShellProps } from '../contracts/shell-contract'
export { ActivityRail } from './shell/ActivityRail'
export { CanvasTabs, type CanvasTabsProps } from './shell/CanvasTabs'
export { WorkspaceSidebar } from './shell/WorkspaceSidebar'
export { NoCanvasSurface } from './empty/NoCanvasSurface'
export { InspectorHost } from './inspector/InspectorHost'
export { StatusBarHost } from './status/StatusBarHost'
export { CommandPalette, type CommandPaletteProps } from './commands/CommandPalette'
export {
  CommandProvider,
  type CommandProviderProps,
  useCommands,
} from './commands/CommandProvider'
