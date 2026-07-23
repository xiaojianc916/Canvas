import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
} from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorArrowheadSelect,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolDashSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function ArrowToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="在对象之间创建可绑定的连接线。"
      title="连接"
    >
      <ShapeInspectorSection
        description="控制连接线在起点和终点之间的路径。"
        title="路由"
      >
        <ShapeInspectorSegmentedControl
          ariaLabel="连接线路由"
          onChange={() => {
            // 后续由 flowchart feature 提供路由 StyleProp。
          }}
          options={[
            { value: 'straight', label: '直线' },
            { value: 'curved', label: '曲线' },
            { value: 'orthogonal', label: '正交' },
          ]}
          value="straight"
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="起点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForNextShapes(
              ArrowShapeArrowheadStartStyle,
              value as never,
            )
          }
          value="none"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="终点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForNextShapes(
              ArrowShapeArrowheadEndStyle,
              value as never,
            )
          }
          value="arrow"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="连接行为">
        <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
          <p>连接端点会吸附到支持绑定的对象。</p>
          <p>移动已绑定对象时，连接线会跟随更新。</p>
        </div>
      </ShapeInspectorSection>

      <InspectorHint>
        正交路由、避障、连接标签和自动重路由应由 flowchart feature 提供。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
