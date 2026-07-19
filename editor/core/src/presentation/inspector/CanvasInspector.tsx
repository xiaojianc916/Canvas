import { Separator } from '@hybrid-canvas/design-system'
import { useValue } from 'tldraw'

import { useEditor, useExtensionRegistration } from '../../react/editor-context'

export function CanvasInspector() {
  const editor = useEditor()
  const registration = useExtensionRegistration()
  const selectedShapes = useValue('selected shapes', () => editor?.getSelectedShapes() ?? [], [editor])
  const selectionBounds = useValue('selection bounds', () => editor?.getSelectionPageBounds() ?? null, [editor])
  const count = selectedShapes.length

  if (count === 0) {
    return (
      <InspectorEmptyState description="选择画布中的对象以查看和修改属性。" title="未选择对象" />
    )
  }

  if (count > 1) {
    return (
      <section className="py-4 text-center">
        <p className="text-[12px] font-medium">已选择 {count} 个对象</p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          多选状态只显示所有对象共有的可编辑属性。
        </p>
      </section>
    )
  }

  const firstShape = selectedShapes[0]
  const shapeLabel = getShapeDisplayLabel(firstShape?.type, registration?.shapeLabels)

  return (
    <div>
      <section className="pb-4">
        <header className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">当前选择</p>
          <h2 className="mt-1 text-[12px] font-semibold">{shapeLabel ?? '对象'}</h2>
        </header>
        {selectionBounds ? (
          <div className="grid grid-cols-2 gap-2">
            <ReadOnlyValue label="X" value={Math.round(selectionBounds.x)} />
            <ReadOnlyValue label="Y" value={Math.round(selectionBounds.y)} />
            <ReadOnlyValue label="宽度" value={Math.round(selectionBounds.width)} />
            <ReadOnlyValue label="高度" value={Math.round(selectionBounds.height)} />
          </div>
        ) : null}
      </section>
      <Separator />
      <section className="py-4">
        <p className="text-[11px] leading-5 text-muted-foreground">
          编辑命令尚未连接到领域 Command。在接入之前，这里只显示真实选择状态，不提供伪修改能力。
        </p>
      </section>
    </div>
  )
}

interface ReadOnlyValueProps {
  readonly label: string
  readonly value: number
}

function ReadOnlyValue({ label, value }: ReadOnlyValueProps) {
  return (
    <div>
      <span className="mb-1 block text-[10px] text-muted-foreground">{label}</span>
      <div className="flex h-8 items-center justify-between rounded-md border bg-background px-2">
        <span className="text-[11px]">{value}</span>
        <span className="text-[9px] text-muted-foreground">px</span>
      </div>
    </div>
  )
}

function InspectorEmptyState({
  title,
  description,
}: {
  readonly title: string
  readonly description: string
}) {
  return (
    <section className="px-3 py-10 text-center">
      <p className="text-[12px] font-medium">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
    </section>
  )
}

function getShapeDisplayLabel(
  shapeType: string | undefined,
  extensionLabels: Readonly<Record<string, string>> | undefined,
): string | null {
  if (!shapeType) return null
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
