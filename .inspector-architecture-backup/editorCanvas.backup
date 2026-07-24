import { useEffect, useMemo, useState } from 'react'
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
  useBindEditorSession,
  useTldrawLicenseKey,
} from './editor-context'

export const HYBRID_CANVAS_SAVE_ACTION_ID =
  'hybrid-canvas.save'

/**
 * 使用 tldraw 默认 UI，只替换产品已经有自己实现的区域。
 *
 * Toolbar 不覆盖，因此由 tldraw 自动渲染默认 Toolbar。
 * NavigationPanel、QuickActions、ActionsMenu 同样使用官方默认实现。
 *
 * PageMenu：
 * Canvas 已经有自己的页面与工作区管理，所以禁用。
 *
 * StylePanel：
 * Canvas 使用原来的 Workspace CanvasInspectorContent，
 * 避免同时出现两套右侧属性面板。
 */
function CanvasTopToolbar() {
  return (
    <div className="hc-canvas-top-toolbar">
      {/*
       * 使用 tldraw 官方 DefaultToolbar。
       *
       * 工具定义、按钮样式、激活状态、快捷键、
       * QuickActions 和 overflow 均由 tldraw 管理。
       */}
      <DefaultToolbar />
    </div>
  )
}

const CANVAS_COMPONENTS: TLComponents = {
  PageMenu: null,
  StylePanel: null,
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
  const licenseKey = useTldrawLicenseKey()
  const [editor, setEditor] =
    useState<Editor | null>(null)

  const { registration, store } = session

  useBindEditorSession(
    isActive ? editor : null,
    isActive ? registration : null,
  )

  const hasTools =
    registration.tools.length > 0

  const overrides = useMemo<TLUiOverrides>(
    () => createCanvasUiOverrides(onSave),
    [onSave],
  )

  const tldrawProps = useMemo((): TldrawProps => {
    const base: TldrawProps = {
      /*
       * 关键点：
       *
       * 不再 hideUi。
       * 让 tldraw 渲染完整的默认 UI 与默认布局。
       */
      hideUi: false,
      licenseKey,
      store,
      onMount: setEditor,
      overrides,
      components: CANVAS_COMPONENTS,
      options: {
        maxPages: 100,
        actionShortcutsLocation: 'toolbar',
      },
      shapeUtils: registration.shapeUtils,
      bindingUtils: registration.bindingUtils,
    }

    if (hasTools) {
      base.tools = registration.tools
    }

    return base
  }, [
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
      data-document-id={session.documentId}
      data-session-id={session.sessionId}
    >
      <Tldraw {...tldrawProps} />
    </div>
  )
}

function createCanvasUiOverrides(
  onSave: (() => void) | undefined,
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

export {
  useEditor,
} from './editor-context'
