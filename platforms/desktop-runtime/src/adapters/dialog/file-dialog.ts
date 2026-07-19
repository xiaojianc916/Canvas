import { invoke } from '@hybrid-canvas/desktop-ipc'

interface OpenFileResult {
  readonly paths: string[]
  readonly cancelled: boolean
}

interface SaveFileResult {
  readonly path: string | null
  readonly cancelled: boolean
}

export interface FileDialog {
  open(options?: {
    multiple?: boolean
    filters?: readonly {
      name: string
      extensions: string[]
    }[]
  }): Promise<string[]>

  save(options?: {
    defaultPath?: string
    filters?: readonly {
      name: string
      extensions: string[]
    }[]
  }): Promise<string | null>
}

export function createFileDialog(): FileDialog {
  return {
    async open(options) {
      const result = await invoke<OpenFileResult>('file_open', { options })
      return result.cancelled ? [] : result.paths
    },

    async save(options) {
      const normalized = options
        ? {
            ...options,
            default_name: options.defaultPath,
            defaultPath: undefined,
          }
        : undefined

      const result = await invoke<SaveFileResult>('file_save', {
        options: normalized,
      })

      return result.cancelled ? null : result.path
    },
  }
}
