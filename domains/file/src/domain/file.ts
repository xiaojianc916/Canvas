export type FileVersion = number

export interface DrawFileHeader {
  readonly format: 'hybrid-canvas/draw'
  readonly version: FileVersion
  readonly createdAt: string
}

export interface DrawFileContainer {
  readonly header: DrawFileHeader
  readonly document: unknown
  readonly assets: Record<string, Uint8Array>
  readonly migrations: readonly string[]
}

export interface FileReference {
  readonly id: string
  readonly name: string
}
