import { TooltipProvider } from '@hybrid-canvas/design-system'
import { createTLStore } from '@tldraw/editor'
import { Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Editor, Tldraw, useValue, type TldrawProps, type TLEditorSnapshot } from 'tldraw'

import { CanvasToolbar } from './CanvasToolbar'
import { useBindEditor } from './editor-context'
import { getExtensionRegistration, type HybridCanvasExtension } from './extension-registry'
import { registerExtension } from './extension-registry'

export interface EditorCanvasProps {
  readonly sessionId: string
  readonly documentId: string
  readonly onSave?: (editor: Editor) => void
  readonly initialSnapshot?: TLEditorSnapshot
  readonly extensions?: readonly HybridCanvasExtension[]
}

export function EditorCanvas({
  sessionId,
  documentId,
  onSave,
  initialSnapshot,
  extensions,
}: EditorCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  useBindEditor(editor)

  if (extensions) {
    for (const ext of extensions) {
      registerExtension(ext)
    }
  }

  const registration = getExtensionRegistration()
  const hasShapeUtils = registration.shapeUtils.length > 0
  const hasBindingUtils = registration.bindingUtils.length > 0
  const hasTools = registration.tools.length > 0

  const store = useMemo(() => {
    return createTLStore({
      ...(hasShapeUtils ? { shapeUtils: registration.shapeUtils } : {}),
      ...(hasBindingUtils ? { bindingUtils: registration.bindingUtils } : {}),
      ...(initialSnapshot ? { snapshot: initialSnapshot } : {}),
    })
  }, [initialSnapshot])

  const tldrawProps = useMemo((): TldrawProps => {
    const base: TldrawProps = {
      hideUi: true,
      store,
      onMount: setEditor,
      options: { maxPages: 100 },
    }
    if (hasTools) base.tools = registration.tools
    return base
  }, [store, registration, hasTools])

  const handleSave = useCallback(() => {
    if (editor) onSave?.(editor)
  }, [editor, onSave])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (editor) onSave?.(editor)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [editor, onSave])

  return (
    <TooltipProvider delayDuration={450}>
      <div
        className="relative size-full overflow-hidden bg-canvas"
        data-document-id={documentId}
        data-session-id={sessionId}
      >
        <Tldraw {...tldrawProps} />
        <CanvasToolbar onSave={handleSave} />
        {editor ? <CanvasZoomControl /> : null}
      </div>
    </TooltipProvider>
  )
}

function CanvasZoomControl() {
  const editor = useEditor()
  const zoomPercentage = useValue('canvas zoom', () => editor ? Math.round(editor.getZoomLevel() * 100) : 100, [editor])

  if (!editor) return null

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
