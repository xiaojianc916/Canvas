import {
  CanvasInspector,
  CanvasStatusLeft,
  CanvasStatusRight,
  EditorProvider,
  EditorSessionHost,
} from '@hybrid-canvas/canvas'
import {
  CommandPalette,
  WorkspaceShell,
  type WorkspaceShellActions,
} from '@hybrid-canvas/workspace'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { SettingsDialog } from '../windows/settings/SettingsShell'
import { useApplicationRuntime } from './react-providers'

export function AppShell() {
  const runtime = useApplicationRuntime()
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [isSettingsOpen, setSettingsOpen] = useState(false)
  const workbench = useSyncExternalStore(
    runtime.workspace.subscribe,
    runtime.workspace.getSnapshot,
    runtime.workspace.getSnapshot,
  )

  const handleSave = useCallback(
    (sessionId: string) => {
      void runtime.documents.save(sessionId)
    },
    [runtime.documents],
  )

  useEffect(() => {
    const unregisterCreate = runtime.commands.register({
      id: 'workspace.create-document',
      label: '新建画板',
      category: '文件',
      shortcut: 'Ctrl+N',
      execute() {
        return runtime.documents.create(
          createUntitledDocumentTitle(runtime.workspace.getSnapshot().tabs.map((tab) => tab.title)),
          '画板 1',
        )
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
    }
  }, [runtime])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const actions: WorkspaceShellActions = {
    createDocument() {
      runtime.documents.create(
        createUntitledDocumentTitle(workbench.tabs.map((tab) => tab.title)),
        '画板 1',
      )
    },
    openDocument() {
      void runtime.documents.open()
    },
    activateDocument(sessionId) {
      runtime.workspace.activateDocument(sessionId)
    },
    closeDocument(sessionId) {
      runtime.documents.close(sessionId)
    },
    activatePage(_pageId) {},
    createPage() {},
    openCommandPalette() {
      setCommandPaletteOpen(true)
    },
    openSettingsWindow() {
      setSettingsOpen(true)
    },
    minimizeWindow() {
      void invokeWindowAction('minimize')
    },
    maximizeWindow() {
      void invokeWindowAction('toggleMaximize')
    },
    closeWindow() {
      void invokeWindowAction('close')
    },
    startWindowDragging() {
      void invokeWindowAction('startDragging')
    },
  }

  const hostedSessions = useMemo(
    () =>
      workbench.tabs.flatMap((tab) => {
        const session = runtime.documents.getEditorSession(tab.sessionId)
        return session ? [{ sessionId: tab.sessionId, session }] : []
      }),
    [runtime.documents, workbench.tabs],
  )

  return (
    <EditorProvider>
      <WorkspaceShell
        actions={actions}
        editor={
          workbench.activeDocument ? (
            <EditorSessionHost
              activeSessionId={workbench.activeSessionId}
              onSave={handleSave}
              sessions={hostedSessions}
            />
          ) : null
        }
        inspector={<CanvasInspector />}
        model={workbench}
        statusLeft={<CanvasStatusLeft />}
        statusRight={<CanvasStatusRight />}
      />
      <CommandPalette
        onOpenChange={setCommandPaletteOpen}
        open={isCommandPaletteOpen}
        registry={runtime.commands}
      />
      <SettingsDialog onOpenChange={setSettingsOpen} open={isSettingsOpen} />
    </EditorProvider>
  )
}

async function invokeWindowAction(
  action: 'minimize' | 'toggleMaximize' | 'close' | 'startDragging',
): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) {
    return
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow()[action]()
}

function createUntitledDocumentTitle(existingTitles: readonly string[]): string {
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
