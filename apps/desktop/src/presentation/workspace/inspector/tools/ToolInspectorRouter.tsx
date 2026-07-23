import { defaultToolInspectorRegistry, type ToolInspectorRegistry } from './ToolInspectorRegistry'
import type { ToolInspectorRouterProps } from './types'
import { UnknownToolInspector } from './UnknownToolInspector'

export interface RegisteredToolInspectorRouterProps extends ToolInspectorRouterProps {
  readonly registry?: ToolInspectorRegistry
}

export function ToolInspectorRouter({
  editor,
  toolId,
  registry = defaultToolInspectorRegistry,
}: RegisteredToolInspectorRouterProps) {
  const resolution = registry.resolve(toolId)

  if (!resolution) {
    return <UnknownToolInspector editor={editor} toolId={toolId} />
  }

  const Inspector = resolution.component

  return <Inspector editor={editor} />
}
