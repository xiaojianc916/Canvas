export type ExportFormatId = string

export interface ExportFormat {
  readonly id: ExportFormatId
  readonly name: string
  readonly extension: string
  readonly mimeType: string
}

export interface ExportScene {
  readonly document: unknown
  readonly pages: readonly unknown[]
}

export interface SemanticExportScene {
  readonly document: unknown
  readonly graph: SemanticGraph
}

export interface SemanticGraph {
  readonly nodes: readonly SemanticNode[]
  readonly edges: readonly SemanticEdge[]
}

export interface SemanticNode {
  readonly id: string
  readonly type: string
  readonly label: string
}

export interface SemanticEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly label?: string
}

export const SVG_FORMAT: ExportFormat = {
  id: 'svg',
  name: 'Scalable Vector Graphics',
  extension: 'svg',
  mimeType: 'image/svg+xml',
}

export const PNG_FORMAT: ExportFormat = {
  id: 'png',
  name: 'PNG Image',
  extension: 'png',
  mimeType: 'image/png',
}
