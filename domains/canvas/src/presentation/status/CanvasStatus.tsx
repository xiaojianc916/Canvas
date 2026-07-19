import { Grid2X2, Link2, MousePointer2 } from 'lucide-react'

import type { CanvasSessionViewModel } from '../../application/model/canvas-session-view-model'

export interface CanvasStatusProps {
  readonly model: CanvasSessionViewModel
}

export function CanvasStatusLeft({ model }: CanvasStatusProps) {
  const { selection } = model
  return (
    <>
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <MousePointer2 className="size-3" />
        {selection.count === 0
          ? '未选择对象'
          : selection.count === 1
            ? (selection.label ?? '已选择 1 个对象')
            : `已选择 ${selection.count} 个对象`}
      </span>
      {selection.bounds ? (
        <span>
          X {selection.bounds.x} · Y {selection.bounds.y} · {selection.bounds.width} ×{' '}
          {selection.bounds.height} px
        </span>
      ) : null}
    </>
  )
}

export function CanvasStatusRight({ model }: CanvasStatusProps) {
  return (
    <>
      <span className="flex items-center gap-1.5">
        <Grid2X2 className="size-3" />
        网格 {model.gridSize} px
      </span>
      <span className="flex items-center gap-1.5">
        <Link2 className="size-3" />
        自动吸附：{model.snapEnabled ? '开' : '关'}
      </span>
      <span>{model.zoomPercentage}%</span>
    </>
  )
}
