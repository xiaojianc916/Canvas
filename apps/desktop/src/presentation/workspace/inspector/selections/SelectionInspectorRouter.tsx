import type { SelectionInspectorProps } from './SelectionInspectorShared'
import { ArrowSelectionInspector } from './ArrowSelectionInspector'
import { DrawSelectionInspector } from './DrawSelectionInspector'
import { FrameSelectionInspector } from './FrameSelectionInspector'
import { GenericSelectionInspector } from './GenericSelectionInspector'
import { GeoSelectionInspector } from './GeoSelectionInspector'
import { HighlightSelectionInspector } from './HighlightSelectionInspector'
import { LineSelectionInspector } from './LineSelectionInspector'
import { MultiSelectionInspector } from './MultiSelectionInspector'
import { NoteSelectionInspector } from './NoteSelectionInspector'
import { ScientificChartSelectionInspector } from './ScientificChartSelectionInspector'
import { TextSelectionInspector } from './TextSelectionInspector'

export function SelectionInspectorRouter({
  editor,
  shapes,
}: SelectionInspectorProps) {
  if (shapes.length > 1) {
    return (
      <MultiSelectionInspector
        editor={editor}
        shapes={shapes}
      />
    )
  }

  const shape = shapes[0]

  if (!shape) {
    return null
  }

  const props = { editor, shapes }

  switch (shape.type) {
    case 'geo':
      return <GeoSelectionInspector {...props} />

    case 'text':
      return <TextSelectionInspector {...props} />

    case 'note':
      return <NoteSelectionInspector {...props} />

    case 'arrow':
      return <ArrowSelectionInspector {...props} />

    case 'line':
      return <LineSelectionInspector {...props} />

    case 'draw':
      return <DrawSelectionInspector {...props} />

    case 'highlight':
      return <HighlightSelectionInspector {...props} />

    case 'frame':
      return <FrameSelectionInspector {...props} />

    case 'scientific-chart':
      return (
        <ScientificChartSelectionInspector {...props} />
      )

    default:
      return <GenericSelectionInspector {...props} />
  }
}
