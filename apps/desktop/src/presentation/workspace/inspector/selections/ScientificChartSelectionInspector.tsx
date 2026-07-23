import { type ScientificChartType, ScientificChartTypeStyle } from '@hybrid-canvas/scientific-plot'
import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export function ScientificChartSelectionInspector({ editor, shapes }: SelectionInspectorProps) {
  const chartType = getCommonStringProp(shapes, 'chartType')

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout description="编辑图表类型和展示样式。" title="科学图表">
      <ShapeInspectorSection title="图表类型">
        <ShapeInspectorSegmentedControl
          ariaLabel="图表类型"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(ScientificChartTypeStyle, value as ScientificChartType)
          }
          options={[
            { value: 'line', label: '折线' },
            { value: 'bar', label: '柱状' },
            { value: 'area', label: '面积' },
            { value: 'scatter', label: '散点' },
          ]}
          value={chartType}
        />
      </ShapeInspectorSection>

      <SelectionColorSection {...sharedProps} />
      <SelectionStrokeSections {...sharedProps} />

      <InspectorHint>
        数据、系列、坐标轴、图例和注释将在科学图表 Feature 的专属检查器中继续实现。
      </InspectorHint>

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
