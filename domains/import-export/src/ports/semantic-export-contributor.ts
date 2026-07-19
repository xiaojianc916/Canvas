import type { ExportFormat, ExportFormatId, SemanticExportScene } from '../domain/export'

export interface SemanticExportContributor {
  readonly formats: readonly ExportFormat[]
  contributeSemantic(scene: SemanticExportScene, formatId: ExportFormatId): Promise<Blob>
}
