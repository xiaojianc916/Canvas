import {
  type ScientificChartType,
  ScientificChartTypeStyle,
} from '@hybrid-canvas/scientific-plot'
import { useValue } from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function ScientificChartToolInspector({
  editor,
}: ToolInspectorProps) {
  const currentChartType = useValue(
    'inspector next scientific chart type',
    () =>
      editor.getStyleForNextShape(
        ScientificChartTypeStyle,
      ),
    [editor],
  )

  return (
    <ToolPanelHeader
      description="选择图表类型并拖动创建；创建后可配置数据、系列和坐标轴。"
      title="图表"
    >
      <ShapeInspectorSection title="图表类型">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认图表类型"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              ScientificChartTypeStyle,
              value as ScientificChartType,
            )
          }
          options={[
            { value: 'line', label: '折线' },
            { value: 'bar', label: '柱状' },
            { value: 'area', label: '面积' },
            { value: 'scatter', label: '散点' },
          ]}
          value={currentChartType}
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection
        description="第一阶段使用示例数据；后续接入 CSV、粘贴和工作区数据集。"
        title="数据来源"
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-9 rounded-md border border-divider bg-background px-2 text-[11px] hover:bg-accent"
            type="button"
          >
            示例数据
          </button>

          <button
            className="min-h-9 rounded-md border border-divider bg-background px-2 text-[11px] text-muted-foreground hover:bg-accent"
            disabled
            type="button"
          >
            导入数据
          </button>
        </div>
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <InspectorHint>
        创建图表后，右栏将切换为图表对象属性：数据、系列、X/Y
        轴、图例、标签、注释、主题和导出。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
