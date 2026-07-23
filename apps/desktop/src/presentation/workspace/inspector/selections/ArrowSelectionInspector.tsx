import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
} from 'tldraw'
import {
  ShapeInspectorArrowheadSelect,
  ShapeInspectorSection,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export function ArrowSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonStart = getCommonStringProp(
    shapes,
    'arrowheadStart',
  )

  const commonEnd = getCommonStringProp(
    shapes,
    'arrowheadEnd',
  )

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      description="编辑连接线、端点和描边。"
      title="连接"
    >
      <SelectionColorSection {...sharedProps} />
      <SelectionStrokeSections {...sharedProps} />

      <ShapeInspectorSection title="起点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              ArrowShapeArrowheadStartStyle,
              value as never,
            )
          }
          value={commonStart}
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="终点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              ArrowShapeArrowheadEndStyle,
              value as never,
            )
          }
          value={commonEnd}
        />
      </ShapeInspectorSection>

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
