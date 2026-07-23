import {
  SelectionArrangementSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
} from './SelectionInspectorShared'

export function GenericSelectionInspector({ editor, shapes }: SelectionInspectorProps) {
  const firstShape = shapes[0]
  const type = firstShape?.type ?? 'unknown'
  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout count={shapes.length} description={'对象类型：' + type} title="对象">
      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
