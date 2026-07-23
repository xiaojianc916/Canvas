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
  SelectionFillSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
} from './SelectionInspectorShared'

export function NoteSelectionInspector({
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
      description="编辑便签背景和文字样式。"
      title="便签"
    >
      <SelectionColorSection {...sharedProps} />
      <SelectionFillSection {...sharedProps} />

      <ShapeInspectorSection title="字体">
        <ShapeInspectorSegmentedControl
          ariaLabel="便签字体"
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
          ariaLabel="便签文字对齐"
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
