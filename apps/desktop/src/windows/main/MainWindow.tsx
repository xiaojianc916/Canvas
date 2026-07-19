import type { Editor } from 'tldraw'

import {
  CanvasInspector,
  CanvasStatusLeft,
  CanvasStatusRight,
  EditorCanvas,
  EditorProvider,
} from '@hybrid-canvas/canvas'
import { flowchartExtension } from '@hybrid-canvas/flowchart'
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

  const handleSave = useCallback(
    (editor: Editor) => {
      const snapshot = editor.getSnapshot()
      const activeDoc = workbench.activeDocument
      if (!activeDoc) return
      void runtime.files.saveDocument(activeDoc.documentId, snapshot)
    },
    [runtime.files, workbench.activeDocument],
  )

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
      void runtime.workspace.activateDocument(sessionId)
    },
    closeDocument(sessionId) {
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
    <EditorProvider>
      <WorkspaceShell
        actions={actions}
        editor={
          activeDocument ? (
            <EditorCanvas
              documentId={activeDocument.documentId}
              extensions={[flowchartExtension]}
              key={activeDocument.sessionId}
              onSave={handleSave}
              sessionId={activeDocument.sessionId}
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
  if (!existingTitles.includes(baseTitle)) return baseTitle
  let suffix = 2
  while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
    suffix += 1
  }
  return `${baseTitle} ${suffix}`
}
