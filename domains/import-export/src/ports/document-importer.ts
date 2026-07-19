export interface DocumentImporter {
  readonly supportedMimeTypes: readonly string[]
  import(data: Uint8Array, mimeType: string): Promise<unknown>
}
