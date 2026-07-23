import {
  DefaultFontStyle,
  DefaultTextAlignStyle,
} from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function TextToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="单击创建自动宽度文本，拖动创建固定宽度文本框。"
      title="文本"
    >
      <ToolColorSection editor={editor} />

      <ShapeInspectorSection title="字体分类">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认字体分类"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              DefaultFontStyle,
              value as never,
            )
          }
          options={[
            { value: 'draw', label: '手写' },
            { value: 'sans', label: '无衬线' },
            { value: 'serif', label: '衬线' },
            { value: 'mono', label: '等宽' },
          ]}
          value={null}
        />
      </ShapeInspectorSection>

      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="水平对齐">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认文本对齐"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              DefaultTextAlignStyle,
              value as never,
            )
          }
          options={[
            { value: 'start', label: '左' },
            { value: 'middle', label: '中' },
            { value: 'end', label: '右' },
          ]}
          value={null}
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="文本框">
        <ShapeInspectorSegmentedControl
          ariaLabel="文本框调整方式"
          onChange={() => {
            // 后续接入文本框 sizing mode。
          }}
          options={[
            { value: 'auto-width', label: '自动宽度' },
            { value: 'auto-height', label: '自动高度' },
            { value: 'fixed', label: '固定尺寸' },
          ]}
          value="auto-width"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        下一阶段增加真实字体、字重、精确字号、行高、字距和文本框溢出设置。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
