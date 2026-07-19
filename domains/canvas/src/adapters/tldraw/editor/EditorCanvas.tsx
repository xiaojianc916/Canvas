import { TooltipProvider } from '@hybrid-canvas/design-system'
import { Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Editor, Tldraw, useValue } from 'tldraw'

import type { CanvasSessionViewModel } from '../../../application/model/canvas-session-view-model'
import { CanvasToolbar } from '../toolbar/CanvasToolbar'

export interface EditorCanvasProps {
  readonly sessionId: string
  readonly documentId: string
  readonly onSessionChange: (model: CanvasSessionViewModel) => void
}

export function EditorCanvas({ sessionId, documentId, onSessionChange }: EditorCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null)

  return (
    <TooltipProvider delayDuration={450}>
      <div
        className="relative size-full overflow-hidden bg-canvas"
        data-document-id={documentId}
        data-session-id={sessionId}
      >
        <Tldraw hideUi onMount={setEditor} options={{ maxPages: 100 }} />
        {editor ? <CanvasEditorOverlay editor={editor} onSessionChange={onSessionChange} /> : null}
      </div>
    </TooltipProvider>
  )
}

interface CanvasEditorOverlayProps {
  readonly editor: Editor
  readonly onSessionChange: (model: CanvasSessionViewModel) => void
}

function CanvasEditorOverlay({ editor, onSessionChange }: CanvasEditorOverlayProps) {
  const activeToolId = useValue('active tool', () => editor.getCurrentToolId(), [editor])
  const zoomPercentage = useValue('canvas zoom', () => Math.round(editor.getZoomLevel() * 100), [
    editor,
  ])
  const selectedShapes = useValue('selected shapes', () => editor.getSelectedShapes(), [editor])
  const selectionBounds = useValue('selection bounds', () => editor.getSelectionPageBounds(), [
    editor,
  ])

  useEffect(() => {
    const firstShape = selectedShapes[0]
    onSessionChange({
      activeToolId: normalizeToolId(activeToolId),
      zoomPercentage,
      gridSize: 22,
      snapEnabled: true,
      selection: {
        count: selectedShapes.length,
        label: selectedShapes.length === 1 ? getShapeDisplayLabel(firstShape?.type) : null,
        bounds: selectionBounds
          ? {
              x: Math.round(selectionBounds.x),
              y: Math.round(selectionBounds.y),
              width: Math.round(selectionBounds.width),
              height: Math.round(selectionBounds.height),
            }
          : null,
      },
    })
  }, [activeToolId, onSessionChange, selectedShapes, selectionBounds, zoomPercentage])

  return (
    <>
      <CanvasToolbar editor={editor} />
      <CanvasZoomControl editor={editor} zoomPercentage={zoomPercentage} />
    </>
  )
}

interface CanvasZoomControlProps {
  readonly editor: Editor
  readonly zoomPercentage: number
}

function CanvasZoomControl({ editor, zoomPercentage }: CanvasZoomControlProps) {
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

function normalizeToolId(toolId: string): CanvasSessionViewModel['activeToolId'] {
  switch (toolId) {
    case 'hand':
    case 'geo':
    case 'arrow':
    case 'text':
    case 'draw':
    case 'note':
      return toolId
    default:
      return 'select'
  }
}

function getShapeDisplayLabel(shapeType: string | undefined): string | null {
  switch (shapeType) {
    case 'geo':
      return '形状'
    case 'arrow':
      return '连接线'
    case 'text':
      return '文本'
    case 'draw':
      return '笔迹'
    case 'note':
      return '便签'
    case 'image':
      return '图片'
    default:
      return shapeType ?? null
  }
}
