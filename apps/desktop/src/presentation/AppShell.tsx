import { EditorProvider } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'
import { CommandPalette } from '@hybrid-canvas/workspace/react'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import type { MainWindowController } from '@hybrid-canvas/platforms-desktop-runtime'
import type { CommandRegistry } from '@hybrid-canvas/workspace/application'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

import type { ApplicationTerminationCoordinator } from '../application/termination/application-termination-coordinator'
import { UiErrorBoundary } from './boundaries/UiErrorBoundary'
import { SettingsDialog } from './settings/SettingsDialog'
import { useGlobalCommandShortcuts } from './commands/useGlobalCommandShortcuts'
import { type WorkspaceCanvasUIPort, WorkspaceContainer } from './workspace/WorkspaceContainer'

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
  const termination = useSyncExternalStore(
    runtime.termination.subscribe,
    runtime.termination.getSnapshot,
    runtime.termination.getSnapshot,
  )

  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((open) => !open)
  }, [])

  useApplicationCommands(runtime, toggleCommandPalette)
  useGlobalCommandShortcuts(runtime.commands, GLOBAL_COMMAND_SHORTCUTS)

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const requestApplicationClose = useCallback(() => {
    runtime.termination.request('window-close')
  }, [runtime.termination])
  useMainWindowCloseRequest(runtime.mainWindow, requestApplicationClose)

  const workspacePort = useMemo(
    () => ({ canvases: runtime.canvases, workspace: runtime.workspace }),
    [runtime.canvases, runtime.workspace],
  )

  return (
    <EditorProvider>
      <UiErrorBoundary area="工作区">
        <WorkspaceContainer
          onCommandPaletteOpen={openCommandPalette}
          onSettingsOpen={openSettings}
          onWindowClose={requestApplicationClose}
          onWindowMaximize={() => void runtime.mainWindow.toggleMaximize()}
          onWindowMinimize={() => void runtime.mainWindow.minimize()}
          onWindowStartDragging={() => void runtime.mainWindow.startDragging()}
          port={workspacePort}
        />
      </UiErrorBoundary>
      <CommandPalette
        onOpenChange={setCommandPaletteOpen}
        open={isCommandPaletteOpen}
        registry={runtime.commands}
      />
      <SettingsDialog onOpenChange={setSettingsOpen} open={isSettingsOpen} />
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

      <ConfirmationDialog
        cancelLabel="返回应用"
        confirmLabel="重试退出"
        description={
          termination.state === 'termination-failed'
            ? `原生窗口未能完成退出：${termination.message}`
            : ''
        }
        onCancel={runtime.termination.cancel}
        onConfirm={runtime.termination.retry}
        open={termination.state === 'termination-failed'}
        title="应用退出失败"
      />
    </EditorProvider>    </EditorProvider>
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
      (error: unknown) => {
        if (!disposed) {
          console.error('Failed to register the main-window close listener.', error)
        }
      },
    )

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [mainWindow, onCloseRequested])
}

function useApplicationCommands(runtime: AppShellRuntime, toggleCommandPalette: () => void): void {
  useEffect(() => {
    const unregisterPalette = runtime.commands.register({
      id: 'application.toggle-command-palette',
      label: '切换命令面板',
      category: '应用',
      shortcut: 'Ctrl+K',
      execute: toggleCommandPalette,
    })
    const unregisterCreate = runtime.commands.register({
      id: 'workspace.create-canvas',
      label: '新建画板',
      category: '文件',
      shortcut: 'Ctrl+N',
      execute() {
        runtime.canvases.create('未命名画板')
      },
    })
    const unregisterOpen = runtime.commands.register({
      id: 'workspace.open-canvas',
      label: '打开画板',
      category: '文件',
      shortcut: 'Ctrl+O',
      execute: runtime.canvases.open,
    })
    return () => {
      unregisterOpen()
      unregisterCreate()
      unregisterPalette()
    }
  }, [runtime, toggleCommandPalette])
}
