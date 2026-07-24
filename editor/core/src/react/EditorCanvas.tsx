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

const CANVAS_COMPONENTS: TLComponents = {
  InFrontOfTheCanvas: TldrawOfficialUi,
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
  const [editor, setEditor] = useState<Editor | null>(null)

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

  const tldrawProps = useMemo((): TldrawProps => {
    const base: TldrawProps = {
      /*
       * 不让 tldraw 自动生成第二套默认布局。
       * 官方 Toolbar / Navigation 由 TldrawOfficialUi 放置。
       */
      hideUi: true,
      licenseKey,
      store,
      onMount: setEditor,
      overrides,
      components: CANVAS_COMPONENTS,
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
