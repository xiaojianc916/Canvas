export {
  type ApplicationClosePlan,
  type CanvasCloseDecision,
  type CanvasDocumentService,
  type CanvasEditorSessionRegistryPort,
  type CanvasFileSelectionPort,
  type CanvasId,
  type CanvasPersistenceState,
  type CanvasSessionId,
  type CanvasSessionSnapshot,
  type CreateCanvasDocumentServiceDependencies,
  createCanvasDocumentService,
  type DrawPersistencePort,
  type OpenedCanvasSession,
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
