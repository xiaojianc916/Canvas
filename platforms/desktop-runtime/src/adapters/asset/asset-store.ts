import type { AssetStore } from '@hybrid-canvas/asset'
import { invoke } from '@hybrid-canvas/desktop-ipc'

export function createDesktopAssetStore(): AssetStore {
  return {
    store: (id: string, hash: string, mimeType: string, bytes: Uint8Array) =>
      invoke('asset_store', { id, hash, mimeType, bytes }),
    load: (id: string) => invoke('asset_load', { id }),
    delete: (id: string) => invoke('asset_delete', { id }),
    list: () => invoke('asset_list'),
  }
}
