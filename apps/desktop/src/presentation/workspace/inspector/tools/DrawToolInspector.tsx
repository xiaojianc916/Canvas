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

export interface DrawToolInspectorProps extends ToolInspectorProps {
  readonly variant: 'draw' | 'highlight'
}

export function DrawToolInspector({
  editor,
  variant,
}: DrawToolInspectorProps) {
  const isHighlight = variant === 'highlight'

  return (
    <ToolPanelHeader
      description={
        isHighlight
          ? '连续绘制高亮标记；以下参数用于下一条高亮笔触。'
          : '连续自由绘制；以下参数用于下一条笔触。'
      }
      title={isHighlight ? '高亮' : '自由绘制'}
    >
      <ToolColorSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      {isHighlight ? (
        <ShapeInspectorSection title="高亮外观">
          <ShapeInspectorSegmentedControl
            ariaLabel="高亮透明度"
            onChange={() => {
              // 高亮透明度需要独立 StyleProp，后续由 freehand feature 提供。
            }}
            options={[
              { value: 'light', label: '浅' },
              { value: 'medium', label: '中' },
              { value: 'strong', label: '深' },
            ]}
            value="medium"
          />
        </ShapeInspectorSection>
      ) : (
        <ToolDashSection editor={editor} />
      )}

      <ShapeInspectorSection
        description="当前阶段保留 tldraw 原生绘制行为。"
        title="平滑与稳定"
      >
        <ShapeInspectorSegmentedControl
          ariaLabel="笔触平滑方式"
          onChange={() => {
            // 后续接入 freehand extension 的 smoothing record/style。
          }}
          options={[
            { value: 'none', label: '关闭' },
            { value: 'basic', label: '基础' },
            { value: 'weighted', label: '加权' },
            { value: 'stabilizer', label: '稳定器' },
          ]}
          value="basic"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        下一阶段将接入精确笔刷尺寸、不透明度、流量、压感映射、稳定器和笔刷预设。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
