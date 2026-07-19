import {
  CanvasInspector,
  CanvasStatusLeft,
  CanvasStatusRight,
  EditorCanvas,
  EditorProvider,
} from '@hybrid-canvas/canvas'
import { WorkspaceShell, type WorkspaceShellActions } from '@hybrid-canvas/workspace'
import { useCallback, useSyncExternalStore } from 'react'

import { useApplicationRuntime } from '../../bootstrap/react-providers'

export function MainWindow() {
  const runtime = useApplicationRuntime()
  const workbench = useSyncExternalStore(
    runtime.workspace.subscribe,
    runtime.workspace.getSnapshot,
    runtime.workspace.getSnapshot,
  )

  const handleSave = useCallback(() => {
    const activeSessionId = workbench.activeSessionId
    if (!activeSessionId) {
      return
    }
    void runtime.documents.saveDocument(activeSessionId)
  }, [runtime.documents, workbench.activeSessionId])

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

  const activeDocument = workbench.activeDocument
  const activeEditorSession = workbench.activeSessionId
    ? runtime.editorSessions.get(workbench.activeSessionId)
    : null

  return (
    <EditorProvider>
      <WorkspaceShell
        actions={actions}
        editor={
          activeDocument && activeEditorSession ? (
            <EditorCanvas
              key={activeDocument.sessionId}
              onSave={handleSave}
              session={activeEditorSession}
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
