import type { TLEditorSnapshot } from 'tldraw'

// Contract tests: tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

export type EditorDocumentEvent =
  | {
      readonly kind: 'ready'
    }
  | {
      readonly kind: 'changed'
    }

export interface EditorDocumentPort {
  /**
   * Returns a synchronous snapshot of the canonical tldraw editor state.
   *
   * The document application layer creates the persistence checkpoint from
   * snapshot.document. Runtime/session state is never used for dirty tracking.
   */
  readonly captureDocument: () => TLEditorSnapshot

  /**
   * Emits ready exactly at the explicit editor attachment boundary.
   *
   * Changed events are emitted only after ready and only for user-originated
   * TLStore document transactions.
   */
  readonly subscribeDocumentEvents: (listener: (event: EditorDocumentEvent) => void) => () => void
}
