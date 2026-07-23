import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolDashSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function LineToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="拖动创建直线或折线；以下参数用于下一条线。"
      title="直线"
    >
      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="角度约束">
        <ShapeInspectorSegmentedControl
          ariaLabel="直线角度吸附"
          onChange={() => {
            // 后续接入 LineTool 的角度约束偏好。
          }}
          options={[
            { value: 'free', label: '自由' },
            { value: '15', label: '15°' },
            { value: '45', label: '45°' },
            { value: '90', label: '90°' },
          ]}
          value="free"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="创建行为">
        <ShapeInspectorSegmentedControl
          ariaLabel="直线创建方式"
          onChange={() => {
            // 后续接入 LineTool 的创建行为。
          }}
          options={[
            { value: 'single', label: '单线' },
            { value: 'polyline', label: '连续折线' },
          ]}
          value="single"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        直线工具只负责几何线段。需要绑定对象、自动重路由或箭头端点时，应使用连接工具。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
