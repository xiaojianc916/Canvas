import type { DrawFileContainer, DrawFileHeader } from '../domain/file'

const CURRENT_FILE_VERSION = 1

export function createDrawFileHeader(createdAt?: string): DrawFileHeader {
  return {
    format: 'hybrid-canvas/draw',
    version: CURRENT_FILE_VERSION,
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

export function serializeDrawDocument(content: unknown): string {
  const container: DrawFileContainer = {
    header: createDrawFileHeader(),
    content: content as DrawFileContainer['content'],
  }
  return JSON.stringify(container)
}

export function parseDrawDocument(json: string): DrawFileContainer {
  const parsed = JSON.parse(json)

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid .draw file: top-level value is not an object')
  }

  const header = parsed.header as DrawFileHeader | undefined
  if (!header || header.format !== 'hybrid-canvas/draw') {
    throw new Error('Invalid .draw file: missing or invalid header')
  }

  if (!parsed.content) {
    throw new Error('Invalid .draw file: missing content')
  }

  return { header, content: parsed.content }
}
