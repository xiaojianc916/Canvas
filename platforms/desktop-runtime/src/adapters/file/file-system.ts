import { invoke } from '@hybrid-canvas/desktop-ipc'
import type { AtomicDocumentStorage, FileReference } from '@hybrid-canvas/domain-file'

export function createAtomicDocumentStorage(): AtomicDocumentStorage {
  return {
    create: (archive) => invoke('file_create', { archive }),
    open: (ref) => invoke('file_open', { ref }),
    commit: (request) => invoke('file_commit', { request }),
    createRecoverySnapshot: (request) => invoke('file_recovery_snapshot', { request }),
    watch: (_ref, _listener) => {
      // Phase 2: implement file watching via Rust notify
      return () => {}
    },
  }
}
