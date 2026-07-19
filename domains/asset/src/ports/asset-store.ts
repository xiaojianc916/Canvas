import type { Result } from '@hybrid-canvas/foundations-kernel'
import type { AssetHash, AssetId, AssetReference, MimeType } from '../domain/asset'

export interface AssetStore {
  store(
    id: AssetId,
    hash: AssetHash,
    mimeType: MimeType,
    bytes: Uint8Array,
  ): Promise<Result<AssetReference, string>>
  load(id: AssetId): Promise<Result<{ bytes: Uint8Array; mimeType: MimeType }, string>>
  delete(id: AssetId): Promise<Result<void, string>>
  list(): Promise<AssetReference[]>
}
