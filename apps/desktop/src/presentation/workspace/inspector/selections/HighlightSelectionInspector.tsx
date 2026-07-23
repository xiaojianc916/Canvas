import type { SelectionInspectorProps } from './SelectionInspectorShared'
import { StandardSelectionInspector } from './StandardSelectionInspector'

export function HighlightSelectionInspector(
  props: SelectionInspectorProps,
) {
  return (
    <StandardSelectionInspector
      {...props}
      description="编辑高亮笔触的颜色和粗细。"
      showColor={true}
      showFill={false}
      showStroke={true}
      title="高亮"
    />
  )
}
