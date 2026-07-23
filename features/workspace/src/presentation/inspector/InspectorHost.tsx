import { ScrollArea } from '@hybrid-canvas/design-system'
import type { ReactNode } from 'react'

export interface InspectorHostProps {
  readonly title?: string
  readonly children: ReactNode
}

/**
 * Right-side contextual inspector host.
 *
 * The host owns only layout and scrolling. It must not own editor selection,
 * active tool state, shape-specific rules, data configuration, or interaction
 * configuration.
 *
 * The rendered content is supplied by the active tool or selected object.
 */
export function InspectorHost({ children }: InspectorHostProps) {
  return (
    <aside
      aria-label="工具选项与对象属性"
      className="flex h-full min-h-0 min-w-0 flex-col border-l border-divider bg-sidebar"
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-0 p-3">{children}</div>
      </ScrollArea>
    </aside>
  )
}
