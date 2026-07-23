import {
  SelectionArrangementSection,
  SelectionColorSection,
  SelectionFillSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export interface StandardSelectionInspectorProps extends SelectionInspectorProps {
  readonly title: string
  readonly description: string
  readonly showColor?: boolean
  readonly showFill?: boolean
  readonly showStroke?: boolean
}

export function StandardSelectionInspector({
  editor,
  shapes,
  title,
  description,
  showColor = true,
  showFill = false,
  showStroke = true,
}: StandardSelectionInspectorProps) {
  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout count={shapes.length} description={description} title={title}>
      {showColor ? <SelectionColorSection {...sharedProps} /> : null}

      {showFill ? <SelectionFillSection {...sharedProps} /> : null}

      {showStroke ? <SelectionStrokeSections {...sharedProps} /> : null}

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
