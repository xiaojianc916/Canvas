import 'tldraw/tldraw.css'

import { EditorProvider } from '@hybrid-canvas/canvas/react'
import { CommandPalette } from '@hybrid-canvas/workspace/react'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import type { CanvasService } from '@hybrid-canvas/canvas-session'
import type { MainWindowController } from '@hybrid-canvas/platforms-desktop-runtime'
import type { CommandRegistry, WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

import type { ApplicationTerminationCoordinator } from '../application/termination/application-termination-coordinator'
import { SettingsDialog } from '../windows/settings/SettingsShell'
import { UiErrorBoundary } from './boundaries/UiErrorBoundary'
import { useGlobalCommandShortcuts } from './commands/useGlobalCommandShortcuts'
import { WorkspaceContainer } from './workspace/WorkspaceContainer'

export interface AppShellRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: CanvasService
  readonly termination: ApplicationTerminationCoordinator
  readonly mainWindow: MainWindowController
}

export interface AppShellProps {
  readonly runtime: AppShellRuntime
}

export function AppShell({ runtime }: AppShellProps) {
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [isSettingsOpen, setSettingsOpen] = useState(false)
  const termination = useSyncExternalStore(
    runtime.termination.subscribe,
    runtime.termination.getSnapshot,
    runtime.termination.getSnapshot,
  )

  useApplicationCommands(runtime, () => setCommandPaletteOpen((open) => !open))
  useGlobalCommandShortcuts(runtime.commands, [
    { key: 'k', commandId: 'application.toggle-command-palette', ctrlOrMeta: true },
    { key: 'n', commandId: 'workspace.create-canvas', ctrlOrMeta: true },
    { key: 'o', commandId: 'workspace.open-canvas', ctrlOrMeta: true },
  ])

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const requestApplicationClose = useCallback(() => {
    runtime.termination.request('window-close')
  }, [runtime.termination])
  useEffect(() => {
    let unlisten: (() => void) | undefined
    void runtime.mainWindow.onCloseRequested(requestApplicationClose).then((dispose) => {
      unlisten = dispose
    })
    return () => unlisten?.()
  }, [requestApplicationClose, runtime.mainWindow])

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
      {termination.state === 'confirmation-required' ? (
        <div
          className="fixed inset-0 z-100 grid place-items-center bg-black/30"
          role="presentation"
        >
          <section
            aria-labelledby="exit-title"
            aria-modal="true"
            className="w-96 rounded-xl border border-divider bg-background p-5 shadow-2xl"
            role="dialog"
          >
            <h2 className="text-base font-semibold" id="exit-title">
              退出并放弃未保存的更改？
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              有 {termination.sessionIds.length} 个画布包含未保存的更改。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md px-3 py-2 text-sm hover:bg-muted"
                onClick={() => runtime.termination.cancel()}
                type="button"
              >
                取消
              </button>
              <button
                className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground"
                onClick={runtime.termination.confirmDiscard}
                type="button"
              >
                放弃全部并退出
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </EditorProvider>
  )
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
