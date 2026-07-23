import type { TLStoreSnapshot } from 'tldraw'

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
   * Returns the canonical persistable tldraw document snapshot.
   *
   * This contains document-scoped TLStore records only. Camera, selection,
   * current tool, viewport and other local session state are excluded by the
   * return type and must be persisted through a separate local-session port.
   */
  readonly captureDocument: () => TLStoreSnapshot

  /**
   * Emits ready exactly at the explicit editor attachment boundary.
   *
   * Changed events are emitted only after ready and only for user-originated
   * TLStore document transactions.
   */
  readonly subscribeDocumentEvents: (
    listener: (event: EditorDocumentEvent) => void,
  ) => () => void
}
