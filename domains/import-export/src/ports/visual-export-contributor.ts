import type { ExportFormat, ExportFormatId, ExportScene } from '../domain/export'

export interface VisualExportContributor {
  readonly formats: readonly ExportFormat[]
  contributeVisual(scene: ExportScene, formatId: ExportFormatId): Promise<Blob>
}
