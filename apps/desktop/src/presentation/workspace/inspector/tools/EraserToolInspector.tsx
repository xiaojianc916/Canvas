import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolPanelHeader,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function EraserToolInspector({ editor: _editor }: ToolInspectorProps) {
  return (
    <ToolPanelHeader description="拖过对象或笔触进行擦除。" title="橡皮擦">
      <ShapeInspectorSection title="擦除方式">
        <ShapeInspectorSegmentedControl
          ariaLabel="擦除方式"
          onChange={() => {
            // 后续接入 EraserTool 状态。
          }}
          options={[
            { value: 'object', label: '对象' },
            { value: 'stroke', label: '笔画' },
            { value: 'partial', label: '局部' },
          ]}
          value="object"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="擦除过滤">
        <ShapeInspectorSegmentedControl
          ariaLabel="擦除对象过滤"
          onChange={() => {
            // 后续接入擦除过滤规则。
          }}
          options={[
            { value: 'all', label: '全部' },
            { value: 'draw', label: '笔触' },
            { value: 'highlight', label: '高亮' },
          ]}
          value="all"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        当前实现使用对象擦除。笔画擦除和局部路径切割需要独立工具状态与几何实现。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
