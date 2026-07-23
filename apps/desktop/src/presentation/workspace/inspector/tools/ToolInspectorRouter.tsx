import { DrawToolInspector } from './DrawToolInspector'
import {
  ArrowToolInspector,
  EraserToolInspector,
  FrameToolInspector,
  HandToolInspector,
  NoteToolInspector,
  SelectToolInspector,
  TextToolInspector,
} from './BasicToolInspectors'
import { ScientificChartToolInspector } from './ScientificChartToolInspector'
import { ShapeToolInspector } from './ShapeToolInspector'
import type { ToolInspectorRouterProps } from './types'

export function ToolInspectorRouter({
  editor,
  toolId,
}: ToolInspectorRouterProps) {
  switch (toolId) {
    case 'geo':
      return <ShapeToolInspector editor={editor} />

    case 'draw':
      return (
        <DrawToolInspector
          editor={editor}
          variant="draw"
        />
      )

    case 'highlight':
      return (
        <DrawToolInspector
          editor={editor}
          variant="highlight"
        />
      )

    case 'scientific-chart':
      return <ScientificChartToolInspector editor={editor} />

    case 'arrow':
      return <ArrowToolInspector editor={editor} />

    case 'text':
      return <TextToolInspector editor={editor} />

    case 'note':
      return <NoteToolInspector editor={editor} />

    case 'frame':
      return <FrameToolInspector editor={editor} />

    case 'eraser':
      return <EraserToolInspector />

    case 'hand':
      return <HandToolInspector />

    case 'select':
    default:
      return <SelectToolInspector />
  }
}
