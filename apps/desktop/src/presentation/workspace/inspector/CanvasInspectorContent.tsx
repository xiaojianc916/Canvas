import { useEditor } from '@hybrid-canvas/canvas/react'
import { useValue } from 'tldraw'
import { SelectionInspectorRouter } from './selections/SelectionInspectorRouter'
import { ToolInspectorRouter } from './tools/ToolInspectorRouter'
import type { ToolInspectorRegistry } from './tools/ToolInspectorRegistry'

export interface CanvasInspectorContentProps {
  readonly hasActiveCanvas: boolean
  readonly toolInspectorRegistry: ToolInspectorRegistry
}

export function CanvasInspectorContent({
  hasActiveCanvas,
  toolInspectorRegistry,
}: CanvasInspectorContentProps) {
  const editor = useEditor()

  const selectedShapes = useValue(
    'canvas inspector selected shapes',
    () => editor?.getSelectedShapes() ?? [],
    [editor],
  )

  const activeToolId = useValue(
    'canvas inspector active tool',
    () => editor?.getCurrentToolId() ?? 'select',
    [editor],
  )

  if (!hasActiveCanvas || !editor) {
    return (
      <div className="rounded-lg border border-dashed border-divider px-4 py-10 text-center">
        <p className="text-xs font-medium">没有活动画布</p>

        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          激活一个画布后，可以在这里编辑工具和对象属性。
        </p>
      </div>
    )
  }

  if (selectedShapes.length === 0) {
    return (
      <ToolInspectorRouter
        editor={editor}
        registry={toolInspectorRegistry}
        toolId={activeToolId}
      />
    )
  }

  return (
    <SelectionInspectorRouter
      editor={editor}
      shapes={selectedShapes}
    />
  )
}
