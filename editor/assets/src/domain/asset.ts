import type { Result } from '@hybrid-canvas/foundations-kernel'

export type AssetId = string & { readonly __brand: 'AssetId' }
export type AssetHash = string & { readonly __brand: 'AssetHash' }
export type MimeType = string

export interface AssetContent {
  readonly id: AssetId
  readonly hash: AssetHash
  readonly mimeType: MimeType
  readonly bytes: Uint8Array
  readonly createdAt: string
}

export interface AssetReference {
  readonly id: AssetId
  readonly hash: AssetHash
  readonly mimeType: MimeType
  readonly byteSize: number
}

export function createAssetId(value: string): AssetId {
  return value as AssetId
}
