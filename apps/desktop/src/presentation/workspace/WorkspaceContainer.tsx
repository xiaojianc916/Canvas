import { isTauri } from '@tauri-apps/api/core'
import type { EditorSession } from '@hybrid-canvas/canvas'
import {
  CanvasInspector,
  CanvasStatusLeft,
  CanvasStatusRight,
  EditorSessionHost,
} from '@hybrid-canvas/canvas'
import { WorkspaceShell, type WorkspaceShellActions } from '@hybrid-canvas/workspace'
import { useCallback, useMemo, useSyncExternalStore } from 'react'

import type { CanvasSessionId, WorkbenchSessionStore } from '@hybrid-canvas/workspace'
import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'

export interface WorkspaceCanvasUIPort {
  readonly create: (title: string, initialPageTitle: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly close: (sessionId: CanvasSessionId) => void
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
}

export interface WorkspaceUIPort {
  readonly canvases: WorkspaceCanvasUIPort
  readonly workspace: WorkbenchSessionStore
}

export interface WorkspaceContainerProps {
  readonly port: WorkspaceUIPort
  readonly onCommandPaletteOpen: () => void
  readonly onSettingsOpen: () => void
  readonly onWindowMinimize: () => void
  readonly onWindowMaximize: () => void
  readonly onWindowClose: () => void
  readonly onWindowStartDragging: () => void
}

export function WorkspaceContainer({
  port,
  onCommandPaletteOpen,
  onSettingsOpen,
  onWindowMinimize,
  onWindowMaximize,
  onWindowClose,
  onWindowStartDragging,
}: WorkspaceContainerProps) {
  const workbench = useSyncExternalStore(
    port.workspace.subscribe,
    port.workspace.getSnapshot,
    port.workspace.getSnapshot,
  )

  const handleSave = useCallback(
    (sessionId: string) => {
      void port.canvases.save(sessionId)
    },
    [port.canvases],
  )

  const actions = useMemo<WorkspaceShellActions>(
    () => ({
      createCanvas() {
        port.canvases.create(
          createUntitledCanvasTitle(workbench.tabs.map((tab) => tab.title)),
          '画板 1',
        )
      },
      openCanvas() {
        void port.documents.open()
      },
      activateCanvas(sessionId) {
        port.workspace.activateCanvas(sessionId)
      },
      closeCanvas(sessionId) {
        port.documents.close(sessionId)
      },
      activatePage(pageId) {
        const activeSessionId = port.workspace.getSnapshot().activeSessionId
        if (activeSessionId) {
          port.workspace.activatePage(activeSessionId, pageId)
        }
      },
      createPage() {
        const activeSessionId = port.workspace.getSnapshot().activeSessionId
        if (activeSessionId) {
          port.workspace.createPage(activeSessionId, `画板 ${(port.workspace.getSnapshot().activeCanvas?.pages.length ?? 0) + 1}`)
        }
      },
      openCommandPalette: onCommandPaletteOpen,
      openSettingsWindow: onSettingsOpen,
      minimizeWindow: onWindowMinimize,
      maximizeWindow: onWindowMaximize,
      closeWindow: onWindowClose,
      startWindowDragging: onWindowStartDragging,
    }),
    [onCommandPaletteOpen, onSettingsOpen, port, workbench.tabs],
  )

  const hostedSessions = useMemo(
    () =>
      workbench.tabs.flatMap((tab) => {
        const session = port.documents.getEditorSession(tab.sessionId)
        return session ? [{ sessionId: tab.sessionId, session }] : []
      }),
    [port.documents, workbench.tabs],
  )

  return (
    <WorkspaceShell
      actions={actions}
      editor={
        workbench.activeCanvas ? (
          <UiErrorBoundary area="画布编辑器">
            <EditorSessionHost
              activeSessionId={workbench.activeSessionId}
              onSave={handleSave}
              sessions={hostedSessions}
            />
          </UiErrorBoundary>
        ) : null
      }
      inspector={<CanvasInspector />}
      model={workbench}
      statusLeft={<CanvasStatusLeft />}
      statusRight={<CanvasStatusRight />}
    />
  )
}

async function invokeWindowAction(
  action: 'minimize' | 'toggleMaximize' | 'close' | 'startDragging',
): Promise<void> {
  if (!isTauri()) {
    return
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow()[action]()
}

function createUntitledCanvasTitle(existingTitles: readonly string[]): string {
  const baseTitle = '未命名画板'
  if (!existingTitles.includes(baseTitle)) {
    return baseTitle
  }
  let suffix = 2
  while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
    suffix += 1
  }
  return `${baseTitle} ${suffix}`
}
