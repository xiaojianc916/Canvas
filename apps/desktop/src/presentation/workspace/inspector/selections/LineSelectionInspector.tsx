import type { SelectionInspectorProps } from './SelectionInspectorShared'
import { StandardSelectionInspector } from './StandardSelectionInspector'

export function LineSelectionInspector(
  props: SelectionInspectorProps,
) {
  return (
    <StandardSelectionInspector
      {...props}
      description="编辑直线颜色、线型和粗细。"
      showColor={true}
      showFill={false}
      showStroke={true}
      title="直线"
    />
  )
}
