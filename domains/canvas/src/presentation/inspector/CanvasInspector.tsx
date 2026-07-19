import { Separator } from '@hybrid-canvas/design-system'

import type { CanvasSelectionViewModel } from '../../application/model/canvas-session-view-model'

export interface CanvasInspectorProps {
  readonly selection: CanvasSelectionViewModel
}

export function CanvasInspector({ selection }: CanvasInspectorProps) {
  if (selection.count === 0) {
    return (
      <InspectorEmptyState description="选择画布中的对象以查看和修改属性。" title="未选择对象" />
    )
  }

  if (selection.count > 1) {
    return (
      <section className="py-4 text-center">
        <p className="text-[12px] font-medium">已选择 {selection.count} 个对象</p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          多选状态只显示所有对象共有的可编辑属性。
        </p>
      </section>
    )
  }

  return (
    <div>
      <section className="pb-4">
        <header className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">当前选择</p>
          <h2 className="mt-1 text-[12px] font-semibold">{selection.label ?? '对象'}</h2>
        </header>
        {selection.bounds ? (
          <div className="grid grid-cols-2 gap-2">
            <ReadOnlyValue label="X" value={selection.bounds.x} />
            <ReadOnlyValue label="Y" value={selection.bounds.y} />
            <ReadOnlyValue label="宽度" value={selection.bounds.width} />
            <ReadOnlyValue label="高度" value={selection.bounds.height} />
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
