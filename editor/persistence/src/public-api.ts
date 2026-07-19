export { createDrawFileHeader, serializeDrawDocument, parseDrawDocument } from './application/snapshot-service'
export type { DrawFileContainer, DrawFileHeader, FileReference, FileVersion } from './domain/file'
export type {
  ArchivePayload,
  AtomicDocumentStorage,
  CommitRequest,
  CommitResult,
  ExternalChangeEvent,
  OpenedArchive,
  RecoveryRequest,
  StorageError,
} from './ports/file-system'
