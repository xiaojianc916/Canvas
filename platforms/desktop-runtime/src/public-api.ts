export type { SettingsStore } from '@hybrid-canvas/settings'

export { createDesktopAssetStore } from './adapters/asset/asset-store'

export { createClipboard } from './adapters/clipboard/clipboard'

export type { FileDialog } from './adapters/dialog/file-dialog'
export { createFileDialog } from './adapters/dialog/file-dialog'

export type {
  DocumentFileCommands,
  DocumentId,
  OpenedDocument,
} from './adapters/file/file-system'
export { createDocumentFileCommands } from './adapters/file/file-system'

export type { NativeRuntimeInfo } from './adapters/native-runtime-info'

export {
  createMainWindowController,
  type MainWindowController,
} from './adapters/native-window'

export type { ExternalOpener } from './adapters/opener/external-opener'
export { createExternalOpener } from './adapters/opener/external-opener'

export { createDesktopPluginVerifier } from './adapters/plugin/plugin-verifier'

export { createDesktopSettingsStore } from './adapters/settings/settings-store'

export type { SystemTheme } from './adapters/theme/system-theme'
export { createSystemTheme } from './adapters/theme/system-theme'
