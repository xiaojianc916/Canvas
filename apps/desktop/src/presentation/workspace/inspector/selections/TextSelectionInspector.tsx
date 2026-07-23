import {
  DefaultFontStyle,
  DefaultTextAlignStyle,
} from 'tldraw'
import {
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
} from './SelectionInspectorShared'

export function TextSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonFont = getCommonStringProp(
    shapes,
    'font',
  )

  const commonAlign = getCommonStringProp(
    shapes,
    'textAlign',
  )

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      description="编辑文本颜色、字体和对齐。"
      title="文本"
    >
      <SelectionColorSection {...sharedProps} />

      <ShapeInspectorSection title="字体">
        <ShapeInspectorSegmentedControl
          ariaLabel="文本字体"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
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
          value={commonFont}
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="对齐">
        <ShapeInspectorSegmentedControl
          ariaLabel="文本对齐"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              DefaultTextAlignStyle,
              value as never,
            )
          }
          options={[
            { value: 'start', label: '左' },
            { value: 'middle', label: '中' },
            { value: 'end', label: '右' },
          ]}
          value={commonAlign}
        />
      </ShapeInspectorSection>

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
