import { invoke } from '@hybrid-canvas/desktop-ipc'
import type { AtomicDocumentStorage, FileReference } from '@hybrid-canvas/file'

export interface DrawFileCommands {
  readonly saveDraw: (path: string, content: string) => Promise<void>
  readonly readDraw: (path: string) => Promise<string>
  readonly createDraw: (path: string, content: string) => Promise<string>
}

export function createDrawFileCommands(): DrawFileCommands {
  return {
    saveDraw: (path, content) => invoke('file_save_draw', { request: { path, content } }),
    readDraw: (path) => invoke('file_read_draw', { path }).then((r: any) => r.content as string),
    createDraw: (path, content) => invoke('file_create_draw', { path, content }).then((r: any) => r.content as string),
  }
}

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
