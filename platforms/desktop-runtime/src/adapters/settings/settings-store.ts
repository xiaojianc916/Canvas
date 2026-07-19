import { invoke } from '@hybrid-canvas/desktop-ipc'
import type { SettingsStore } from '@hybrid-canvas/domain-settings'

export function createDesktopSettingsStore(): SettingsStore {
  return {
    get: (key) => invoke('settings_get', { key }),
    set: (key, value) => invoke('settings_set', { key, value }),
    delete: (key) => invoke('settings_delete', { key }),
    clear: () => invoke('settings_clear'),
  }
}
