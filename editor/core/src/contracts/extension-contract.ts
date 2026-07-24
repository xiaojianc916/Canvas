import type {
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export const HYBRID_CANVAS_EXTENSION_API_VERSION = '2'

/**
 * Canvas Feature 的公开扩展契约。
 *
 * Editor 的 Shape、Binding 和 Tool 仍由各 Feature 注册，
 * 但右侧属性侧边栏内容不再使用整页 Component 注入。
 *
 * 后续属性内容将使用独立的 Section contribution 契约，
 * 避免 Feature 覆盖整个右侧栏或重复实现官方公共属性。
 */
export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
}

export function buildExtensionRegistration(
  input: readonly HybridCanvasExtension[] = [],
): ExtensionRegistration {
  const ids = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}

  for (const extension of input) {
    if (
      !extension.id ||
      ids.has(extension.id)
    ) {
      throw new Error(
        'EXTENSION_DUPLICATE_ID',
      )
    }

    if (
      extension.apiVersion !==
      HYBRID_CANVAS_EXTENSION_API_VERSION
    ) {
      throw new Error(
        'EXTENSION_API_VERSION_MISMATCH',
      )
    }

    ids.add(extension.id)

    shapeUtils.push(
      ...(extension.shapeUtils ?? []),
    )

    bindingUtils.push(
      ...(extension.bindingUtils ?? []),
    )

    tools.push(
      ...(extension.tools ?? []),
    )

    Object.assign(
      shapeLabels,
      extension.shapeLabels,
    )
  }

  return Object.freeze({
    extensions:
      Object.freeze([
        ...input,
      ]),

    shapeUtils:
      Object.freeze(
        shapeUtils,
      ),

    bindingUtils:
      Object.freeze(
        bindingUtils,
      ),

    tools:
      Object.freeze(
        tools,
      ),

    shapeLabels:
      Object.freeze(
        shapeLabels,
      ),
  })
}
