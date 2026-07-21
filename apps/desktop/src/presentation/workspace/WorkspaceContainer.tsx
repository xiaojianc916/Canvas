import type { EditorSession } from '@hybrid-canvas/canvas/application'
import { EditorSessionHost } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'
import type {
  CanvasSessionId,
  WorkbenchSessionStore,
  WorkspaceShellActions,
} from '@hybrid-canvas/workspace/contracts'
import { CanvasTabs, WorkspaceShell } from '@hybrid-canvas/workspace/react'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'
import { DesktopTitleBar } from '../chrome/DesktopTitleBar'

const EMPTY_EDITOR_SESSION_SNAPSHOT = Object.freeze({ pages: Object.freeze([]) })
const EMPTY_SUBSCRIBE = () => () => {}
const EMPTY_EDITOR_SNAPSHOT = () => EMPTY_EDITOR_SESSION_SNAPSHOT

export interface WorkspaceCanvasUIPort {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/document').CanvasCloseDecision
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/document').CanvasSessionSnapshot | null
  readonly getVersion: () => number
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
          const continueClose = () => {
            const nextDecision = port.canvases.requestClose(sessionId)

            if (nextDecision.kind === 'confirm-discard') {
              setPendingCloseSessionId(sessionId)
            }
          }

          // 保存成功和保存失败后都必须重新计算关闭决策。
          // 保存失败时文档状态会变为 failed，随后进入放弃更改确认流程。
          void decision.operation.then(continueClose, continueClose)
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
    }),
    [onCommandPaletteOpen, onSettingsOpen, port, workbench.tabs],
  )

  useSyncExternalStore(
    port.canvases.subscribe,
    port.canvases.getVersion,
    port.canvases.getVersion,
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
      inspector={<CanvasInspectorContent hasActiveCanvas={workbench.activeCanvas !== null} />}
      model={workbenchWithCanvasStatus}
      pages={pages}
      renderChrome={({
        isSidebarOpen,
        sidebarWidth,
        tabs,
        onSidebarToggle,
        onActivateCanvas,
        onCloseCanvas,
        onCreateCanvas,
      }) => (
        <DesktopTitleBar
          isSidebarOpen={isSidebarOpen}
          onClose={onWindowClose}
          onMaximize={onWindowMaximize}
          onMinimize={onWindowMinimize}
          onSidebarToggle={onSidebarToggle}
          onStartDragging={onWindowStartDragging}
          sidebarWidth={sidebarWidth}
        >
          <CanvasTabs
            onActivate={onActivateCanvas}
            onClose={onCloseCanvas}
            onCreate={onCreateCanvas}
            tabs={tabs}
          />
        </DesktopTitleBar>
      )}
      statusLeft={<CanvasStatusLeftContent hasActiveCanvas={workbench.activeCanvas !== null} />}
      statusRight={<CanvasStatusRightContent pageCount={pages.length} />}
      overlays={
        <ConfirmationDialog
          confirmLabel="放弃并关闭"
          description="关闭画布会丢失自上次保存后的更改，此操作无法撤销。"
          destructive
          onCancel={() => setPendingCloseSessionId(null)}
          onConfirm={() => {
            if (!pendingCloseSessionId) {
              return
            }

            port.canvases.discardAndClose(pendingCloseSessionId)
            setPendingCloseSessionId(null)
          }}
          open={pendingCloseSessionId !== null}
          title="放弃未保存的更改？"
        />
      }
    />      }
    />
  )
}

function CanvasInspectorContent({
  hasActiveCanvas,
}: {
  readonly hasActiveCanvas: boolean
}) {
  if (!hasActiveCanvas) {
    return (
      <div className="py-10 text-center text-xs text-muted-foreground">
        打开或新建画布后可查看属性
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <section className="rounded-md border border-divider p-3">
        <h3 className="text-xs font-medium">画布属性</h3>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          选择画布中的对象后，可在这里编辑对应属性。
        </p>
      </section>
    </div>
  )
}

function CanvasStatusLeftContent({
  hasActiveCanvas,
}: {
  readonly hasActiveCanvas: boolean
}) {
  return (
    <span>
      {hasActiveCanvas ? '本地画布' : '没有打开的画布'}
    </span>
  )
}

function CanvasStatusRightContent({
  pageCount,
}: {
  readonly pageCount: number
}) {
  if (pageCount === 0) {
    return null
  }

  return <span>{pageCount} 个页面</span>
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
