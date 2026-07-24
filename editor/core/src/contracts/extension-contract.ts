import type { ComponentType } from 'react'
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export const HYBRID_CANVAS_EXTENSION_API_VERSION = '3'

export type HybridCanvasInspectorSectionMode =
  | 'creation'
  | 'selection'

export interface HybridCanvasInspectorSectionProps {
  readonly editor: Editor
  readonly mode: HybridCanvasInspectorSectionMode
}

export interface HybridCanvasInspectorSectionContribution {
  readonly id: string
  readonly owner: string
  readonly priority?: number

  /**
   * 在没有选中对象，且当前工具匹配时显示。
   */
  readonly toolIds?: readonly string[]

  /**
   * 在选中对象全部属于这些类型时显示。
   */
  readonly shapeTypes?: readonly string[]

  /**
   * Component 只能贡献一个或多个属性 Section，
   * 不能覆盖整个右侧属性侧边栏。
   */
  readonly component:
    ComponentType<HybridCanvasInspectorSectionProps>
}

export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>
  readonly inspectorSections?:
    readonly HybridCanvasInspectorSectionContribution[]
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
  readonly inspectorSections:
    readonly HybridCanvasInspectorSectionContribution[]
}

export function buildExtensionRegistration(
  input: readonly HybridCanvasExtension[] = [],
): ExtensionRegistration {
  const ids = new Set<string>()
  const sectionIds = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}
  const inspectorSections:
    HybridCanvasInspectorSectionContribution[] = []

  for (const extension of input) {
    if (
      !extension.id ||
      ids.has(extension.id)
    ) {
      throw new Error('EXTENSION_DUPLICATE_ID')
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

    for (
      const section of
      extension.inspectorSections ?? []
    ) {
      validateInspectorSection(
        extension.id,
        section,
        sectionIds,
      )

      inspectorSections.push(section)
    }
  }

  inspectorSections.sort(
    (left, right) =>
      (right.priority ?? 0) -
        (left.priority ?? 0) ||
      left.id.localeCompare(right.id),
  )

  return Object.freeze({
    extensions:
      Object.freeze([...input]),

    shapeUtils:
      Object.freeze(shapeUtils),

    bindingUtils:
      Object.freeze(bindingUtils),

    tools:
      Object.freeze(tools),

    shapeLabels:
      Object.freeze(shapeLabels),

    inspectorSections:
      Object.freeze(inspectorSections),
  })
}

function validateInspectorSection(
  extensionId: string,
  section: HybridCanvasInspectorSectionContribution,
  sectionIds: Set<string>,
): void {
  if (
    !section.id.trim() ||
    sectionIds.has(section.id)
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_ID_INVALID:' +
        extensionId,
    )
  }

  if (!section.owner.trim()) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_OWNER_REQUIRED:' +
        extensionId,
    )
  }

  if (
    section.owner !== extensionId
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_OWNER_MISMATCH:' +
        extensionId,
    )
  }

  if (
    typeof section.component !==
    'function'
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_COMPONENT_REQUIRED:' +
        extensionId,
    )
  }

  const hasToolTargets =
    (section.toolIds?.length ?? 0) > 0

  const hasShapeTargets =
    (section.shapeTypes?.length ?? 0) > 0

  if (
    !hasToolTargets &&
    !hasShapeTargets
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_TARGET_REQUIRED:' +
        extensionId,
    )
  }

  if (
    section.priority !== undefined &&
    !Number.isFinite(section.priority)
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_PRIORITY_INVALID:' +
        extensionId,
    )
  }

  sectionIds.add(section.id)
}
