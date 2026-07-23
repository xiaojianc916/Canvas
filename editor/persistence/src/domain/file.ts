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
 * Physical persistence protocol — v1.
 *
 * A .draw file is UTF-8 JSON containing DrawFileContainer. The renderer owns
 * the logical tldraw snapshot; native code owns filesystem capability checks,
 * document-size limits and atomic replacement.
 *
 * There is deliberately no declared v2 archive protocol yet. ZIP containers,
 * binary assets, journal recovery, locking and file watching must be introduced
 * together as one native DocumentCodec transaction, with a real reader, writer,
 * manifest schema, migration fixtures and platform tests.
 *
 * Do not add a partial archive reader, writer or compatibility fallback here.
 */

export interface FileReference {
  readonly id: string
  readonly name: string
}
