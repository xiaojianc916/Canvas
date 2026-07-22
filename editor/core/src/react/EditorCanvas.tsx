import { Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Editor, Tldraw, type TldrawProps, useValue } from 'tldraw'

import type { EditorSession } from '../runtime/editor-session'
import { CanvasToolbar } from './CanvasToolbar'
import { useBindEditorSession, useEditor } from './editor-context'

const TLDRAW_LICENSE_KEY =
  'tldraw-2026-10-28/WyJKRWdfbFdwZyIsWyIqIl0sMTYsIjIwMjYtMTAtMjgiXQ.lmi81fI8OPFbKs0/HJEW9FHFXxwCvSb/rS29gNvSO9+nXHlk/d62Tg4yzjBBRqfIqNb5Bcuo1lhf/JZ3DOeuYw'

export interface EditorCanvasProps {
  readonly session: EditorSession
  readonly isActive?: boolean
  readonly onSave?: () => void
}

export function EditorCanvas({ session, isActive = true, onSave }: EditorCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const { registration, store } = session
  useBindEditorSession(isActive ? editor : null, isActive ? registration : null)
  const hasTools = registration.tools.length > 0

  const tldrawProps = useMemo((): TldrawProps => {
    const base: TldrawProps = {
      hideUi: true,
      licenseKey: TLDRAW_LICENSE_KEY,
      store,
      onMount: setEditor,
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
  }, [store, registration, hasTools])

  useEffect(() => {
    if (!editor) {
      return
    }
    if (isActive) {
      editor.setCameraOptions({
        ...editor.getCameraOptions(),
        wheelBehavior: 'zoom' as const,
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

  const handleSave = useCallback(() => {
    onSave?.()
  }, [onSave])

  useEffect(() => {
    if (!isActive || !onSave) {
      return
    }
    const save = onSave
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isActive, onSave])

  return (
    <div
      className="relative size-full overflow-hidden bg-canvas"
      data-document-id={session.documentId}
      data-session-id={session.sessionId}
    >
      <Tldraw {...tldrawProps} />
      <CanvasToolbar onSave={handleSave} />
      {editor ? <CanvasZoomControl /> : null}
    </div>
  )
}

function CanvasZoomControl() {
  const editor = useEditor()
  const zoomPercentage = useValue(
    'canvas zoom',
    () => (editor ? Math.round(editor.getZoomLevel() * 100) : 100),
    [editor],
  )

  if (!editor) {
    return null
  }

  return (
    <div className="absolute bottom-3 right-3 z-20 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl">
      <button
        aria-label="缩小"
        className="grid size-8 place-items-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => editor.zoomOut()}
        type="button"
      >
        <Minus className="size-3.5" />
      </button>
      <button
        aria-label="重置缩放"
        className="h-8 min-w-12 border-x px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => editor.resetZoom()}
        type="button"
      >
        {zoomPercentage}%
      </button>
      <button
        aria-label="放大"
        className="grid size-8 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => editor.zoomIn()}
        type="button"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

// Re-export for use by external components
export { useEditor } from './editor-context'
