import type { Editor } from 'tldraw'

export interface ToolInspectorProps {
  readonly editor: Editor
}

export interface ToolInspectorRouterProps extends ToolInspectorProps {
  readonly toolId: string
}
