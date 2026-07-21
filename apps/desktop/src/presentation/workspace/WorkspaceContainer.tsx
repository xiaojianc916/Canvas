import type { EditorSession } from '@hybrid-canvas/canvas'
import {
  CanvasInspector,
  CanvasStatusLeft,
  CanvasStatusRight,
  EditorSessionHost,
} from '@hybrid-canvas/canvas'
import { WorkspaceShell, type WorkspaceShellActions } from '@hybrid-canvas/workspace'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import type { CanvasSessionId, WorkbenchSessionStore } from '@hybrid-canvas/workspace'
import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'

const EMPTY_EDITOR_SESSION_SNAPSHOT = Object.freeze({ pages: Object.freeze([]) })
const EMPTY_SUBSCRIBE = () => () => { }
const EMPTY_EDITOR_SNAPSHOT = () => EMPTY_EDITOR_SESSION_SNAPSHOT

export interface WorkspaceCanvasUIPort {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/canvas-session').CanvasCloseDecision
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/canvas-session').CanvasSessionSnapshot | null
  readonly subscribe: (listener: () => void) => () => void
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
  const [pendingCloseSessionId, setPendingCloseSessionId] = useState<CanvasSessionId | null>(null)
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
        const decision = port.canvases.requestClose(sessionId)
        if (decision.kind === 'confirm-discard') setPendingCloseSessionId(sessionId)
        if (decision.kind === 'wait-for-save') {
          void decision.operation.then(() => {
            const nextDecision = port.canvases.requestClose(sessionId)
            if (nextDecision.kind === 'confirm-discard') setPendingCloseSessionId(sessionId)
          })
        }
      },
      activatePage(pageId) {
        activeEditorSession?.activatePage(pageId)
      },
      createPage() {
        activeEditorSession?.createPage(`画板 ${pages.length + 1}`)
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

  useSyncExternalStore(
    port.canvases.subscribe,
    port.workspace.getSnapshot,
    port.workspace.getSnapshot,
  )
  const tabs = workbench.tabs.map((tab) => {
    const status = port.canvases.getSessionSnapshot(tab.sessionId)?.persistence
    return status ? { ...tab, status } : tab
  })
  const workbenchWithCanvasStatus = { ...workbench, tabs }

  const activeEditorSession = port.canvases.getEditorSession(workbench.activeSessionId ?? '')
  const pages = useSyncExternalStore(
    activeEditorSession?.subscribe ?? EMPTY_SUBSCRIBE,
    activeEditorSession?.getSessionSnapshot ?? EMPTY_EDITOR_SNAPSHOT,
    activeEditorSession?.getSessionSnapshot ?? EMPTY_EDITOR_SNAPSHOT,
  ).pages

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
      model={workbenchWithCanvasStatus}
      pages={pages}
      statusLeft={<CanvasStatusLeft />}
      statusRight={<CanvasStatusRight />}
      overlays={
        pendingCloseSessionId ? (
          <div
            className="absolute inset-0 z-50 grid place-items-center bg-black/25"
            role="presentation"
          >
            <section
              aria-labelledby="discard-canvas-title"
              aria-modal="true"
              className="w-96 rounded-xl border border-divider bg-background p-5 shadow-2xl"
              role="dialog"
            >
              <h2 className="text-base font-semibold" id="discard-canvas-title">
                放弃未保存的更改？
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                关闭画布会丢失自上次保存后的更改，此操作无法撤销。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="rounded-md px-3 py-2 text-sm hover:bg-muted"
                  onClick={() => setPendingCloseSessionId(null)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground"
                  onClick={() => {
                    port.canvases.discardAndClose(pendingCloseSessionId)
                    setPendingCloseSessionId(null)
                  }}
                  type="button"
                >
                  放弃并关闭
                </button>
              </div>
            </section>
          </div>
        ) : null
      }
    />
  )
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
