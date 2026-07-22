import type { ReactNode } from 'react'

import type { CanvasSessionId, CanvasTabViewModel, WorkbenchViewModel } from './public-api'

export interface CanvasPageViewModel {
  readonly id: string
  readonly title: string
  readonly isActive: boolean
}

export interface WorkspaceShellActions {
  readonly createCanvas: () => void
  readonly openCanvas: () => void
  readonly activateCanvas: (sessionId: CanvasSessionId) => void
  readonly closeCanvas: (sessionId: CanvasSessionId) => void
  readonly activatePage: (pageId: string) => void
  readonly createPage: () => void
  readonly openCommandPalette: () => void
  readonly openSettingsWindow: () => void
}

export interface WorkspaceChromeRenderProps {
  readonly isSidebarOpen: boolean
  readonly sidebarWidth: number
  readonly tabs: readonly CanvasTabViewModel[]
  readonly onSidebarToggle: () => void
  readonly onActivateCanvas: (sessionId: CanvasSessionId) => void
  readonly onCloseCanvas: (sessionId: CanvasSessionId) => void
  readonly onCreateCanvas: () => void
}

export interface WorkspaceShellProps {
  readonly model: WorkbenchViewModel
  readonly actions: WorkspaceShellActions
  readonly pages: readonly CanvasPageViewModel[]
  readonly renderChrome: (props: WorkspaceChromeRenderProps) => ReactNode
  readonly editor: ReactNode
  readonly inspector: ReactNode
  readonly statusLeft: ReactNode
  readonly statusRight?: ReactNode
  readonly assistantOverlay?: ReactNode
  readonly overlays?: ReactNode
}
