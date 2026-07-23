import { ArrowToolInspector } from './ArrowToolInspector'
import { DrawToolInspector } from './DrawToolInspector'
import { EraserToolInspector } from './EraserToolInspector'
import { FrameToolInspector } from './FrameToolInspector'
import { HandToolInspector } from './HandToolInspector'
import { LineToolInspector } from './LineToolInspector'
import { NoteToolInspector } from './NoteToolInspector'
import { ScientificChartToolInspector } from './ScientificChartToolInspector'
import { SelectToolInspector } from './SelectToolInspector'
import { ShapeToolInspector } from './ShapeToolInspector'
import { TextToolInspector } from './TextToolInspector'
import type { ToolInspectorRouterProps } from './types'
import { UnknownToolInspector } from './UnknownToolInspector'

export function ToolInspectorRouter({
  editor,
  toolId,
}: ToolInspectorRouterProps) {
  switch (toolId) {
    case 'select':
      return <SelectToolInspector editor={editor} />

    case 'hand':
      return <HandToolInspector editor={editor} />

    case 'geo':
      return <ShapeToolInspector editor={editor} />

    case 'line':
      return <LineToolInspector editor={editor} />

    case 'arrow':
      return <ArrowToolInspector editor={editor} />

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

    case 'eraser':
      return <EraserToolInspector editor={editor} />

    case 'text':
      return <TextToolInspector editor={editor} />

    case 'note':
      return <NoteToolInspector editor={editor} />

    case 'frame':
      return <FrameToolInspector editor={editor} />

    case 'scientific-chart':
      return <ScientificChartToolInspector editor={editor} />

    default:
      return (
        <UnknownToolInspector
          editor={editor}
          toolId={toolId}
        />
      )
  }
}
