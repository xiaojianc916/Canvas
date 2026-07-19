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

export interface FileReference {
  readonly id: string
  readonly name: string
}
