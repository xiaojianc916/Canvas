import type { AppSettings } from '../domain/settings'

export interface SettingsStore {
  readonly load: () => Promise<AppSettings>
  readonly save: (settings: AppSettings) => Promise<void>
  readonly reset: () => Promise<AppSettings>
}
