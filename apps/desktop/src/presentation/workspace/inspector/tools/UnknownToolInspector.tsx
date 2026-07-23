import { InspectorHint, ToolPanelHeader } from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export interface UnknownToolInspectorProps extends ToolInspectorProps {
  readonly toolId: string
}

export function UnknownToolInspector({ toolId }: UnknownToolInspectorProps) {
  return (
    <ToolPanelHeader description="该工具尚未提供专用右侧栏。" title="工具选项">
      <InspectorHint>
        当前工具 ID：{toolId}。应由该工具所属 Feature 注册专用检查器，而不是降级显示选择工具设置。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
