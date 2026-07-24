import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  DefaultToolbar,
  type Editor,
  type TLComponents,
  type TLUiActionsContextType,
  type TLUiOverrides,
  Tldraw,
  type TldrawProps,
} from 'tldraw'

import type { EditorSession } from '../runtime/editor-session'
import {
  CanvasInspectorStylePanel,
} from './canvas-inspector-portal'
import {
  useBindEditorSession,
  useTldrawLicenseKey,
} from './editor-context'

export const HYBRID_CANVAS_SAVE_ACTION_ID =
  'hybrid-canvas.save'

/**
 * tldraw 负责：
 * - Editor selection
 * - current tool
 * - relevant styles
 * - shared/mixed styles
 * - next-shape styles
 * - StylePanel React context
 *
 * Workspace 只负责：
 * - 右栏布局
 * - 展开/收起
 * - 响应式宽度
 */
function CanvasTopToolbar() {
  return (
    <div className="hc-canvas-top-toolbar">
      <DefaultToolbar />
    </div>
  )
}

const BASE_CANVAS_COMPONENTS: TLComponents = {
  PageMenu: null,
  Toolbar: null,
  TopPanel: CanvasTopToolbar,
}

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
  const licenseKey =
    useTldrawLicenseKey()

  const [editor, setEditor] =
    useState<Editor | null>(null)

  const {
    registration,
    store,
  } = session

  useBindEditorSession(
    isActive ? editor : null,
    isActive ? registration : null,
  )

  const hasTools =
    registration.tools.length > 0

  const overrides =
    useMemo<TLUiOverrides>(
      () =>
        createCanvasUiOverrides(
          onSave,
        ),
      [onSave],
    )

  /*
   * 每个 Editor Session 都有自己的 StylePanel slot，
   * 但只有 active session 可以发布到 Workspace 右侧属性侧边栏。
   */
  const components =
    useMemo<TLComponents>(
      () => ({
        ...BASE_CANVAS_COMPONENTS,

        StylePanel:
          function WorkspacePropertiesInspector() {
            return (
              <CanvasInspectorStylePanel
                active={isActive}
              />
            )
          },
      }),
      [isActive],
    )

  const tldrawProps =
    useMemo((): TldrawProps => {
      const base: TldrawProps = {
        hideUi: false,
        licenseKey,
        store,
        onMount: setEditor,
        overrides,
        components,

        options: {
          maxPages: 100,
          actionShortcutsLocation:
            'toolbar',
        },

        shapeUtils:
          registration.shapeUtils,

        bindingUtils:
          registration.bindingUtils,
      }

      if (hasTools) {
        base.tools =
          registration.tools
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

      return () =>
        session.detachEditor(editor)
    }

    session.detachEditor(editor)

    return undefined
  }, [
    editor,
    isActive,
    session,
  ])

  return (
    <div
      className="relative size-full overflow-hidden bg-canvas"
      data-document-id={
        session.documentId
      }
      data-session-id={
        session.sessionId
      }
    >
      <Tldraw {...tldrawProps} />
    </div>
  )
}

function createCanvasUiOverrides(
  onSave:
    | (() => void)
    | undefined,
): TLUiOverrides {
  return {
    actions(
      _editor,
      actions,
    ): TLUiActionsContextType {
      if (!onSave) {
        return actions
      }

      return {
        ...actions,

        [HYBRID_CANVAS_SAVE_ACTION_ID]: {
          id:
            HYBRID_CANVAS_SAVE_ACTION_ID,

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

export {
  useEditor,
} from './editor-context'
