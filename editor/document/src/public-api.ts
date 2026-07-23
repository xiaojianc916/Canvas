export {
  type CanvasCloseIntent,
  type CanvasDocumentLifecycleSnapshot,
  type CanvasReleaseFailure,
  type CanvasReleaseFailureCode,
  type CanvasReleaseResult,
  type CanvasDocumentService,
  type CanvasEditorSessionRegistryPort,
  type CanvasId,
  type CanvasPersistenceState,
  type CanvasSessionId,
  type CanvasSessionSnapshot,
  type CreateCanvasDocumentServiceDependencies,
  createCanvasDocumentService,
  type DocumentPersistencePort,
  type OpenedCanvasSession,
  type OpenedNativeDocument,
  type SavedNativeDocument,
} from './application/canvas-document-service'

export {
  checkpointsEqual,
  createDocumentCheckpoint,
  type DocumentCheckpoint,
} from './domain/document-checkpoint'

export {
  createDocumentSession,
  type DocumentPersistenceState,
  type DocumentSaveTicket,
  type DocumentSession,
  type DocumentSessionPhase,
  type DocumentSessionSnapshot,
} from './domain/document-session'

export type {
  EditorDocumentEvent,
  EditorDocumentPort,
} from './ports/editor-document-port'
