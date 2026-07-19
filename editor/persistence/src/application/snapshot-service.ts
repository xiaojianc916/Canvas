import type { DrawFileContainer, DrawFileHeader } from '../domain/file'

const CURRENT_FILE_VERSION = 1
const MAX_DRAW_FILE_BYTES = 32 * 1024 * 1024
const MAX_NESTING_DEPTH = 128
const MAX_OBJECT_NODES = 250_000

export function createDrawFileHeader(createdAt?: string): DrawFileHeader {
  return {
    format: 'hybrid-canvas/draw',
    version: CURRENT_FILE_VERSION,
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

export function serializeDrawDocument(
  content: DrawFileContainer['content'],
): string {
  return JSON.stringify({
    header: createDrawFileHeader(),
    content,
  } satisfies DrawFileContainer)
}

export function parseDrawDocument(json: string): DrawFileContainer {
  if (new TextEncoder().encode(json).byteLength > MAX_DRAW_FILE_BYTES) {
    throw new Error('DRAW_FILE_TOO_LARGE')
  }

  const parsed: unknown = JSON.parse(json)

  enforceBudget(parsed)

  if (!isRecord(parsed)) {
    throw new Error('DRAW_INVALID_ROOT')
  }

  const header = parsed.header

  if (!isRecord(header) || header.format !== 'hybrid-canvas/draw') {
    throw new Error('DRAW_INVALID_HEADER')
  }

  if (header.version !== CURRENT_FILE_VERSION) {
    throw new Error(
      typeof header.version === 'number' &&
        header.version > CURRENT_FILE_VERSION
        ? 'DRAW_FUTURE_VERSION'
        : 'DRAW_UNSUPPORTED_VERSION',
    )
  }

  if (
    typeof header.createdAt !== 'string' ||
    Number.isNaN(Date.parse(header.createdAt))
  ) {
    throw new Error('DRAW_INVALID_CREATED_AT')
  }

  if (!isRecord(parsed.content)) {
    throw new Error('DRAW_INVALID_CONTENT')
  }

  return parsed as unknown as DrawFileContainer
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function enforceBudget(root: unknown): void {
  const stack: Array<{
    value: unknown
    depth: number
  }> = [
    {
      value: root,
      depth: 0,
    },
  ]

  let nodes = 0

  while (stack.length) {
    const item = stack.pop()

    if (!item) {
      break
    }

    if (++nodes > MAX_OBJECT_NODES) {
      throw new Error('DRAW_NODE_BUDGET_EXCEEDED')
    }

    if (item.depth > MAX_NESTING_DEPTH) {
      throw new Error('DRAW_DEPTH_EXCEEDED')
    }

    if (item.value && typeof item.value === 'object') {
      for (const child of Object.values(item.value)) {
        stack.push({
          value: child,
          depth: item.depth + 1,
        })
      }
    }
  }
}
