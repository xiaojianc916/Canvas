import { invoke } from '@hybrid-canvas/desktop-ipc'

export interface FileDialog {
  open(options?: {
    multiple?: boolean
    filters?: readonly { name: string; extensions: string[] }[]
  }): Promise<string[]>
  save(options?: {
    defaultPath?: string
    filters?: readonly { name: string; extensions: string[] }[]
  }): Promise<string | null>
}

export function createFileDialog(): FileDialog {
  return {
    open: (options?) => invoke('dialog_open', { options }),
    save: (options?) => invoke('dialog_save', { options }),
  }
}
