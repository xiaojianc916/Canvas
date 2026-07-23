import type {
  HybridCanvasToolInspectorContribution,
  HybridCanvasToolInspectorProps,
} from '@hybrid-canvas/canvas/extensions'
import type { ComponentType } from 'react'
import { EraserToolInspector } from './EraserToolInspector'
import { FrameToolInspector } from './FrameToolInspector'
import { HandToolInspector } from './HandToolInspector'
import { LineToolInspector } from './LineToolInspector'
import { NoteToolInspector } from './NoteToolInspector'
import { SelectToolInspector } from './SelectToolInspector'
import { ShapeToolInspector } from './ShapeToolInspector'
import { TextToolInspector } from './TextToolInspector'

export type ToolInspectorContribution = HybridCanvasToolInspectorContribution

export interface ToolInspectorResolution {
  readonly toolId: string
  readonly owner: string
  readonly priority: number
  readonly component: ComponentType<HybridCanvasToolInspectorProps>
}

/**
 * App-owned inspectors for generic tldraw tools only.
 *
 * Feature-owned tools are intentionally absent:
 *
 * - draw/highlight are owned by @hybrid-canvas/freehand
 * - arrow is owned by @hybrid-canvas/flowchart
 * - scientific-chart is owned by @hybrid-canvas/scientific-plot
 *
 * Missing Feature contributions must resolve to UnknownToolInspector.
 * Do not add duplicate App fallbacks.
 */
export const CORE_TOOL_INSPECTOR_CONTRIBUTIONS: readonly ToolInspectorContribution[] = [
  {
    toolId: 'select',
    owner: 'core',
    component: SelectToolInspector,
  },
  {
    toolId: 'hand',
    owner: 'core',
    component: HandToolInspector,
  },
  {
    toolId: 'geo',
    owner: 'core',
    component: ShapeToolInspector,
  },
  {
    toolId: 'line',
    owner: 'core',
    component: LineToolInspector,
  },

  {
    toolId: 'eraser',
    owner: 'core',
    component: EraserToolInspector,
  },
  {
    toolId: 'text',
    owner: 'core',
    component: TextToolInspector,
  },
  {
    toolId: 'note',
    owner: 'core',
    component: NoteToolInspector,
  },
  {
    toolId: 'frame',
    owner: 'core',
    component: FrameToolInspector,
  },
]

export class ToolInspectorRegistry {
  readonly #resolutions: ReadonlyMap<string, ToolInspectorResolution>

  constructor(contributions: readonly ToolInspectorContribution[]) {
    this.#resolutions = buildResolutionMap(contributions)
  }

  resolve(toolId: string): ToolInspectorResolution | null {
    return this.#resolutions.get(toolId) ?? null
  }

  has(toolId: string): boolean {
    return this.#resolutions.has(toolId)
  }

  list(): readonly ToolInspectorResolution[] {
    return Array.from(this.#resolutions.values()).sort((left, right) =>
      left.toolId.localeCompare(right.toolId),
    )
  }
}

export function createToolInspectorRegistry(
  contributions: readonly ToolInspectorContribution[] = [],
): ToolInspectorRegistry {
  return new ToolInspectorRegistry([...CORE_TOOL_INSPECTOR_CONTRIBUTIONS, ...contributions])
}

export const defaultToolInspectorRegistry = createToolInspectorRegistry()

function buildResolutionMap(
  contributions: readonly ToolInspectorContribution[],
): ReadonlyMap<string, ToolInspectorResolution> {
  const resolutions = new Map<string, ToolInspectorResolution>()

  for (const contribution of contributions) {
    validateContribution(contribution)

    const priority = contribution.priority ?? 0

    const existing = resolutions.get(contribution.toolId)

    if (existing && existing.priority === priority) {
      throw new Error(
        'Conflicting tool inspector contributions for "' +
          contribution.toolId +
          '" at priority ' +
          String(priority) +
          ': "' +
          existing.owner +
          '" and "' +
          contribution.owner +
          '".',
      )
    }

    if (!existing || priority > existing.priority) {
      resolutions.set(contribution.toolId, {
        toolId: contribution.toolId,
        owner: contribution.owner,
        priority,
        component: contribution.component,
      })
    }
  }

  return resolutions
}

function validateContribution(contribution: ToolInspectorContribution): void {
  if (!contribution.toolId.trim()) {
    throw new Error('Tool inspector contribution requires a toolId.')
  }

  if (!contribution.owner.trim()) {
    throw new Error('Tool inspector contribution "' + contribution.toolId + '" requires an owner.')
  }

  if (typeof contribution.component !== 'function') {
    throw new Error(
      'Tool inspector contribution "' + contribution.toolId + '" requires a React component.',
    )
  }

  if (contribution.priority !== undefined && !Number.isFinite(contribution.priority)) {
    throw new Error(
      'Tool inspector contribution "' + contribution.toolId + '" has an invalid priority.',
    )
  }
}
