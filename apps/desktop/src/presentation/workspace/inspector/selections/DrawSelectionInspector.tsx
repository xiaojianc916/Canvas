import type { SelectionInspectorProps } from './SelectionInspectorShared'
import { StandardSelectionInspector } from './StandardSelectionInspector'

export function DrawSelectionInspector(
  props: SelectionInspectorProps,
) {
  return (
    <StandardSelectionInspector
      {...props}
      description="编辑自由笔触的颜色、线型和粗细。"
      showColor={true}
      showFill={false}
      showStroke={true}
      title="自由绘制"
    />
  )
}
