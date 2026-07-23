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

export function FrameToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="拖动创建用于组织内容和导出的画框。"
      title="画框"
    >
      <ShapeInspectorSection title="尺寸预设">
        <ShapeInspectorSegmentedControl
          ariaLabel="画框尺寸预设"
          onChange={() => {
            // 后续接入画框尺寸预设。
          }}
          options={[
            { value: 'custom', label: '自定义' },
            { value: 'screen', label: '屏幕' },
            { value: 'paper', label: '纸张' },
            { value: 'slide', label: '演示' },
          ]}
          value="custom"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="容器行为">
        <ShapeInspectorSegmentedControl
          ariaLabel="画框内容行为"
          onChange={() => {
            // 后续接入 frame clipping 和内容布局。
          }}
          options={[
            { value: 'free', label: '自由' },
            { value: 'clip', label: '裁剪' },
            { value: 'fit', label: '适应内容' },
          ]}
          value="free"
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <InspectorHint>
        下一阶段增加精确尺寸、内边距、布局网格、内容裁剪和导出区域。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
