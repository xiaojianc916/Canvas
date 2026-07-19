import {
  createWorkbenchSessionController,
  type WorkbenchSessionStore,
} from '@hybrid-canvas/workspace'
import {
  createDrawFileCommands,
  createDesktopSettingsStore,
  createFileDialog,
  createExternalOpener,
  createSystemTheme,
  type DrawFileCommands,
  type FileDialog,
  type ExternalOpener,
  type SettingsStore,
  type SystemTheme,
} from '@hybrid-canvas/platforms-desktop-runtime'
import { serializeDrawDocument, parseDrawDocument } from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'

export interface WindowApplicationPort {
  readonly openSettingsWindow: () => Promise<void>
}

export interface FileApplicationPort {
  readonly openDocument: () => Promise<void>
  readonly saveDocument: (documentId: string, snapshot: TLEditorSnapshot) => Promise<void>
}

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly windows: WindowApplicationPort
  readonly files: FileApplicationPort
  readonly drawFiles: DrawFileCommands
  readonly settings: SettingsStore
  readonly dialog: FileDialog
  readonly opener: ExternalOpener
  readonly theme: SystemTheme
}

export function createApplicationRuntime(): ApplicationRuntime {
  const drawFiles = createDrawFileCommands()
  const dialog = createFileDialog()

  return {
    workspace: createWorkbenchSessionController(),
    windows: {
      async openSettingsWindow(): Promise<void> {
        // Phase 2: implement Tauri window management
      },
    },
    files: {
      async openDocument(): Promise<void> {
        const paths = await dialog.open({
          filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
        })
        const firstPath = paths[0]
        if (!firstPath) return
        const json = await drawFiles.readDraw(firstPath)
        const container = parseDrawDocument(json)
        // TODO: wire snapshot into EditorCanvas via state
        // container.content is the TLEditorSnapshot to load
      },
      async saveDocument(_documentId: string, snapshot: TLEditorSnapshot): Promise<void> {
        const json = serializeDrawDocument(snapshot)
        const path = await dialog.save({
          filters: [{ name: 'Hybrid Canvas 画布', extensions: ['draw'] }],
          defaultPath: '未命名画板.draw',
        })
        if (!path) return
        await drawFiles.saveDraw(path, json)
      },
    },
    storage: createAtomicDocumentStorage(),
    drawFiles,
    settings: createDesktopSettingsStore(),
    dialog,
    opener: createExternalOpener(),
    theme: createSystemTheme(),
  }
}
