export type SettingsKey =
  | 'theme'
  | 'language'
  | 'autoSave'
  | 'autoSaveIntervalMs'
  | 'showGrid'
  | 'snapToGrid'
  | 'gridSize'
  | 'defaultZoom'

export interface ThemeSettings {
  readonly theme: 'light' | 'dark' | 'system'
}

export interface SettingsSnapshot {
  readonly values: Record<SettingsKey, unknown>
  readonly version: number
}
