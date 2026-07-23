/* biome-ignore-all lint/complexity/useLiteralKeys: Parsed snapshot data uses index signatures until runtime validation completes. */
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

export function serializeDrawDocument(content: DrawFileContainer['content']): string {
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

  const header = parsed['header']

  if (!isRecord(header) || header['format'] !== 'hybrid-canvas/draw') {
    throw new Error('DRAW_INVALID_HEADER')
  }

  if (header['version'] !== CURRENT_FILE_VERSION) {
    throw new Error(
      typeof header['version'] === 'number' && header['version'] > CURRENT_FILE_VERSION
        ? 'DRAW_FUTURE_VERSION'
        : 'DRAW_UNSUPPORTED_VERSION',
    )
  }

  const createdAt = header['createdAt']

  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('DRAW_INVALID_CREATED_AT')
  }

  const content = parsePersistedEditorSnapshot(parsed['content'])

  return {
    header: {
      format: 'hybrid-canvas/draw',
      version: CURRENT_FILE_VERSION,
      createdAt,
    },
    content,
  }
}

interface PersistedEditorSnapshotWire {
  readonly document: {
    readonly schema: Record<string, unknown>
    readonly store: Record<string, unknown>
  }
  readonly session: Record<string, unknown>
}

/**
 * This validates only the stable file wire envelope.
 *
 * It intentionally does not duplicate tldraw's record schema, migration,
 * custom-shape, binding, or integrity rules. The configured tldraw store is
 * the sole authority for those rules when createTLStore({ snapshot }) runs.
 */
function parsePersistedEditorSnapshot(
  value: unknown,
): DrawFileContainer['content'] {
  if (!isRecord(value)) {
    throw new Error('DRAW_INVALID_SNAPSHOT')
  }

  const document = value['document']
  const session = value['session']

  if (!isRecord(document) || !isRecord(session)) {
    throw new Error('DRAW_INVALID_SNAPSHOT')
  }

  const schema = document['schema']
  const store = document['store']

  if (!isRecord(schema) || !isRecord(store)) {
    throw new Error('DRAW_INVALID_SNAPSHOT')
  }

  const wire: PersistedEditorSnapshotWire = {
    document: {
      schema,
      store,
    },
    session,
  }

  /*
   * TypeScript cannot derive a complete third-party record schema from JSON.
   * This assertion is confined to the validated wire boundary. The next
   * boundary, createTLStore({ snapshot }), performs authoritative validation.
   */
  return wire as DrawFileContainer['content']
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
