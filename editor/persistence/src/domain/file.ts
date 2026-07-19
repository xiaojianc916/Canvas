import type { TLEditorSnapshot } from 'tldraw'

export type FileVersion = number

export interface DrawFileHeader {
  readonly format: 'hybrid-canvas/draw'
  readonly version: FileVersion
  readonly createdAt: string
}

export interface DrawFileContainer {
  readonly header: DrawFileHeader
  readonly content: TLEditorSnapshot
}

/*
 * Format evolution:
 *
 * v1 (current) — Pure JSON file containing DrawFileContainer.
 *   Pros: simple, human-readable, easy to debug.
 *   Cons: assets stored as base64 in TLStoreSnapshot (bloat).
 *
 * v2 (planned) — ZIP container:
 *   - manifest.json (DrawFileHeader + asset index)
 *   - snapshot.json (TLStoreSnapshot)
 *   - assets/ (binary files by asset id)
 *   .tmp atomic write pattern already implemented in Rust.
 *
 * Migration: v1 files should be openable by v2 reader (check file header).
 *   v2 adds ZIP envelope, keeps inner snapshot.json identical.
 */

export interface FileReference {
  readonly id: string
  readonly name: string
}
