export type ThemeMode =
  | 'light'
  | 'dark'
  | 'system'

export interface CanvasSettings {
  readonly defaultZoom: number
  readonly showGrid: boolean
  readonly snapToGrid: boolean
  readonly gridSize: number
  readonly showRulers: boolean
  readonly infiniteCanvas: boolean
}

export interface EditorSettings {
  readonly fontFamily: string
  readonly fontSize: number
  readonly lineHeight: number
  readonly tabSize: number
  readonly insertSpaces: boolean
  readonly wordWrap: boolean
  readonly minimap: boolean
}

export interface ExportSettings {
  readonly defaultFormat: string
  readonly pngDpi: number
  readonly pdfQuality: number
  readonly includeMetadata: boolean
}

export interface PrivacySettings {
  readonly telemetry: boolean
  readonly crashReporting: boolean
  readonly updateCheck: boolean
}

export interface AppSettings {
  readonly theme: ThemeMode
  readonly language: string
  readonly autoSave: boolean
  readonly autoSaveIntervalMs: number
  readonly shortcuts: Readonly<
    Record<string, string>
  >
  readonly canvas: CanvasSettings
  readonly editor: EditorSettings
  readonly export: ExportSettings
  readonly privacy: PrivacySettings
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  autoSave: true,
  autoSaveIntervalMs: 30_000,
  shortcuts: {},
  canvas: {
    defaultZoom: 1,
    showGrid: false,
    snapToGrid: false,
    gridSize: 20,
    showRulers: false,
    infiniteCanvas: true,
  },
  editor: {
    fontFamily:
      'JetBrains Mono, Consolas, monospace',
    fontSize: 14,
    lineHeight: 1.5,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: true,
    minimap: false,
  },
  export: {
    defaultFormat: 'svg',
    pngDpi: 300,
    pdfQuality: 90,
    includeMetadata: true,
  },
  privacy: {
    telemetry: false,
    crashReporting: true,
    updateCheck: true,
  },
}
