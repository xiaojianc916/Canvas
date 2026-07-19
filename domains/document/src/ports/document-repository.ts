import type { Result } from '@hybrid-canvas/foundations-kernel'
import type { Document, DocumentId } from '../domain/document'

export interface DocumentRepository {
  get(id: DocumentId): Promise<Result<Document, string>>
  save(document: Document): Promise<Result<void, string>>
}
