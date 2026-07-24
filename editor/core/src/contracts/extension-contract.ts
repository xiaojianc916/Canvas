import type { ComponentType } from 'react'
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export const HYBRID_CANVAS_EXTENSION_API_VERSION = '2'

/**
 * 创作预设扩展。
 *
 * 这里只允许提供“下一对象”的额外创作参数。
 * 它不是通用 Tool Inspector，也不能为 select、hand、
 * eraser、laser 等被动或瞬时工具创建说明页面。
 */
export interface HybridCanvasCreationInspectorProps {
  readonly editor: Editor
}

export interface HybridCanvasCreationInspectorContribution {
  /**
   * 精确的 tldraw StateNode tool id。
   */
  readonly toolId: string

  /**
   * 稳定的 Feature owner id。
   */
  readonly owner: string

  /**
   * 高优先级覆盖低优先级。
   */
  readonly priority?: number

  readonly component: ComponentType<HybridCanvasCreationInspectorProps>
}

export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>

  /**
   * 仅用于真正会创建持久 Shape 的工具。
   *
   * selection-specific Inspector 将在确认具体属性内容后
   * 使用独立契约设计，不能复用这个入口。
   */
  readonly creationInspectors?: readonly HybridCanvasCreationInspectorContribution[]
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
  readonly creationInspectors: readonly HybridCanvasCreationInspectorContribution[]
}

export function buildExtensionRegistration(
  input: readonly HybridCanvasExtension[] = [],
): ExtensionRegistration {
  const ids = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}
  const creationInspectors: HybridCanvasCreationInspectorContribution[] = []

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

    for (const contribution of extension.creationInspectors ?? []) {
      validateCreationInspectorContribution(
        extension.id,
        contribution,
      )

      creationInspectors.push(contribution)
    }
  }

  return Object.freeze({
    extensions: Object.freeze([...input]),
    shapeUtils: Object.freeze(shapeUtils),
    bindingUtils: Object.freeze(bindingUtils),
    tools: Object.freeze(tools),
    shapeLabels: Object.freeze(shapeLabels),
    creationInspectors: Object.freeze(creationInspectors),
  })
}

function validateCreationInspectorContribution(
  extensionId: string,
  contribution: HybridCanvasCreationInspectorContribution,
): void {
  if (!contribution.toolId.trim()) {
    throw new Error(
      'EXTENSION_CREATION_INSPECTOR_TOOL_ID_REQUIRED:' +
        extensionId,
    )
  }

  if (!contribution.owner.trim()) {
    throw new Error(
      'EXTENSION_CREATION_INSPECTOR_OWNER_REQUIRED:' +
        extensionId,
    )
  }

  if (typeof contribution.component !== 'function') {
    throw new Error(
      'EXTENSION_CREATION_INSPECTOR_COMPONENT_REQUIRED:' +
        extensionId,
    )
  }

  if (
    contribution.priority !== undefined &&
    !Number.isFinite(contribution.priority)
  ) {
    throw new Error(
      'EXTENSION_CREATION_INSPECTOR_PRIORITY_INVALID:' +
        extensionId,
    )
  }
}
