import { invoke } from '@hybrid-canvas/desktop-ipc'

export interface ExternalOpener {
  openPath(path: string): Promise<void>
  showInFolder(path: string): Promise<void>
}

export function createExternalOpener(): ExternalOpener {
  return {
    openPath: (path) => invoke('opener_open_external', { path }),
    showInFolder: (path) => invoke('opener_show_in_folder', { path }),
  }
}
