import type { EditorSession } from '@hybrid-canvas/canvas/application'
import { EditorSessionHost } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'
import type {
  CanvasSessionId,
  WorkbenchSessionStore,
  WorkbenchTabId,
  WorkspaceShellActions,
} from '@hybrid-canvas/workspace/contracts'
import {
  NoCanvasSurface,
  WorkbenchTabs,
  WorkspaceShell,
  WorkspaceSurface,
} from '@hybrid-canvas/workspace/react'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'
import { DesktopTitleBar } from '../chrome/DesktopTitleBar'
import { reportUiError as reportError } from '../ui/ui-feedback'

const EMPTY_EDITOR_SESSION_SNAPSHOT = Object.freeze({
  pages: Object.freeze([]),
})

const EMPTY_SUBSCRIBE = () => () => {}
const EMPTY_EDITOR_SNAPSHOT = () => EMPTY_EDITOR_SESSION_SNAPSHOT

export type WorkspaceCanvasCloseResult =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'confirmation-required'
      readonly sessionId: CanvasSessionId
    }
  | { readonly kind: 'not-found' }

export interface WorkspaceCanvasUIPort {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (sessionId: CanvasSessionId) => Promise<WorkspaceCanvasCloseResult>
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

  useSyncExternalStore(port.canvases.subscribe, port.canvases.getVersion, port.canvases.getVersion)

  const activeSessionId =
    workbench.activeSurface.kind === 'canvas' ? workbench.activeSurface.sessionId : null

  const activeEditorSession = activeSessionId
    ? port.canvases.getEditorSession(activeSessionId)
    : null

  const pages = useSyncExternalStore(
    activeEditorSession?.subscribe ?? EMPTY_SUBSCRIBE,
    activeEditorSession?.getSessionSnapshot ?? EMPTY_EDITOR_SNAPSHOT,
    activeEditorSession?.getSessionSnapshot ?? EMPTY_EDITOR_SNAPSHOT,
  ).pages

  const handleSave = useCallback(
    (sessionId: CanvasSessionId) => {
      void port.canvases.save(sessionId).catch((cause: unknown) => {
        reportError('canvas save failed', {
          scope: 'workspace',
          operation: 'save-canvas',
          sessionId,
          cause,
        })
      })
    },
    [port.canvases],
  )

  const handleCloseCanvas = useCallback(
    (sessionId: CanvasSessionId) => {
      void port.canvases
        .requestClose(sessionId)
        .then((result) => {
          if (result.kind === 'confirmation-required') {
            setPendingCloseSessionId(result.sessionId)
          }
        })
        .catch((cause: unknown) => {
          reportError('canvas close request failed', {
            scope: 'workspace',
            operation: 'request-close-canvas',
            sessionId,
            cause,
          })
        })
    },
    [port.canvases],
  )

  const handleCloseTab = useCallback(
    (tabId: WorkbenchTabId) => {
      const tab = port.workspace.getSnapshot().tabs.find((candidate) => candidate.id === tabId)

      if (!tab || !tab.canClose) {
        return
      }

      if (tab.kind === 'canvas') {
        handleCloseCanvas(tab.sessionId)
        return
      }

      port.workspace.closeTab(tab.id)
    },
    [handleCloseCanvas, port.workspace],
  )

  const actions = useMemo<WorkspaceShellActions>(
    () => ({
      createCanvas() {
        const existingTitles = workbench.tabs
          .filter((tab) => tab.kind === 'canvas')
          .map((tab) => tab.title)

        port.canvases.create(createUntitledCanvasTitle(existingTitles))
      },

      openCanvas() {
        void port.canvases.open().catch((cause: unknown) => {
          reportError('canvas open failed', {
            scope: 'workspace',
            operation: 'open-canvas',
            cause,
          })
        })
      },

      activateTab(tabId) {
        port.workspace.activateTab(tabId)
      },

      closeTab: handleCloseTab,

      openWorkspaceSurface(surfaceId, title) {
        port.workspace.openWorkspaceSurface({
          surfaceId,
          title,
        })
      },

      activatePage(pageId) {
        activeEditorSession?.activatePage(pageId)
      },

      createPage() {
        activeEditorSession?.createPage('画板 ' + String(pages.length + 1))
      },

      openCommandPalette: onCommandPaletteOpen,
      openSettingsWindow: onSettingsOpen,
    }),
    [
      activeEditorSession,
      handleCloseTab,
      onCommandPaletteOpen,
      onSettingsOpen,
      pages.length,
      port.canvases,
      port.workspace,
      workbench.tabs,
    ],
  )

  const tabs = workbench.tabs.map((tab) => {
    if (tab.kind !== 'canvas') {
      return tab
    }

    const status = port.canvases.getSessionSnapshot(tab.sessionId)?.persistence

    return status ? { ...tab, status } : tab
  })

  const model = {
    ...workbench,
    tabs,
  }

  const hostedSessions = useMemo(
    () =>
      workbench.tabs.flatMap((tab) => {
        if (tab.kind !== 'canvas') {
          return []
        }

        const session = port.canvases.getEditorSession(tab.sessionId)

        return session ? [{ sessionId: tab.sessionId, session }] : []
      }),
    [port.canvases, workbench.tabs],
  )

  const mainContent = renderActiveSurface({
    activeSurface: workbench.activeSurface,
    activeSessionId,
    hostedSessions,
    onCreateCanvas: actions.createCanvas,
    onOpenCanvas: actions.openCanvas,
    onSave: handleSave,
  })

  return (
    <WorkspaceShell
      actions={actions}
      inspector={<CanvasInspectorContent hasActiveCanvas={workbench.activeCanvas !== null} />}
      mainContent={mainContent}
      model={model}
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

            try {
              port.canvases.discardAndClose(pendingCloseSessionId)
            } catch (cause) {
              reportError('discard and close canvas failed', {
                scope: 'workspace',
                operation: 'discard-and-close-canvas',
                sessionId: pendingCloseSessionId,
                cause,
              })

              return
            }

            setPendingCloseSessionId(null)
          }}
          open={pendingCloseSessionId !== null}
          title="放弃未保存的更改？"
        />
      }
      pages={pages}
      renderChrome={({
        isSidebarOpen,
        sidebarWidth,
        tabs: chromeTabs,
        onSidebarToggle,
        onActivateTab,
        onCloseTab,
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
          <WorkbenchTabs
            onActivate={onActivateTab}
            onClose={onCloseTab}
            onCreate={onCreateCanvas}
            tabs={chromeTabs}
          />
        </DesktopTitleBar>
      )}
      statusLeft={<CanvasStatusLeftContent hasActiveCanvas={workbench.activeCanvas !== null} />}
      statusRight={<CanvasStatusRightContent pageCount={pages.length} />}
    />
  )
}

interface ActiveSurfaceRendererProps {
  readonly activeSurface: import('@hybrid-canvas/workspace/contracts').WorkbenchSurfaceViewModel
  readonly activeSessionId: CanvasSessionId | null
  readonly hostedSessions: readonly {
    readonly sessionId: CanvasSessionId
    readonly session: EditorSession
  }[]
  readonly onCreateCanvas: () => void
  readonly onOpenCanvas: () => void
  readonly onSave: (sessionId: CanvasSessionId) => void
}

function renderActiveSurface({
  activeSurface,
  activeSessionId,
  hostedSessions,
  onCreateCanvas,
  onOpenCanvas,
  onSave,
}: ActiveSurfaceRendererProps) {
  switch (activeSurface.kind) {
    case 'start':
      return <NoCanvasSurface onCreateDocument={onCreateCanvas} onOpenDocument={onOpenCanvas} />

    case 'workspace':
      return <WorkspaceSurface surfaceId={activeSurface.surfaceId} />

    case 'canvas':
      return (
        <UiErrorBoundary area="画布编辑器">
          <EditorSessionHost
            activeSessionId={activeSessionId}
            onSave={onSave}
            sessions={hostedSessions}
          />
        </UiErrorBoundary>
      )
  }
}

function CanvasInspectorContent({ hasActiveCanvas }: { readonly hasActiveCanvas: boolean }) {
  if (!hasActiveCanvas) {
    return (
      <div className="py-10 text-center text-xs text-muted-foreground">
        激活画布标签后可查看属性
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

function CanvasStatusLeftContent({ hasActiveCanvas }: { readonly hasActiveCanvas: boolean }) {
  return <span>{hasActiveCanvas ? '本地画布' : null}</span>
}

function CanvasStatusRightContent({ pageCount }: { readonly pageCount: number }) {
  return pageCount > 0 ? <span>{pageCount} 个页面</span> : null
}

function createUntitledCanvasTitle(existingTitles: readonly string[]): string {
  const baseTitle = '未命名画板'

  if (!existingTitles.includes(baseTitle)) {
    return baseTitle
  }

  let suffix = 2

  while (existingTitles.includes(baseTitle + ' ' + String(suffix))) {
    suffix += 1
  }

  return baseTitle + ' ' + String(suffix)
}
