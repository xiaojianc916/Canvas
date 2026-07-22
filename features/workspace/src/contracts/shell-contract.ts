import type { ReactNode } from 'react'

import type {
  WorkbenchTabId,
  WorkbenchTabViewModel,
  WorkbenchViewModel,
  WorkspaceSurfaceId,
} from './public-api'

export interface CanvasPageViewModel {
  readonly id: string
  readonly title: string
  readonly isActive: boolean
}

export interface WorkspaceShellActions {
  readonly createCanvas: () => void
  readonly openCanvas: () => void
  readonly activateTab: (tabId: WorkbenchTabId) => void
  readonly closeTab: (tabId: WorkbenchTabId) => void
  readonly moveTab: (tabId: WorkbenchTabId, targetIndex: number) => void
  readonly openWorkspaceSurface: (surfaceId: WorkspaceSurfaceId, title: string) => void
  readonly activatePage: (pageId: string) => void
  readonly createPage: () => void
  readonly openCommandPalette: () => void
  readonly openSettingsWindow: () => void
}

export interface WorkspaceChromeRenderProps {
  readonly isSidebarOpen: boolean
  readonly sidebarWidth: number
  readonly tabs: readonly WorkbenchTabViewModel[]
  readonly onSidebarToggle: () => void
  readonly onActivateTab: (tabId: WorkbenchTabId) => void
  readonly onCloseTab: (tabId: WorkbenchTabId) => void
  readonly onMoveTab: (tabId: WorkbenchTabId, targetIndex: number) => void
  readonly onCreateCanvas: () => void
}

export interface WorkspaceShellProps {
  readonly model: WorkbenchViewModel
  readonly actions: WorkspaceShellActions
  readonly pages: readonly CanvasPageViewModel[]
  readonly renderChrome: (props: WorkspaceChromeRenderProps) => ReactNode
  readonly mainContent: ReactNode
  readonly inspector: ReactNode
  /**
   * 当前编辑器选区标识。
   * 仅用于请求显示属性面板，不承载画布文档状态。
   */
  readonly inspectorSelectionKey?: string
  readonly statusLeft: ReactNode
  readonly statusRight?: ReactNode
  readonly assistantOverlay?: ReactNode
  readonly overlays?: ReactNode
}
