import {
  SelectionArrangementSection,
  SelectionColorSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export function MultiSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const firstType = shapes[0]?.type
  const sameType = shapes.every(
    (shape) => shape.type === firstType,
  )

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      count={shapes.length}
      description={
        sameType
          ? '多个相同类型的对象；混合属性不会显示为已选中。'
          : '多个不同类型的对象；仅显示可批量应用的公共属性。'
      }
      title={String(shapes.length) + ' 个对象'}
    >
      <SelectionColorSection {...sharedProps} />
      <SelectionStrokeSections {...sharedProps} />
      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
