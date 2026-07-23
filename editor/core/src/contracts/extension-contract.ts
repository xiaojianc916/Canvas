import type { ComponentType } from 'react'
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export const HYBRID_CANVAS_EXTENSION_API_VERSION = '1'

export interface HybridCanvasToolInspectorProps {
  readonly editor: Editor
}

export interface HybridCanvasToolInspectorContribution {
  /**
   * Exact tldraw StateNode tool id.
   */
  readonly toolId: string

  /**
   * Stable Feature owner id used for diagnostics.
   */
  readonly owner: string

  /**
   * Higher priorities override lower priorities.
   *
   * Core fallback inspectors use 0. Feature-owned inspectors
   * should normally use 100.
   */
  readonly priority?: number

  readonly component: ComponentType<HybridCanvasToolInspectorProps>
}

export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>
  readonly toolInspectors?: readonly HybridCanvasToolInspectorContribution[]
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
  readonly toolInspectors: readonly HybridCanvasToolInspectorContribution[]
}

export function buildExtensionRegistration(
  input: readonly HybridCanvasExtension[] = [],
): ExtensionRegistration {
  const ids = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}
  const toolInspectors: HybridCanvasToolInspectorContribution[] = []

  for (const extension of input) {
    if (!extension.id || ids.has(extension.id)) {
      throw new Error('EXTENSION_DUPLICATE_ID')
    }

    if (extension.apiVersion !== HYBRID_CANVAS_EXTENSION_API_VERSION) {
      throw new Error('EXTENSION_API_VERSION_MISMATCH')
    }

    ids.add(extension.id)
    shapeUtils.push(...(extension.shapeUtils ?? []))
    bindingUtils.push(...(extension.bindingUtils ?? []))
    tools.push(...(extension.tools ?? []))
    Object.assign(shapeLabels, extension.shapeLabels)

    for (const contribution of extension.toolInspectors ?? []) {
      validateToolInspectorContribution(
        extension.id,
        contribution,
      )

      toolInspectors.push(contribution)
    }
  }

  return Object.freeze({
    extensions: Object.freeze([...input]),
    shapeUtils: Object.freeze(shapeUtils),
    bindingUtils: Object.freeze(bindingUtils),
    tools: Object.freeze(tools),
    shapeLabels: Object.freeze(shapeLabels),
    toolInspectors: Object.freeze(toolInspectors),
  })
}

function validateToolInspectorContribution(
  extensionId: string,
  contribution: HybridCanvasToolInspectorContribution,
): void {
  if (!contribution.toolId.trim()) {
    throw new Error(
      'EXTENSION_TOOL_INSPECTOR_TOOL_ID_REQUIRED:' +
        extensionId,
    )
  }

  if (!contribution.owner.trim()) {
    throw new Error(
      'EXTENSION_TOOL_INSPECTOR_OWNER_REQUIRED:' +
        extensionId,
    )
  }

  if (
    typeof contribution.component !== 'function'
  ) {
    throw new Error(
      'EXTENSION_TOOL_INSPECTOR_COMPONENT_REQUIRED:' +
        extensionId,
    )
  }

  if (
    contribution.priority !== undefined &&
    !Number.isFinite(contribution.priority)
  ) {
    throw new Error(
      'EXTENSION_TOOL_INSPECTOR_PRIORITY_INVALID:' +
        extensionId,
    )
  }
}
