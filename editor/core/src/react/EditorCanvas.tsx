import { Minus, Plus } from '@mynaui/icons-react'
import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  type Editor,
  type TLComponents,
  type TLUiActionsContextType,
  type TLUiOverrides,
  Tldraw,
  type TldrawProps,
  useActions,
  useEditor as useTldrawEditor,
  useValue,
} from 'tldraw'

import type { EditorSession } from '../runtime/editor-session'
import { CanvasToolbar } from './CanvasToolbar'
import {
  useBindEditorSession,
  useTldrawLicenseKey,
} from './editor-context'

export const HYBRID_CANVAS_SAVE_ACTION_ID =
  'hybrid-canvas.save'

const CANVAS_COMPONENTS: TLComponents = {
  InFrontOfTheCanvas: CanvasUiOverlay,
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

  const tldrawProps =
    useMemo((): TldrawProps => {
      const base: TldrawProps = {
        hideUi: true,
        licenseKey,
        store,
        onMount: setEditor,
        overrides,
        components: CANVAS_COMPONENTS,
        options: {
          maxPages: 100,
        },
        shapeUtils:
          registration.shapeUtils,
        bindingUtils:
          registration.bindingUtils,
      }

      if (hasTools) {
        base.tools = registration.tools
      }

      return base
    }, [
      store,
      registration,
      hasTools,
      licenseKey,
      overrides,
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

function CanvasUiOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <CanvasToolbar />
      <CanvasZoomControl />
    </div>
  )
}

function CanvasZoomControl() {
  const editor = useTldrawEditor()
  const actions = useActions()

  const zoomPercentage = useValue(
    'canvas zoom',
    () =>
      Math.round(
        editor.getZoomLevel() * 100,
      ),
    [editor],
  )

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl">
      <button
        aria-label="缩小"
        className="grid size-8 place-items-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() =>
          invokeAction(actions, 'zoom-out')
        }
        type="button"
      >
        <Minus className="size-3.5" />
      </button>

      <button
        aria-label="重置缩放"
        className="h-8 min-w-12 border-x px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() =>
          invokeAction(actions, 'zoom-to-100')
        }
        type="button"
      >
        {zoomPercentage}%
      </button>

      <button
        aria-label="放大"
        className="grid size-8 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() =>
          invokeAction(actions, 'zoom-in')
        }
        type="button"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

function invokeAction(
  actions: TLUiActionsContextType,
  actionId: string,
): void {
  const action = actions[actionId]

  if (!action) {
    throw new Error('TLDRAW_ACTION_NOT_REGISTERED:' + actionId)
  }

  void action.onSelect('toolbar')
}

export { useEditor } from './editor-context'
