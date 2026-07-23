import {
  InspectorHint,
  ShapeInspectorSection,
  ToolPanelHeader,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function HandToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="拖动画布进行平移，滚轮或触控板用于缩放。"
      title="移动画布"
    >
      <ShapeInspectorSection title="快速视图">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-9 rounded-md border border-divider bg-background px-2 text-[11px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => editor.zoomToFit()}
            type="button"
          >
            适合内容
          </button>

          <button
            className="min-h-9 rounded-md border border-divider bg-background px-2 text-[11px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => editor.resetZoom()}
            type="button"
          >
            100%
          </button>
        </div>
      </ShapeInspectorSection>

      <ShapeInspectorSection title="导航快捷键">
        <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
          <p>按住空格可临时使用移动画布工具。</p>
          <p>使用滚轮或触控板缩放和平移画布。</p>
          <p>选择对象后可使用“适合选择”定位内容。</p>
        </div>
      </ShapeInspectorSection>

      <InspectorHint>
        导航设置属于本地界面状态，不应写入 TLStore 或文档历史。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
