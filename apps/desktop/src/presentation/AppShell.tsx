import { EditorProvider } from '@hybrid-canvas/canvas'
import { CommandPalette } from '@hybrid-canvas/workspace'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ApplicationRuntime } from '../bootstrap/application'
import { SettingsDialog } from '../windows/settings/SettingsShell'
import { useGlobalCommandShortcuts } from './commands/useGlobalCommandShortcuts'
import { UiErrorBoundary } from './boundaries/UiErrorBoundary'
import { WorkspaceContainer } from './workspace/WorkspaceContainer'

export interface AppShellProps {
  readonly runtime: ApplicationRuntime
}

export function AppShell({ runtime }: AppShellProps) {
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [isSettingsOpen, setSettingsOpen] = useState(false)

  useApplicationCommands(runtime, () => setCommandPaletteOpen((open) => !open))
  useGlobalCommandShortcuts(runtime.commands, [
    { key: 'k', commandId: 'application.toggle-command-palette', ctrlOrMeta: true },
    { key: 'n', commandId: 'workspace.create-document', ctrlOrMeta: true },
    { key: 'o', commandId: 'workspace.open-document', ctrlOrMeta: true },
  ])

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const workspacePort = useMemo(
    () => ({ documents: runtime.documents, workspace: runtime.workspace }),
    [runtime.documents, runtime.workspace],
  )

  return (
    <EditorProvider>
      <UiErrorBoundary area="工作区">
        <WorkspaceContainer
          onCommandPaletteOpen={openCommandPalette}
          onSettingsOpen={openSettings}
          port={workspacePort}
        />
      </UiErrorBoundary>
      <CommandPalette
        onOpenChange={setCommandPaletteOpen}
        open={isCommandPaletteOpen}
        registry={runtime.commands}
      />
      <SettingsDialog onOpenChange={setSettingsOpen} open={isSettingsOpen} />
    </EditorProvider>
  )
}

function useApplicationCommands(
  runtime: ApplicationRuntime,
  toggleCommandPalette: () => void,
): void {
  useEffect(() => {
    const unregisterPalette = runtime.commands.register({
      id: 'application.toggle-command-palette',
      label: '切换命令面板',
      category: '应用',
      shortcut: 'Ctrl+K',
      execute: toggleCommandPalette,
    })
    const unregisterCreate = runtime.commands.register({
      id: 'workspace.create-document',
      label: '新建画板',
      category: '文件',
      shortcut: 'Ctrl+N',
      execute() {
        runtime.documents.create('未命名画板', '画板 1')
      },
    })
    const unregisterOpen = runtime.commands.register({
      id: 'workspace.open-document',
      label: '打开画板',
      category: '文件',
      shortcut: 'Ctrl+O',
      execute: runtime.documents.open,
    })
    return () => {
      unregisterOpen()
      unregisterCreate()
      unregisterPalette()
    }
  }, [runtime, toggleCommandPalette])
}
