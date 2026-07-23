import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolPanelHeader,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function SelectToolInspector({ editor: _editor }: ToolInspectorProps) {
  return (
    <ToolPanelHeader description="选择画布中的对象以编辑属性。" title="选择">
      <ShapeInspectorSection description="控制拖动选择框与对象相交时的选择方式。" title="框选">
        <ShapeInspectorSegmentedControl
          ariaLabel="框选方式"
          onChange={() => {
            // 后续接入 SelectionTool 的用户偏好。
          }}
          options={[
            { value: 'contain', label: '完全包含' },
            { value: 'intersect', label: '相交即选' },
          ]}
          value="intersect"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="选择辅助">
        <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
          <p>按住 Shift 单击可增加或移除选中对象。</p>
          <p>按住 Alt 拖动对象可创建副本。</p>
          <p>双击文本、容器或路径可进入专用编辑。</p>
        </div>
      </ShapeInspectorSection>

      <InspectorHint>选中一个或多个对象后，右侧栏将切换为对象属性检查器。</InspectorHint>
    </ToolPanelHeader>
  )
}
