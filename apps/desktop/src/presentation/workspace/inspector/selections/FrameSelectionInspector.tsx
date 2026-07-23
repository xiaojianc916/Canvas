import type { SelectionInspectorProps } from './SelectionInspectorShared'
import { StandardSelectionInspector } from './StandardSelectionInspector'

export function FrameSelectionInspector(props: SelectionInspectorProps) {
  return (
    <StandardSelectionInspector
      {...props}
      description="编辑画框填充、边框和层级。"
      showColor={true}
      showFill={true}
      showStroke={true}
      title="画框"
    />
  )
}
