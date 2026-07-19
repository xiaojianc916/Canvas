import type { SettingsKey, SettingsSnapshot } from '../domain/settings'

export interface SettingsStore {
  get<K extends SettingsKey>(key: K): Promise<unknown>
  set<K extends SettingsKey>(key: K, value: unknown): Promise<void>
  reset(): Promise<void>
  subscribe(listener: (snapshot: SettingsSnapshot) => void): () => void
}
