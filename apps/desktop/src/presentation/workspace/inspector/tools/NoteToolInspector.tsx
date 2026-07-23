import { DefaultFontStyle, useValue } from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolFillSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function NoteToolInspector({ editor }: ToolInspectorProps) {
  const currentFont = useValue(
    'inspector next note font',
    () => editor.getStyleForNextShape(DefaultFontStyle),
    [editor],
  )

  return (
    <ToolPanelHeader description="在画布中创建便签并立即输入内容。" title="便签">
      <ToolColorSection editor={editor} />
      <ToolFillSection editor={editor} includeNone={false} />

      <ShapeInspectorSection title="字体">
        <ShapeInspectorSegmentedControl
          ariaLabel="便签字体"
          onChange={(value) => editor.setStyleForNextShapes(DefaultFontStyle, value as never)}
          options={[
            { value: 'draw', label: '手写' },
            { value: 'sans', label: '无衬线' },
            { value: 'serif', label: '衬线' },
            { value: 'mono', label: '等宽' },
          ]}
          value={currentFont}
        />
      </ShapeInspectorSection>

      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="尺寸">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认便签尺寸"
          onChange={() => {
            // 后续接入便签尺寸和自动适应内容。
          }}
          options={[
            { value: 'small', label: '小' },
            { value: 'medium', label: '中' },
            { value: 'large', label: '大' },
            { value: 'auto', label: '自适应' },
          ]}
          value="medium"
        />
      </ShapeInspectorSection>

      <InspectorHint>便签创建后应立即进入文本编辑，并支持连接线绑定。</InspectorHint>
    </ToolPanelHeader>
  )
}
