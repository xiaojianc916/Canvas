import { invoke } from '@hybrid-canvas/desktop-ipc'
import type { AtomicDocumentStorage, FileReference } from '@hybrid-canvas/file'

export function createAtomicDocumentStorage(): AtomicDocumentStorage {
  return {
    create: (archive: any) => invoke('file_create', { archive }),
    open: (ref: FileReference) => invoke('file_open', { ref }),
    commit: (request: any) => invoke('file_commit', { request }),
    createRecoverySnapshot: (request: any) => invoke('file_recovery_snapshot', { request }),
    watch: (_ref: FileReference, _listener: any) => {
      // Phase 2: implement file watching via Rust notify
      return () => {}
    },
  }
}
