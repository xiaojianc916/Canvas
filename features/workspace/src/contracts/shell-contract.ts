import type { ReactNode } from 'react'

import type { CanvasSessionId, PageId, WorkbenchViewModel } from './public-api'

export interface WorkspaceShellActions {
  readonly createCanvas: () => void
  readonly openCanvas: () => void
  readonly activateCanvas: (sessionId: CanvasSessionId) => void
  readonly closeCanvas: (sessionId: CanvasSessionId) => void
  readonly activatePage: (pageId: PageId) => void
  readonly createPage: () => void
  readonly openCommandPalette: () => void
  readonly openSettingsWindow: () => void
  readonly minimizeWindow: () => void
  readonly maximizeWindow: () => void
  readonly closeWindow: () => void
  readonly startWindowDragging: () => void
}

export interface WorkspaceShellProps {
  readonly model: WorkbenchViewModel
  readonly actions: WorkspaceShellActions
  readonly editor: ReactNode
  readonly inspector: ReactNode
  readonly statusLeft: ReactNode
  readonly statusRight?: ReactNode
}
