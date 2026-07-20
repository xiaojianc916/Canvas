import type { ReactNode } from 'react'

import type { DocumentSessionId, PageId, WorkbenchViewModel } from './public-api'

export interface WorkspaceShellActions {
  readonly createDocument: () => void
  readonly openDocument: () => void
  readonly activateDocument: (sessionId: DocumentSessionId) => void
  readonly closeDocument: (sessionId: DocumentSessionId) => void
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
