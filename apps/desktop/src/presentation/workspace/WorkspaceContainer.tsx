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
  readonly create: (title: string) => void
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
        port.canvases.create(createUntitledCanvasTitle(workbench.tabs.map((tab) => tab.title)))
      },
      openCanvas() {
        void port.canvases.open()
      },
      activateCanvas(sessionId) {
        port.workspace.activateCanvas(sessionId)
      },
      closeCanvas(sessionId) {
        port.canvases.close(sessionId)
      },
      activatePage(pageId) {
        const editor = port.canvases.getEditorSession(workbench.activeSessionId ?? '')?.editor
        const page = editor?.getPages().find((candidate) => candidate.id === pageId)
        if (editor && page) editor.setCurrentPage(page)
      },
      createPage() {
        const editor = port.canvases.getEditorSession(workbench.activeSessionId ?? '')?.editor
        if (editor) editor.createPage({ name: `画板 ${editor.getPages().length + 1}` })
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

  const activeEditor = port.canvases.getEditorSession(workbench.activeSessionId ?? '')?.editor
  const pages = activeEditor
    ? activeEditor.getPages().map((page) => ({
        id: page.id,
        title: page.name,
        isActive: page.id === activeEditor.getCurrentPageId(),
      }))
    : []

  const hostedSessions = useMemo(
    () =>
      workbench.tabs.flatMap((tab) => {
        const session = port.canvases.getEditorSession(tab.sessionId)
        return session ? [{ sessionId: tab.sessionId, session }] : []
      }),
    [port.canvases, workbench.tabs],
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
      pages={pages}
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
