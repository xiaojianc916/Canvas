import { useEffect, useMemo, useState } from 'react'
import {
  type Editor,
  type TLComponents,
  type TLUiActionsContextType,
  type TLUiOverrides,
  Tldraw,
  type TldrawProps,
} from 'tldraw'

import type { EditorSession } from '../runtime/editor-session'
import { useBindEditorSession, useTldrawLicenseKey } from './editor-context'
import { TldrawOfficialUi } from './TldrawOfficialUi'

export const HYBRID_CANVAS_SAVE_ACTION_ID = 'hybrid-canvas.save'

export interface EditorCanvasProps {
  readonly session: EditorSession
  readonly isActive?: boolean
  readonly onSave?: () => void
}

export function EditorCanvas({
  session,
  isActive = true,
  onSave,
}: EditorCanvasProps) {
  const licenseKey = useTldrawLicenseKey()
  const [editor, setEditor] = useState<Editor | null>(null)

  /**
   * 官方 StylePanel 被 portal 到这个节点。
   *
   * 这样 StylePanel 在 DOM 布局上属于右侧栏，但在 React 树中仍然位于
   * Tldraw 内部，不会丢失 Editor、actions、styles、translation 等 context。
   */
  const [stylePanelHost, setStylePanelHost] =
    useState<HTMLDivElement | null>(null)

  const { registration, store } = session

  useBindEditorSession(
    isActive ? editor : null,
    isActive ? registration : null,
  )

  const hasTools = registration.tools.length > 0

  const overrides = useMemo<TLUiOverrides>(
    () => createCanvasUiOverrides(onSave),
    [onSave],
  )

  const components = useMemo<TLComponents>(
    () => ({
      InFrontOfTheCanvas: function HybridCanvasOfficialUi() {
        return (
          <TldrawOfficialUi
            stylePanelHost={stylePanelHost}
          />
        )
      },
    }),
    [stylePanelHost],
  )

  const tldrawProps = useMemo((): TldrawProps => {
    const base: TldrawProps = {
      /**
       * 禁止 tldraw 自动按照默认坐标重复放置整套 UI。
       *
       * UI context 仍然存在；官方组件由 TldrawOfficialUi 重新组合。
       */
      hideUi: true,
      licenseKey,
      store,
      onMount: setEditor,
      overrides,
      components,
      options: {
        maxPages: 100,
      },
      shapeUtils: registration.shapeUtils,
      bindingUtils: registration.bindingUtils,
    }

    if (hasTools) {
      base.tools = registration.tools
    }

    return base
  }, [
    components,
    hasTools,
    licenseKey,
    overrides,
    registration,
    store,
  ])

  useEffect(() => {
    if (!editor) {
      return
    }

    if (isActive) {
      editor.setCameraOptions({
        ...editor.getCameraOptions(),
        wheelBehavior: 'zoom',
        zoomSpeed: 1,
      })

      editor.updateInstanceState({
        isGridMode: false,
        isToolLocked: true,
      })

      session.attachEditor(editor)

      return () => session.detachEditor(editor)
    }

    session.detachEditor(editor)

    return undefined
  }, [editor, isActive, session])

  return (
    <div
      className="hc-editor-layout size-full overflow-hidden bg-canvas"
      data-document-id={session.documentId}
      data-session-id={session.sessionId}
    >
      <div className="hc-editor-canvas relative min-h-0 min-w-0 overflow-hidden">
        <Tldraw {...tldrawProps} />
      </div>

      <aside
        aria-label="对象属性"
        className="hc-tldraw-style-sidebar"
      >

        <div
          className="hc-tldraw-style-host tl-theme__light"
          ref={setStylePanelHost}
        />
      </aside>
    </div>
  )
}

function createCanvasUiOverrides(
  onSave: (() => void) | undefined,
): TLUiOverrides {
  return {
    actions(_editor, actions): TLUiActionsContextType {
      if (!onSave) {
        return actions
      }

      return {
        ...actions,

        [HYBRID_CANVAS_SAVE_ACTION_ID]: {
          id: HYBRID_CANVAS_SAVE_ACTION_ID,
          label: '保存',
          kbd: 'cmd+s,ctrl+s',

          onSelect() {
            onSave()
          },
        },
      }
    },
  }
}

export { useEditor } from './editor-context'
