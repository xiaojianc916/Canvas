import { EditorProvider } from '@hybrid-canvas/canvas/react'
import { applyThemePreference, ConfirmationDialog } from '@hybrid-canvas/design-system'
import { error as reportDiagnosticError } from '@hybrid-canvas/foundations-observability'
import type { MainWindowController } from '@hybrid-canvas/platforms-desktop-runtime'
import type { SettingsStore } from '@hybrid-canvas/settings'
import { SettingsDialog } from '@hybrid-canvas/settings/react'
import type { CommandRegistry } from '@hybrid-canvas/workspace/application'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'
import { CommandPalette } from '@hybrid-canvas/workspace/react'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ApplicationTerminationCoordinator } from '../application/termination/application-termination-coordinator'
import { UiErrorBoundary } from './boundaries/UiErrorBoundary'
import { useGlobalCommandShortcuts } from './commands/useGlobalCommandShortcuts'
import { reportUiError as reportError, UiFeedbackRegion } from './ui/ui-feedback'
import { type WorkspaceCanvasUIPort, WorkspaceContainer } from './workspace/WorkspaceContainer'

export interface AppShellRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: WorkspaceCanvasUIPort
  readonly termination: ApplicationTerminationCoordinator
  readonly mainWindow: MainWindowController
  readonly settings: SettingsStore
}

export interface AppShellProps {
  readonly runtime: AppShellRuntime
}

const GLOBAL_COMMAND_SHORTCUTS = [
  {
    key: 'k',
    commandId: 'application.toggle-command-palette',
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

export function AppShell({ runtime }: AppShellProps) {
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const [isSettingsOpen, setSettingsOpen] = useState(false)

  const [failedCanvasTitle, setFailedCanvasTitle] = useState<string | null>(null)

  const termination = useSyncExternalStore(
    runtime.termination.subscribe,
    runtime.termination.getSnapshot,
    runtime.termination.getSnapshot,
  )

  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((open) => !open)
  }, [])

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])

  const openSettings = useCallback(() => setSettingsOpen(true), [])

  const createCanvasWithFeedback = useCallback(
    (title: string) => {
      try {
        runtime.canvases.create(title)
        setFailedCanvasTitle(null)
      } catch (cause) {
        reportDiagnosticError('canvas create failed', {
          scope: 'app-shell',
          operation: 'create-canvas',
          cause,
        })

        setFailedCanvasTitle(title)
      }
    },
    [runtime.canvases],
  )

  const requestApplicationClose = useCallback(() => {
    runtime.termination.request('window-close')
  }, [runtime.termination])

  const minimizeWindow = useCallback(() => {
    void runtime.mainWindow.minimize().catch((cause: unknown) => {
      reportError('main window minimize failed', {
        scope: 'app-shell',
        operation: 'minimize-window',
        cause,
      })
    })
  }, [runtime.mainWindow])

  const maximizeWindow = useCallback(() => {
    void runtime.mainWindow.toggleMaximize().catch((cause: unknown) => {
      reportError('main window maximize failed', {
        scope: 'app-shell',
        operation: 'toggle-maximize-window',
        cause,
      })
    })
  }, [runtime.mainWindow])

  const startWindowDragging = useCallback(() => {
    void runtime.mainWindow.startDragging().catch((cause: unknown) => {
      reportError('main window drag failed', {
        scope: 'app-shell',
        operation: 'start-window-dragging',
        cause,
      })
    })
  }, [runtime.mainWindow])

  useApplicationCommands(runtime, toggleCommandPalette, createCanvasWithFeedback)

  useEffect(() => {
    let active = true

    void runtime.settings.load().then(
      (settings) => {
        if (!active) {
          return
        }

        applyThemePreference(settings.theme)
      },
      (cause: unknown) => {
        if (!active) {
          return
        }

        reportError('settings load failed', {
          scope: 'app-shell',
          operation: 'load-settings',
          cause,
        })
      },
    )

    return () => {
      active = false
    }
  }, [runtime.settings])

  useGlobalCommandShortcuts(runtime.commands, GLOBAL_COMMAND_SHORTCUTS)

  useMainWindowCloseRequest(runtime.mainWindow, requestApplicationClose)

  const workspacePort = useMemo(
    () => ({
      canvases: {
        ...runtime.canvases,
        create: createCanvasWithFeedback,
      },
      workspace: runtime.workspace,
    }),
    [createCanvasWithFeedback, runtime.canvases, runtime.workspace],
  )

  return (
    <EditorProvider>
      <UiErrorBoundary area="工作区">
        <WorkspaceContainer
          onCommandPaletteOpen={openCommandPalette}
          onSettingsOpen={openSettings}
          onWindowClose={requestApplicationClose}
          onWindowMaximize={maximizeWindow}
          onWindowMinimize={minimizeWindow}
          onWindowStartDragging={startWindowDragging}
          port={workspacePort}
        />
      </UiErrorBoundary>

      <CommandPalette
        onOpenChange={setCommandPaletteOpen}
        open={isCommandPaletteOpen}
        registry={runtime.commands}
      />

      <SettingsDialog
        onOpenChange={setSettingsOpen}
        open={isSettingsOpen}
        store={runtime.settings}
      />

      <UiFeedbackRegion />

      <ConfirmationDialog
        cancelLabel="取消"
        confirmLabel="重试"
        description="无法新建画布，请重试。"
        onCancel={() => {
          setFailedCanvasTitle(null)
        }}
        onConfirm={() => {
          if (!failedCanvasTitle) {
            return
          }

          createCanvasWithFeedback(failedCanvasTitle)
        }}
        open={failedCanvasTitle !== null}
        title="新建画布失败"
      />

      <ConfirmationDialog
        confirmLabel="放弃全部并退出"
        description={
          termination.state === 'confirmation-required'
            ? `有 ${termination.sessionIds.length} 个画布包含未保存的更改。`
            : ''
        }
        destructive
        onCancel={runtime.termination.cancel}
        onConfirm={runtime.termination.confirmDiscard}
        open={termination.state === 'confirmation-required'}
        title="退出并放弃未保存的更改？"
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
    let unsubscribe: (() => void) | undefined

    void mainWindow.onCloseRequested(onCloseRequested).then(
      (nextUnsubscribe) => {
        if (disposed) {
          nextUnsubscribe()
          return
        }

        unsubscribe = nextUnsubscribe
      },
      (cause: unknown) => {
        if (!disposed) {
          reportError('main window close listener registration failed', {
            scope: 'app-shell',
            operation: 'register-close-listener',
            cause,
          })
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
  createCanvas: (title: string) => void,
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
        label: '新建画布',
        category: '文件',
        shortcut: 'Ctrl+N',
        execute() {
          createCanvas('未命名画布')
        },
      }),

      runtime.commands.register({
        id: 'workspace.open-canvas',
        label: '打开画布',
        category: '文件',
        shortcut: 'Ctrl+O',
        execute: runtime.canvases.open,
      }),
    ]

    return () => {
      for (let index = unregister.length - 1; index >= 0; index -= 1) {
        unregister[index]?.()
      }
    }
  }, [createCanvas, runtime, toggleCommandPalette])
}
