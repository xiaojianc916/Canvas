export { WorkspaceShell } from './shell/WorkspaceShell'
export { CanvasChrome, type CanvasChromeProps } from './shell/WorkspaceChrome'
export type { WorkspaceShellProps } from '../contracts/shell-contract'
export { ActivityRail } from './shell/ActivityRail'
export { DocumentTabs, type CanvasTabsProps } from './shell/DocumentTabs'
export { WorkspaceSidebar } from './shell/WorkspaceSidebar'
export { NoDocumentSurface } from './empty/NoDocumentSurface'
export { InspectorHost } from './inspector/InspectorHost'
export { StatusBarHost } from './status/StatusBarHost'
export { CommandPalette, type CommandPaletteProps } from './commands/CommandPalette'
export {
  CommandProvider,
  type CommandProviderProps,
  useCommands,
} from './commands/CommandProvider'
