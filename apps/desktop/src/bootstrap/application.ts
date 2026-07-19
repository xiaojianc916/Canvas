import {
  createWorkbenchSessionController,
  type WorkbenchSessionStore,
} from '@hybrid-canvas/workspace'

export interface WindowApplicationPort {
  readonly openSettingsWindow: () => Promise<void>
}

export interface FileApplicationPort {
  readonly openDocument: () => Promise<void>
}

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly windows: WindowApplicationPort
  readonly files: FileApplicationPort
}

export function createApplicationRuntime(): ApplicationRuntime {
  return {
    workspace: createWorkbenchSessionController(),
    windows: {
      async openSettingsWindow(): Promise<void> {
        /* Tauri Adapter 完成后替换为 await windowPort.openOrFocus('settings') */
      },
    },
    files: {
      async openDocument(): Promise<void> {
        /* File Application Service 完成后接入 */
      },
    },
  }
}
