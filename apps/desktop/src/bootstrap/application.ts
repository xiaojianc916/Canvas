import {
  createWorkbenchSessionController,
  type WorkbenchSessionStore,
} from '@hybrid-canvas/workspace'
import {
  createAtomicDocumentStorage,
  createDesktopSettingsStore,
  createFileDialog,
  createExternalOpener,
  createSystemTheme,
  type AtomicDocumentStorage,
  type FileDialog,
  type ExternalOpener,
  type SettingsStore,
  type SystemTheme,
} from '@hybrid-canvas/platforms-desktop-runtime'

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
  readonly storage: AtomicDocumentStorage
  readonly settings: SettingsStore
  readonly dialog: FileDialog
  readonly opener: ExternalOpener
  readonly theme: SystemTheme
}

export function createApplicationRuntime(): ApplicationRuntime {
  return {
    workspace: createWorkbenchSessionController(),
    windows: {
      async openSettingsWindow(): Promise<void> {
        // Implemented by Tauri window management
      },
    },
    files: {
      async openDocument(): Promise<void> {
        // Implemented by file dialog
      },
    },
    storage: createAtomicDocumentStorage(),
    settings: createDesktopSettingsStore(),
    dialog: createFileDialog(),
    opener: createExternalOpener(),
    theme: createSystemTheme(),
  }
}
