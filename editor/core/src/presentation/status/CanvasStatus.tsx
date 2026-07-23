import { Grid, LinkTwo, MousePointer } from '@mynaui/icons-react'import { useValue } from 'tldraw'

import { useEditor, useExtensionRegistration } from '../../react/editor-context'

export function CanvasStatusLeft() {
  const editor = useEditor()
  const registration = useExtensionRegistration()
  const selectedShapes = useValue('selected shapes', () => editor?.getSelectedShapes() ?? [], [
    editor,
  ])
  const selectionBounds = useValue(
    'selection bounds',
    () => editor?.getSelectionPageBounds() ?? null,
    [editor],
  )

  const shapeLabel =
    selectedShapes.length === 1
      ? getShapeDisplayLabel(selectedShapes[0]?.type, registration?.shapeLabels)
      : null

  return (
    <>
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <MousePointer className="size-3" />
        {selectedShapes.length === 0
          ? '未选择对象'
          : selectedShapes.length === 1
            ? (shapeLabel ?? '已选择 1 个对象')
            : `已选择 ${selectedShapes.length} 个对象`}
      </span>
      {selectionBounds ? (
        <span>
          X {Math.round(selectionBounds.x)} · Y {Math.round(selectionBounds.y)} ·{' '}
          {Math.round(selectionBounds.width)} × {Math.round(selectionBounds.height)} px
        </span>
      ) : null}
    </>
  )
}

export function CanvasStatusRight() {
  const editor = useEditor()
  const zoomPercentage = useValue(
    'canvas zoom',
    () => (editor ? Math.round(editor.getZoomLevel() * 100) : 100),
    [editor],
  )

  return (
    <>
      <span className="flex items-center gap-1.5">
        <Grid className="size-3" />
        网格 22 px
      </span>
      <span className="flex items-center gap-1.5">
        <LinkTwo className="size-3" />
        自动吸附：开
      </span>
      <span>{zoomPercentage}%</span>
    </>
  )
}

function getShapeDisplayLabel(
  shapeType: string | undefined,
  extensionLabels: Readonly<Record<string, string>> | undefined,
): string | null {
  if (!shapeType) {
    return null
  }
  return SHAPE_TYPE_LABELS[shapeType] ?? extensionLabels?.[shapeType] ?? null
}

const SHAPE_TYPE_LABELS: Record<string, string> = {
  geo: '形状',
  arrow: '连接线',
  text: '文本',
  draw: '笔迹',
  note: '便签',
  image: '图片',
}
