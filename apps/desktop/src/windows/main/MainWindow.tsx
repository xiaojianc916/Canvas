import {
  CanvasInspector,
  CanvasStatusLeft,
  CanvasStatusRight,
  EditorProvider,
  EditorSessionHost,
} from '@hybrid-canvas/canvas'
import { WorkspaceShell, type WorkspaceShellActions } from '@hybrid-canvas/workspace'
import { useCallback, useMemo, useSyncExternalStore } from 'react'

import { useApplicationRuntime } from '../../bootstrap/react-providers'

export function MainWindow() {
  const runtime = useApplicationRuntime()
  const workbench = useSyncExternalStore(
    runtime.workspace.subscribe,
    runtime.workspace.getSnapshot,
    runtime.workspace.getSnapshot,
  )

  const handleSave = useCallback((sessionId: string) => {
    void runtime.documents.saveDocument(sessionId)
  }, [runtime.documents])

  const actions: WorkspaceShellActions = {
    createDocument() {
      void runtime.documents.createDocument(
        createUntitledDocumentTitle(workbench.tabs.map((tab) => tab.title)),
        '画板 1',
      )
    },
    openDocument() {
      void runtime.documents.openDocument()
    },
    activateDocument(sessionId) {
      void runtime.workspace.activateDocument(sessionId)
    },
    closeDocument(sessionId) {
      void runtime.documents.closeDocument(sessionId)
    },
    activatePage(_pageId) {
      /* 接入 Document Application Command 后实现 */
    },
    createPage() {
      /* 接入 Document Application Command 后实现 */
    },
    openCommandPalette() {
      /* 接入 Command Registry 后由 Workspace Presentation 打开 */
    },
    openSettingsWindow() {
      void runtime.windows.openSettingsWindow()
    },
  }

  const hostedSessions = useMemo(
    () =>
      workbench.tabs.flatMap((tab) => {
        const session = runtime.editorSessions.get(tab.sessionId)
        return session ? [{ sessionId: tab.sessionId, session }] : []
      }),
    [runtime.editorSessions, workbench.tabs],
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
    </EditorProvider>
  )
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
