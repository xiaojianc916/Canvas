import { invoke } from '@hybrid-canvas/desktop-ipc'
import type { AssetStore } from '@hybrid-canvas/domain-asset'

export function createDesktopAssetStore(): AssetStore {
  return {
    store: (id, hash, mimeType, bytes) => invoke('asset_store', { id, hash, mimeType, bytes }),
    load: (id) => invoke('asset_load', { id }),
    delete: (id) => invoke('asset_delete', { id }),
    list: () => invoke('asset_list'),
  }
}
