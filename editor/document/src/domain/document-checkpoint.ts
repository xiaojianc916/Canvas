import type { TLEditorSnapshot } from 'tldraw'

// Tests: tests/cross-domain-contract/document-lifecycle/document-session.test.ts

/**
 * Exact content-addressed identity of the persistable TLStore document.
 *
 * The canonical value is retained instead of using a non-cryptographic hash,
 * so dirty-state correctness cannot be affected by a hash collision.
 *
 * Session records such as camera, selection, active tool and viewport are not
 * part of this value.
 */
export interface DocumentCheckpoint {
  readonly canonicalDocument: string
}

export function createDocumentCheckpoint(snapshot: TLEditorSnapshot): DocumentCheckpoint {
  return {
    canonicalDocument: stableStringify(snapshot.document),
  }
}

export function checkpointsEqual(left: DocumentCheckpoint, right: DocumentCheckpoint): boolean {
  return left.canonicalDocument === right.canonicalDocument
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value)

    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null'

    case 'bigint':
      return JSON.stringify(value.toString())

    case 'undefined':
    case 'function':
    case 'symbol':
      return 'null'

    case 'object':
      break
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableStringify(item)).join(',') + ']'
  }

  const record = value as Record<string, unknown>

  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((left, right) => left.localeCompare(right))

  return (
    '{' +
    keys.map((key) => JSON.stringify(key) + ':' + stableStringify(record[key])).join(',') +
    '}'
  )
}
