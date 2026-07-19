import { invoke } from '@hybrid-canvas/desktop-ipc'

export interface Clipboard {
  readText(): Promise<string>
  writeText(text: string): Promise<void>
}

export function createClipboard(): Clipboard {
  return {
    readText: () => invoke('clipboard_read_text'),
    writeText: (text) => invoke('clipboard_write_text', { text }),
  }
}
