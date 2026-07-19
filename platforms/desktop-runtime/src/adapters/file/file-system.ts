import { invoke } from '@hybrid-canvas/desktop-ipc'

interface DrawReadResult {
  readonly content: string
}

export interface DrawFileCommands {
  readonly saveDraw: (path: string, content: string) => Promise<void>
  readonly readDraw: (path: string) => Promise<string>
  readonly createDraw: (path: string, content: string) => Promise<string>
}

export function createDrawFileCommands(): DrawFileCommands {
  return {
    saveDraw: (path, content) =>
      invoke<void>('file_save_draw', {
        request: {
          path,
          content,
        },
      }),

    readDraw: async (path) =>
      (
        await invoke<DrawReadResult>('file_read_draw', {
          path,
        })
      ).content,

    createDraw: async (path, content) =>
      (
        await invoke<DrawReadResult>('file_create_draw', {
          path,
          content,
        })
      ).content,
  }
}
