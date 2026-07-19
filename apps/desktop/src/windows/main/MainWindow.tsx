import {
  CanvasInspector,
  type CanvasSessionViewModel,
  CanvasStatusLeft,
  CanvasStatusRight,
  EditorCanvas,
  EMPTY_CANVAS_SESSION_VIEW_MODEL,
} from '@hybrid-canvas/canvas'
import { WorkspaceShell, type WorkspaceShellActions } from '@hybrid-canvas/workspace'
import { useCallback, useState, useSyncExternalStore } from 'react'

import { useApplicationRuntime } from '../../bootstrap/react-providers'

export function MainWindow() {
  const runtime = useApplicationRuntime()
  const workbench = useSyncExternalStore(
    runtime.workspace.subscribe,
    runtime.workspace.getSnapshot,
    runtime.workspace.getSnapshot,
  )
  const [canvasSession, setCanvasSession] = useState<CanvasSessionViewModel>(
    EMPTY_CANVAS_SESSION_VIEW_MODEL,
  )

  const handleCanvasSessionChange = useCallback((model: CanvasSessionViewModel) => {
    setCanvasSession(model)
  }, [])

  const actions: WorkspaceShellActions = {
    createDocument() {
      void runtime.workspace.createDocument({
        title: createUntitledDocumentTitle(workbench.tabs.map((tab) => tab.title)),
        initialPageTitle: '画板 1',
      })
    },
    openDocument() {
      void runtime.files.openDocument()
    },
    activateDocument(sessionId) {
      setCanvasSession(EMPTY_CANVAS_SESSION_VIEW_MODEL)
      void runtime.workspace.activateDocument(sessionId)
    },
    closeDocument(sessionId) {
      setCanvasSession(EMPTY_CANVAS_SESSION_VIEW_MODEL)
      void runtime.workspace.closeDocument(sessionId)
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

  return (
    <WorkspaceShell
      actions={actions}
      editor={
        activeDocument ? (
          <EditorCanvas
            documentId={activeDocument.documentId}
            key={activeDocument.sessionId}
            onSessionChange={handleCanvasSessionChange}
            sessionId={activeDocument.sessionId}
          />
        ) : null
      }
      inspector={<CanvasInspector selection={canvasSession.selection} />}
      model={workbench}
      statusLeft={<CanvasStatusLeft model={canvasSession} />}
      statusRight={<CanvasStatusRight model={canvasSession} />}
    />
  )
}

function createUntitledDocumentTitle(existingTitles: readonly string[]): string {
  const baseTitle = '未命名画板'
  if (!existingTitles.includes(baseTitle)) return baseTitle
  let suffix = 2
  while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
    suffix += 1
  }
  return `${baseTitle} ${suffix}`
}
