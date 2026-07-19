import type {
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: TLAnyBindingUtilConstructor[]
  readonly tools?: TLStateNodeConstructor[]
  readonly records?: CustomRecordContribution[]
  readonly shapeLabels?: Record<string, string>
}

export interface CustomRecordContribution {
  readonly id: string
  readonly record: Record<string, unknown>
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: TLAnyShapeUtilConstructor[]
  readonly bindingUtils: TLAnyBindingUtilConstructor[]
  readonly tools: TLStateNodeConstructor[]
  readonly shapeLabels: Record<string, string>
}

const registered: HybridCanvasExtension[] = []

export function registerExtension(extension: HybridCanvasExtension): void {
  const existing = registered.findIndex((e) => e.id === extension.id)
  if (existing >= 0) {
    registered[existing] = extension
    return
  }
  registered.push(extension)
}

export function getExtensionRegistration(): ExtensionRegistration {
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}

  for (const ext of registered) {
    if (ext.shapeUtils) shapeUtils.push(...ext.shapeUtils)
    if (ext.bindingUtils) bindingUtils.push(...ext.bindingUtils)
    if (ext.tools) tools.push(...ext.tools)
    if (ext.shapeLabels) Object.assign(shapeLabels, ext.shapeLabels)
  }

  return { extensions: [...registered], shapeUtils, bindingUtils, tools, shapeLabels }
}

export function clearExtensions(): void {
  registered.length = 0
}
