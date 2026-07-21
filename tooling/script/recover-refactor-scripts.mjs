#!/usr/bin/env node

import {
  cp,
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldWrite = process.argv.includes('--write')
const writes = new Map()

function absolute(relativePath) {
  return resolve(root, relativePath)
}

async function exists(relativePath) {
  try {
    await stat(absolute(relativePath))
    return true
  } catch {
    return false
  }
}

async function read(relativePath) {
  return readFile(absolute(relativePath), 'utf8')
}

function write(relativePath, content) {
  writes.set(relativePath, content)
}

async function edit(relativePath, transform) {
  const original = await read(relativePath)
  const updated = transform(original)

  if (updated === original) {
    throw new Error(`文件没有产生修改：${relativePath}`)
  }

  writes.set(relativePath, updated)
}

function replaceOnce(content, oldText, newText, description) {
  const firstIndex = content.indexOf(oldText)

  if (firstIndex < 0) {
    throw new Error(`找不到待修改内容：${description}`)
  }

  const secondIndex = content.indexOf(
    oldText,
    firstIndex + oldText.length,
  )

  if (secondIndex >= 0) {
    throw new Error(`待修改内容不唯一：${description}`)
  }

  return (
    content.slice(0, firstIndex) +
    newText +
    content.slice(firstIndex + oldText.length)
  )
}

async function updateJson(relativePath, transform) {
  const content = await read(relativePath)
  const hasBom = content.startsWith('\uFEFF')
  const json = JSON.parse(
    hasBom ? content.slice(1) : content,
  )

  const updated = transform(json) ?? json

  write(
    relativePath,
    `${hasBom ? '\uFEFF' : ''}${JSON.stringify(updated, null, 2)}\n`,
  )
}

async function preflight() {
  const expectedPaths = [
    'apps/desktop/src/presentation/AppShell.tsx',
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
    'apps/desktop/src/application/canvas/canvas-workflow.ts',
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
    'foundations/observability/src/public-api.ts',
  ]

  for (const relativePath of expectedPaths) {
    if (!(await exists(relativePath))) {
      throw new Error(`缺少目标文件：${relativePath}`)
    }
  }

  const appShell = await read(
    'apps/desktop/src/presentation/AppShell.tsx',
  )

  const workspaceContainer = await read(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  )

  const workspaceShell = await read(
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  )

  if (
    !appShell.includes(
      '</EditorProvider>    </EditorProvider>',
    )
  ) {
    console.warn(
      '警告：AppShell 不包含已知重复闭合标签，将仍以完整安全版本覆盖。',
    )
  }

  if (
    !workspaceContainer.includes(
      '/>      }\n    />',
    )
  ) {
    console.warn(
      '警告：WorkspaceContainer 不包含已知重复 JSX，将仍以完整安全版本覆盖。',
    )
  }

  if (
    !workspaceShell.includes(
      'const rail = (  const rail = (',
    )
  ) {
    console.warn(
      '警告：WorkspaceShell 不包含已知重复声明，可能已经被手动修复。',
    )
  }
}

function createCanvasWorkflow() {
  write(
    'apps/desktop/src/application/canvas/canvas-workflow.ts',
    `import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type {
  ApplicationClosePlan,
  CanvasDocumentService,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

export type CanvasCloseRequestResult =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'confirmation-required'
      readonly sessionId: CanvasSessionId
    }
  | { readonly kind: 'not-found' }

export interface CanvasWorkflow {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (
    sessionId: CanvasSessionId,
  ) => Promise<CanvasCloseRequestResult>
  readonly discardAndClose: (
    sessionId: CanvasSessionId,
  ) => void
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly discardAllAndClose: (
    sessionIds: readonly CanvasSessionId[],
  ) => void
  readonly getEditorSession: (
    sessionId: CanvasSessionId,
  ) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (
    listener: () => void,
  ) => () => void
  readonly dispose: () => void
}

export function createCanvasWorkflow(
  documents: CanvasDocumentService,
  workspace: WorkbenchSessionStore,
): CanvasWorkflow {
  function create(title: string): void {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      documents.discardAndClose(opened.sessionId)
      throw error
    }
  }

  async function open(): Promise<void> {
    const opened = await documents.open()

    if (!opened) {
      return
    }

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      documents.discardAndClose(opened.sessionId)
      throw error
    }
  }

  async function requestClose(
    sessionId: CanvasSessionId,
  ): Promise<CanvasCloseRequestResult> {
    let decision = documents.requestClose(sessionId)

    if (decision.kind === 'wait-for-save') {
      // 保存失败时 CanvasDocumentService 会进入 failed 状态。
      // 此处只等待状态稳定，随后重新计算关闭决策。
      await decision.operation.catch(() => undefined)
      decision = documents.requestClose(sessionId)
    }

    switch (decision.kind) {
      case 'close-now':
        workspace.closeCanvas(sessionId)
        return { kind: 'closed' }

      case 'confirm-discard':
        return {
          kind: 'confirmation-required',
          sessionId,
        }

      case 'not-found':
        return { kind: 'not-found' }

      case 'wait-for-save':
        // 理论上不会进入：同一 saveOperation 已在上方等待。
        // 保留防御性处理，避免未来文档实现改变后静默关闭。
        return {
          kind: 'confirmation-required',
          sessionId,
        }
    }
  }

  function discardAndClose(
    sessionId: CanvasSessionId,
  ): void {
    documents.discardAndClose(sessionId)
    workspace.closeCanvas(sessionId)
  }

  function discardAllAndClose(
    sessionIds: readonly CanvasSessionId[],
  ): void {
    for (const sessionId of sessionIds) {
      discardAndClose(sessionId)
    }
  }

  return {
    create,
    open,
    save: documents.save,
    requestClose,
    discardAndClose,
    planApplicationClose: documents.planApplicationClose,
    discardAllAndClose,
    getEditorSession: documents.getEditorSession,
    getSessionSnapshot: documents.getSessionSnapshot,
    getVersion: documents.getVersion,
    subscribe: documents.subscribe,
    dispose: documents.dispose,
  }
}
`,
  )
}

function createWorkspaceContainer() {
  write(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
    `import type { EditorSession } from '@hybrid-canvas/canvas/application'
import { EditorSessionHost } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'
import { error as reportError } from '@hybrid-canvas/observability'
import type {
  CanvasSessionId,
  WorkbenchSessionStore,
  WorkspaceShellActions,
} from '@hybrid-canvas/workspace/contracts'
import {
  CanvasTabs,
  WorkspaceShell,
} from '@hybrid-canvas/workspace/react'
import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'
import { DesktopTitleBar } from '../chrome/DesktopTitleBar'

const EMPTY_EDITOR_SESSION_SNAPSHOT = Object.freeze({
  pages: Object.freeze([]),
})

const EMPTY_SUBSCRIBE = () => () => {}
const EMPTY_EDITOR_SNAPSHOT = () =>
  EMPTY_EDITOR_SESSION_SNAPSHOT

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
  readonly save: (
    sessionId: CanvasSessionId,
  ) => Promise<void>
  readonly requestClose: (
    sessionId: CanvasSessionId,
  ) => Promise<WorkspaceCanvasCloseResult>
  readonly discardAndClose: (
    sessionId: CanvasSessionId,
  ) => void
  readonly getEditorSession: (
    sessionId: CanvasSessionId,
  ) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) =>
    | import('@hybrid-canvas/document').CanvasSessionSnapshot
    | null
  readonly getVersion: () => number
  readonly subscribe: (
    listener: () => void,
  ) => () => void
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
  const [
    pendingCloseSessionId,
    setPendingCloseSessionId,
  ] = useState<CanvasSessionId | null>(null)

  const workbench = useSyncExternalStore(
    port.workspace.subscribe,
    port.workspace.getSnapshot,
    port.workspace.getSnapshot,
  )

  useSyncExternalStore(
    port.canvases.subscribe,
    port.canvases.getVersion,
    port.canvases.getVersion,
  )

  const activeEditorSession =
    port.canvases.getEditorSession(
      workbench.activeSessionId ?? '',
    )

  const pages = useSyncExternalStore(
    activeEditorSession?.subscribe ?? EMPTY_SUBSCRIBE,
    activeEditorSession?.getSessionSnapshot ??
      EMPTY_EDITOR_SNAPSHOT,
    activeEditorSession?.getSessionSnapshot ??
      EMPTY_EDITOR_SNAPSHOT,
  ).pages

  const handleSave = useCallback(
    (sessionId: string) => {
      void port.canvases.save(sessionId).catch(
        (cause: unknown) => {
          reportError('canvas save failed', {
            scope: 'workspace',
            operation: 'save-canvas',
            sessionId,
            cause,
          })
        },
      )
    },
    [port.canvases],
  )

  const handleCloseCanvas = useCallback(
    (sessionId: CanvasSessionId) => {
      void port.canvases
        .requestClose(sessionId)
        .then((result) => {
          if (
            result.kind ===
            'confirmation-required'
          ) {
            setPendingCloseSessionId(
              result.sessionId,
            )
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

  const actions = useMemo<WorkspaceShellActions>(
    () => ({
      createCanvas() {
        port.canvases.create(
          createUntitledCanvasTitle(
            workbench.tabs.map(
              (tab) => tab.title,
            ),
          ),
        )
      },

      openCanvas() {
        void port.canvases.open().catch(
          (cause: unknown) => {
            reportError('canvas open failed', {
              scope: 'workspace',
              operation: 'open-canvas',
              cause,
            })
          },
        )
      },

      activateCanvas(sessionId) {
        port.workspace.activateCanvas(sessionId)
      },

      closeCanvas: handleCloseCanvas,

      activatePage(pageId) {
        activeEditorSession?.activatePage(pageId)
      },

      createPage() {
        activeEditorSession?.createPage(
          \`画板 \${pages.length + 1}\`,
        )
      },

      openCommandPalette:
        onCommandPaletteOpen,

      openSettingsWindow: onSettingsOpen,
    }),
    [
      activeEditorSession,
      handleCloseCanvas,
      onCommandPaletteOpen,
      onSettingsOpen,
      pages.length,
      port.canvases,
      port.workspace,
      workbench.tabs,
    ],
  )

  const tabs = workbench.tabs.map((tab) => {
    const status =
      port.canvases.getSessionSnapshot(
        tab.sessionId,
      )?.persistence

    return status
      ? { ...tab, status }
      : tab
  })

  const workbenchWithCanvasStatus = {
    ...workbench,
    tabs,
  }

  const hostedSessions = useMemo(
    () =>
      workbench.tabs.flatMap((tab) => {
        const session =
          port.canvases.getEditorSession(
            tab.sessionId,
          )

        return session
          ? [
              {
                sessionId: tab.sessionId,
                session,
              },
            ]
          : []
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
              activeSessionId={
                workbench.activeSessionId
              }
              onSave={handleSave}
              sessions={hostedSessions}
            />
          </UiErrorBoundary>
        ) : null
      }
      inspector={
        <CanvasInspectorContent
          hasActiveCanvas={
            workbench.activeCanvas !== null
          }
        />
      }
      model={workbenchWithCanvasStatus}
      overlays={
        <ConfirmationDialog
          confirmLabel="放弃并关闭"
          description="关闭画布会丢失自上次保存后的更改，此操作无法撤销。"
          destructive
          onCancel={() =>
            setPendingCloseSessionId(null)
          }
          onConfirm={() => {
            if (!pendingCloseSessionId) {
              return
            }

            try {
              port.canvases.discardAndClose(
                pendingCloseSessionId,
              )
            } catch (cause) {
              reportError(
                'discard and close canvas failed',
                {
                  scope: 'workspace',
                  operation:
                    'discard-and-close-canvas',
                  sessionId:
                    pendingCloseSessionId,
                  cause,
                },
              )

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
          onStartDragging={
            onWindowStartDragging
          }
          sidebarWidth={sidebarWidth}
        >
          <CanvasTabs
            onActivate={onActivateCanvas}
            onClose={onCloseCanvas}
            onCreate={onCreateCanvas}
            tabs={chromeTabs}
          />
        </DesktopTitleBar>
      )}
      statusLeft={
        <CanvasStatusLeftContent
          hasActiveCanvas={
            workbench.activeCanvas !== null
          }
        />
      }
      statusRight={
        <CanvasStatusRightContent
          pageCount={pages.length}
        />
      }
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
        <h3 className="text-xs font-medium">
          画布属性
        </h3>

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
      {hasActiveCanvas
        ? '本地画布'
        : '没有打开的画布'}
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

function createUntitledCanvasTitle(
  existingTitles: readonly string[],
): string {
  const baseTitle = '未命名画板'

  if (!existingTitles.includes(baseTitle)) {
    return baseTitle
  }

  let suffix = 2

  while (
    existingTitles.includes(
      \`\${baseTitle} \${suffix}\`,
    )
  ) {
    suffix += 1
  }

  return \`\${baseTitle} \${suffix}\`
}
`,
  )
}

function repairWorkspaceShell() {
  return edit(
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
    (content) => {
      let updated = content

      if (
        updated.includes(
          '  const rail = (  const rail = (',
        )
      ) {
        updated = updated.replace(
          '  const rail = (  const rail = (',
          '  const rail = (',
        )
      }

      if (
        updated.includes(
          '<WorkspaceFrame\n        rootRef={rootRef}',
        )
      ) {
        return updated
      }

      throw new Error(
        'WorkspaceShell 缺少 WorkspaceFrame rootRef，请检查上一阶段修改。',
      )
    },
  )
}

function createAppShell() {
  write(
    'apps/desktop/src/presentation/AppShell.tsx',
    `import { EditorProvider } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'
import { error as reportError } from '@hybrid-canvas/observability'
import type { MainWindowController } from '@hybrid-canvas/platforms-desktop-runtime'
import { SettingsDialog } from '@hybrid-canvas/settings/react'
import type { CommandRegistry } from '@hybrid-canvas/workspace/application'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'
import { CommandPalette } from '@hybrid-canvas/workspace/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import type { ApplicationTerminationCoordinator } from '../application/termination/application-termination-coordinator'
import { UiErrorBoundary } from './boundaries/UiErrorBoundary'
import { useGlobalCommandShortcuts } from './commands/useGlobalCommandShortcuts'
import {
  type WorkspaceCanvasUIPort,
  WorkspaceContainer,
} from './workspace/WorkspaceContainer'

export interface AppShellRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: WorkspaceCanvasUIPort
  readonly termination: ApplicationTerminationCoordinator
  readonly mainWindow: MainWindowController
}

export interface AppShellProps {
  readonly runtime: AppShellRuntime
}

const GLOBAL_COMMAND_SHORTCUTS = [
  {
    key: 'k',
    commandId:
      'application.toggle-command-palette',
    ctrlOrMeta: true,
  },
  {
    key: 'n',
    commandId: 'workspace.create-canvas',
    ctrlOrMeta: true,
  },
  {
    key: 'o',
    commandId: 'workspace.open-canvas',
    ctrlOrMeta: true,
  },
] as const

export function AppShell({
  runtime,
}: AppShellProps) {
  const [
    isCommandPaletteOpen,
    setCommandPaletteOpen,
  ] = useState(false)

  const [
    isSettingsOpen,
    setSettingsOpen,
  ] = useState(false)

  const termination = useSyncExternalStore(
    runtime.termination.subscribe,
    runtime.termination.getSnapshot,
    runtime.termination.getSnapshot,
  )

  const toggleCommandPalette = useCallback(
    () => {
      setCommandPaletteOpen(
        (open) => !open,
      )
    },
    [],
  )

  const openCommandPalette = useCallback(
    () => setCommandPaletteOpen(true),
    [],
  )

  const openSettings = useCallback(
    () => setSettingsOpen(true),
    [],
  )

  const requestApplicationClose = useCallback(
    () => {
      runtime.termination.request(
        'window-close',
      )
    },
    [runtime.termination],
  )

  const minimizeWindow = useCallback(() => {
    void runtime.mainWindow
      .minimize()
      .catch((cause: unknown) => {
        reportError(
          'main window minimize failed',
          {
            scope: 'app-shell',
            operation: 'minimize-window',
            cause,
          },
        )
      })
  }, [runtime.mainWindow])

  const maximizeWindow = useCallback(() => {
    void runtime.mainWindow
      .toggleMaximize()
      .catch((cause: unknown) => {
        reportError(
          'main window maximize failed',
          {
            scope: 'app-shell',
            operation: 'toggle-maximize-window',
            cause,
          },
        )
      })
  }, [runtime.mainWindow])

  const startWindowDragging =
    useCallback(() => {
      void runtime.mainWindow
        .startDragging()
        .catch((cause: unknown) => {
          reportError(
            'main window drag failed',
            {
              scope: 'app-shell',
              operation:
                'start-window-dragging',
              cause,
            },
          )
        })
    }, [runtime.mainWindow])

  useApplicationCommands(
    runtime,
    toggleCommandPalette,
  )

  useGlobalCommandShortcuts(
    runtime.commands,
    GLOBAL_COMMAND_SHORTCUTS,
  )

  useMainWindowCloseRequest(
    runtime.mainWindow,
    requestApplicationClose,
  )

  const workspacePort = useMemo(
    () => ({
      canvases: runtime.canvases,
      workspace: runtime.workspace,
    }),
    [
      runtime.canvases,
      runtime.workspace,
    ],
  )

  return (
    <EditorProvider>
      <UiErrorBoundary area="工作区">
        <WorkspaceContainer
          onCommandPaletteOpen={
            openCommandPalette
          }
          onSettingsOpen={openSettings}
          onWindowClose={
            requestApplicationClose
          }
          onWindowMaximize={
            maximizeWindow
          }
          onWindowMinimize={
            minimizeWindow
          }
          onWindowStartDragging={
            startWindowDragging
          }
          port={workspacePort}
        />
      </UiErrorBoundary>

      <CommandPalette
        onOpenChange={
          setCommandPaletteOpen
        }
        open={isCommandPaletteOpen}
        registry={runtime.commands}
      />

      <SettingsDialog
        onOpenChange={setSettingsOpen}
        open={isSettingsOpen}
      />

      <ConfirmationDialog
        confirmLabel="放弃全部并退出"
        description={
          termination.state ===
          'confirmation-required'
            ? \`有 \${termination.sessionIds.length} 个画布包含未保存的更改。\`
            : ''
        }
        destructive
        onCancel={
          runtime.termination.cancel
        }
        onConfirm={
          runtime.termination.confirmDiscard
        }
        open={
          termination.state ===
          'confirmation-required'
        }
        title="退出并放弃未保存的更改？"
      />

      <ConfirmationDialog
        cancelLabel="返回应用"
        confirmLabel="重试退出"
        description={
          termination.state ===
          'termination-failed'
            ? \`原生窗口未能完成退出：\${termination.message}\`
            : ''
        }
        onCancel={
          runtime.termination.cancel
        }
        onConfirm={
          runtime.termination.retry
        }
        open={
          termination.state ===
          'termination-failed'
        }
        title="应用退出失败"
      />
    </EditorProvider>
  )
}

function useMainWindowCloseRequest(
  mainWindow: MainWindowController,
  onCloseRequested: () => void,
): void {
  useEffect(() => {
    let disposed = false
    let unsubscribe:
      | (() => void)
      | undefined

    void mainWindow
      .onCloseRequested(onCloseRequested)
      .then(
        (nextUnsubscribe) => {
          if (disposed) {
            nextUnsubscribe()
            return
          }

          unsubscribe = nextUnsubscribe
        },
        (cause: unknown) => {
          if (!disposed) {
            reportError(
              'main window close listener registration failed',
              {
                scope: 'app-shell',
                operation:
                  'register-close-listener',
                cause,
              },
            )
          }
        },
      )

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [mainWindow, onCloseRequested])
}

function useApplicationCommands(
  runtime: AppShellRuntime,
  toggleCommandPalette: () => void,
): void {
  useEffect(() => {
    const unregister = [
      runtime.commands.register({
        id: 'application.toggle-command-palette',
        label: '切换命令面板',
        category: '应用',
        shortcut: 'Ctrl+K',
        execute: toggleCommandPalette,
      }),

      runtime.commands.register({
        id: 'workspace.create-canvas',
        label: '新建画板',
        category: '文件',
        shortcut: 'Ctrl+N',
        execute() {
          runtime.canvases.create(
            '未命名画板',
          )
        },
      }),

      runtime.commands.register({
        id: 'workspace.open-canvas',
        label: '打开画板',
        category: '文件',
        shortcut: 'Ctrl+O',
        execute: runtime.canvases.open,
      }),
    ]

    return () => {
      for (
        let index = unregister.length - 1;
        index >= 0;
        index -= 1
      ) {
        unregister[index]?.()
      }
    }
  }, [runtime, toggleCommandPalette])
}
`,
  )
}

async function replaceConsoleErrorBoundaries() {
  await edit(
    'apps/desktop/src/presentation/boundaries/UiErrorBoundary.tsx',
    (content) => {
      let updated = content

      if (
        !updated.includes(
          `from '@hybrid-canvas/observability'`,
        )
      ) {
        updated = replaceOnce(
          updated,
          `import { Component, type ErrorInfo, type ReactNode } from 'react'`,
          `import { error as reportError } from '@hybrid-canvas/observability'
import { Component, type ErrorInfo, type ReactNode } from 'react'`,
          '为 UiErrorBoundary 导入 observability',
        )
      }

      updated = replaceOnce(
        updated,
        `    console.error(\`UI boundary failed: \${this.props.area}\`, error, info.componentStack)`,
        `    reportError('UI boundary failed', {
      scope: 'ui-error-boundary',
      area: this.props.area,
      error,
      componentStack: info.componentStack,
    })`,
        '替换 UiErrorBoundary console.error',
      )

      return updated
    },
  )

  await edit(
    'apps/desktop/src/bootstrap/ApplicationErrorBoundary.tsx',
    (content) => {
      let updated = content

      if (
        !updated.includes(
          `from '@hybrid-canvas/observability'`,
        )
      ) {
        updated = replaceOnce(
          updated,
          `import { Button } from '@hybrid-canvas/design-system'`,
          `import { Button } from '@hybrid-canvas/design-system'
import { error as reportError } from '@hybrid-canvas/observability'`,
          '为 ApplicationErrorBoundary 导入 observability',
        )
      }

      updated = replaceOnce(
        updated,
        `    console.error('Application rendering failed.', error, errorInfo)`,
        `    reportError('Application rendering failed', {
      scope: 'application-error-boundary',
      error,
      componentStack: errorInfo.componentStack,
    })`,
        '替换 ApplicationErrorBoundary console.error',
      )

      return updated
    },
  )
}

async function fixApplicationLifecycleLogging() {
  await edit(
    'apps/desktop/src/bootstrap/application-lifecycle.ts',
    (content) => {
      let updated = content

      if (
        !updated.includes(
          `from '@hybrid-canvas/observability'`,
        )
      ) {
        updated =
          `import { error as reportError } from '@hybrid-canvas/observability'\n` +
          updated
      }

      updated = replaceOnce(
        updated,
        `  const handleBeforeUnload = () => {
    void runtime.mainWindow.saveState().catch(() => undefined)
  }`,
        `  const handleBeforeUnload = () => {
    void runtime.mainWindow
      .saveState()
      .catch((cause: unknown) => {
        reportError(
          'main window state save failed during unload',
          {
            scope: 'application-lifecycle',
            operation: 'save-window-state',
            cause,
          },
        )
      })
  }`,
        '替换 beforeunload 静默错误',
      )

      return updated
    },
  )
}

async function updateDependencies() {
  await updateJson(
    'apps/desktop/package.json',
    (json) => {
      json.dependencies ??= {}

      json.dependencies[
        '@hybrid-canvas/observability'
      ] = 'workspace:*'

      json.dependencies[
        '@hybrid-canvas/settings'
      ] = 'workspace:*'

      json.dependencies = Object.fromEntries(
        Object.entries(
          json.dependencies,
        ).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      )

      return json
    },
  )
}

function createQualityWorkflow() {
  write(
    '.github/workflows/quality.yml',
    `name: Quality

on:
  pull_request:
  push:
    branches:
      - main

concurrency:
  group: quality-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  frontend:
    name: Frontend
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11.15.0
          run_install: false

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Format
        run: pnpm format:check

      - name: Lint
        run: pnpm lint

      - name: Architecture
        run: pnpm test:architecture

      - name: Typecheck
        run: pnpm typecheck

      - name: JavaScript tests
        run: pnpm turbo run test

      - name: Build
        run: pnpm build

  rust:
    name: Rust
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache Rust
        uses: Swatinem/rust-cache@v2

      - name: Format
        run: cargo fmt --check

      - name: Check
        run: cargo check --workspace --all-targets --all-features

      - name: Clippy
        run: cargo clippy --workspace --all-targets --all-features -- -D warnings

      - name: Tests
        run: cargo test --workspace --all-features
`,
  )
}

async function createBackup() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = absolute(
    `.refactor-backup/${stamp}`,
  )

  for (const relativePath of writes.keys()) {
    if (!(await exists(relativePath))) {
      continue
    }

    const backupPath = resolve(
      backupRoot,
      relativePath,
    )

    await mkdir(dirname(backupPath), {
      recursive: true,
    })

    await cp(
      absolute(relativePath),
      backupPath,
      { recursive: true },
    )
  }

  return backupRoot
}

async function applyWrites() {
  for (const [relativePath, content] of writes) {
    await mkdir(
      dirname(absolute(relativePath)),
      { recursive: true },
    )

    await writeFile(
      absolute(relativePath),
      content,
      'utf8',
    )
  }
}

function printPlan() {
  console.log('')
  console.log(
    shouldWrite
      ? 'Phase 3 修复与重构：'
      : 'Phase 3 预览（尚未写入）：',
  )

  for (const relativePath of writes.keys()) {
    console.log(`  WRITE ${relativePath}`)
  }

  console.log('')
}

async function main() {
  await preflight()

  createCanvasWorkflow()
  createWorkspaceContainer()
  await repairWorkspaceShell()
  createAppShell()

  await replaceConsoleErrorBoundaries()
  await fixApplicationLifecycleLogging()
  await updateDependencies()
  createQualityWorkflow()

  printPlan()

  if (!shouldWrite) {
    console.log('所有前置文件检查完成。')
    console.log('')
    console.log('执行以下命令实际写入：')
    console.log('')
    console.log(
      '  node scripts/refactor-architecture-phase3.mjs --write',
    )
    console.log('')
    return
  }

  const backupRoot = await createBackup()
  await applyWrites()

  console.log(
    `备份目录：${relative(root, backupRoot)}`,
  )
  console.log('')
  console.log('修改完成。必须执行：')
  console.log('')
  console.log('  pnpm install')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm test:architecture')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm build')
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error('Phase 3 脚本执行失败。')
  console.error(
    '未传入 --write 时不会修改仓库。',
  )
  console.error(error)
  process.exitCode = 1
})