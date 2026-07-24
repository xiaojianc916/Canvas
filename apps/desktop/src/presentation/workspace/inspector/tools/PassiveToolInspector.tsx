import { ToolPanelHeader } from '../common/InspectorPrimitives'

/**
 * asset 和 laser 都是 tldraw 官方工具，但没有可持久编辑的
 * stroke/fill/font 参数，因此不应生搬其他工具的 Inspector。
 */

export function AssetToolInspector() {
  return (
    <ToolPanelHeader
      description="从本地选择图片、视频或其他媒体并插入当前画布。"
      title="媒体"
    >
      <div className="rounded-lg border border-dashed border-divider px-3 py-4 text-[11px] leading-5 text-muted-foreground">
        选择工具栏中的媒体按钮后，使用系统资源选择器添加内容。
      </div>
    </ToolPanelHeader>
  )
}

export function LaserToolInspector() {
  return (
    <ToolPanelHeader
      description="用于演示和临时指示，不会在文档中创建持久图形。"
      title="激光笔"
    >
      <div className="rounded-lg border border-dashed border-divider px-3 py-4 text-[11px] leading-5 text-muted-foreground">
        激光轨迹会自动消失，因此没有对象样式或持久化参数。
      </div>
    </ToolPanelHeader>
  )
}
