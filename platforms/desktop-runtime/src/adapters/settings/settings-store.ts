import { invoke } from '@hybrid-canvas/desktop-ipc'
import type { SettingsStore } from '@hybrid-canvas/settings'

export function createDesktopSettingsStore(): SettingsStore {
  return {
    get: (key: string) => invoke('settings_get', { key }),
    set: (key: string, value: unknown) => invoke('settings_set', { key, value }),
    reset: () => invoke('settings_reset'),
    subscribe: () => () => {},
  }
}
