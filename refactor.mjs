#!/usr/bin/env node
/**
 * P0.1 — Validate the persisted TLEditorSnapshot wire envelope.
 *
 * This refactor:
 * 1. Removes the raw `parsed as unknown as DrawFileContainer` assertion.
 * 2. Requires a real editor snapshot envelope:
 *      content.document.schema: object
 *      content.document.store: object
 *      content.session: object
 * 3. Keeps authoritative tldraw schema / migration / custom-shape validation
 *    exclusively in createTLStore({ snapshot }).
 * 4. Replaces persistence test fixtures that incorrectly used
 *    `{ document: {}, session: {} }`.
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),
  snapshotService: join(
    root,
    'editor/persistence/src/application/snapshot-service.ts',
  ),
  snapshotServiceTest: join(
    root,
    'editor/persistence/src/application/snapshot-service.test.ts',
  ),
  documentLifecycleTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
  ),
}

function fail(message) {
  console.error(`\nP0 snapshot wire-envelope refactor failed:\n${message}\n`)
  process.exitCode = 1
}

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function replaceExactlyOnce(source, oldText, newText, description) {
  const firstIndex = source.indexOf(oldText)

  if (firstIndex === -1) {
    throw new Error(
      [
        `Expected source fragment was not found: ${description}`,
        'Refusing fuzzy replacement because the source is not the audited version.',
      ].join('\n'),
    )
  }

  const secondIndex = source.indexOf(
    oldText,
    firstIndex + oldText.length,
  )

  if (secondIndex !== -1) {
    throw new Error(
      `Expected one source fragment but found multiple matches: ${description}`,
    )
  }

  return (
    source.slice(0, firstIndex) +
    newText +
    source.slice(firstIndex + oldText.length)
  )
}

async function main() {
  if (!(await exists(paths.packageJson))) {
    fail(
      [
        `Repository root was not found: ${root}`,
        'Run this script from the Hybrid Canvas repository root.',
      ].join('\n'),
    )
    return
  }

  for (const [label, path] of Object.entries(paths)) {
    if (label === 'packageJson') {
      continue
    }

    if (!(await exists(path))) {
      fail(`Required source file was not found: ${path}`)
      return
    }
  }

  const [
    snapshotServiceSource,
    snapshotServiceTestSource,
    documentLifecycleTestSource,
  ] = await Promise.all([
    readFile(paths.snapshotService, 'utf8'),
    readFile(paths.snapshotServiceTest, 'utf8'),
    readFile(paths.documentLifecycleTest, 'utf8'),
  ])

  if (
    snapshotServiceSource.includes(
      'function parsePersistedEditorSnapshot(',
    ) &&
    snapshotServiceTestSource.includes(
      "it('rejects an incomplete editor snapshot envelope'",
    ) &&
    documentLifecycleTestSource.includes('function validSnapshotWire()')
  ) {
    console.log('P0 snapshot wire-envelope validation is already applied.')
    return
  }

  try {
    const oldSnapshotServiceTail = `  if (!isRecord(parsed['content'])) {
    throw new Error('DRAW_INVALID_CONTENT')
  }

  return parsed as unknown as DrawFileContainer
}`

    const newSnapshotServiceTail = `  const content = parsePersistedEditorSnapshot(parsed['content'])

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
}`

    let nextSnapshotService = replaceExactlyOnce(
      snapshotServiceSource,
      oldSnapshotServiceTail,
      newSnapshotServiceTail,
      'replace raw DrawFileContainer assertion',
    )

    const oldCreatedAtValidation = `  if (typeof header['createdAt'] !== 'string' || Number.isNaN(Date.parse(header['createdAt']))) {
    throw new Error('DRAW_INVALID_CREATED_AT')
  }

  const content = parsePersistedEditorSnapshot(parsed['content'])`

    const newCreatedAtValidation = `  const createdAt = header['createdAt']

  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('DRAW_INVALID_CREATED_AT')
  }

  const content = parsePersistedEditorSnapshot(parsed['content'])`

    nextSnapshotService = replaceExactlyOnce(
      nextSnapshotService,
      oldCreatedAtValidation,
      newCreatedAtValidation,
      'preserve narrowed createdAt value for typed file reconstruction',
    )

    const nextSnapshotServiceTest = `import { describe, expect, it } from 'vitest'

import {
  createDrawFileHeader,
  parseDrawDocument,
  serializeDrawDocument,
} from './snapshot-service'

function createValidSnapshotWire() {
  return {
    document: {
      schema: {
        schemaVersion: 2,
        sequences: {},
      },
      store: {
        'document:document': {
          id: 'document:document',
          typeName: 'document',
          name: 'Untitled',
          meta: {},
        },
      },
    },
    session: {},
  }
}

function createValidJson(): string {
  return JSON.stringify({
    header: createDrawFileHeader('2026-01-01T00:00:00.000Z'),
    content: createValidSnapshotWire(),
  })
}

describe('draw snapshot service', () => {
  it('parses and serializes a valid draw container', () => {
    const parsed = parseDrawDocument(createValidJson())

    const serialized = serializeDrawDocument(parsed.content)

    const reparsed = parseDrawDocument(serialized)

    expect(reparsed.header.format).toBe('hybrid-canvas/draw')
    expect(reparsed.header.version).toBe(1)
    expect(reparsed.content).toEqual(parsed.content)
  })

  it('rejects a future file version before snapshot validation', () => {
    const json = JSON.stringify({
      header: {
        format: 'hybrid-canvas/draw',
        version: 999,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      content: {},
    })

    expect(() => parseDrawDocument(json)).toThrow('DRAW_FUTURE_VERSION')
  })

  it('rejects an incomplete editor snapshot envelope', () => {
    const json = JSON.stringify({
      header: createDrawFileHeader('2026-01-01T00:00:00.000Z'),
      content: {
        document: {},
        session: {},
      },
    })

    expect(() => parseDrawDocument(json)).toThrow('DRAW_INVALID_SNAPSHOT')
  })

  it('rejects a snapshot without session state', () => {
    const json = JSON.stringify({
      header: createDrawFileHeader('2026-01-01T00:00:00.000Z'),
      content: {
        document: {
          schema: {
            schemaVersion: 2,
            sequences: {},
          },
          store: {},
        },
      },
    })

    expect(() => parseDrawDocument(json)).toThrow('DRAW_INVALID_SNAPSHOT')
  })

  it('rejects an invalid format identifier', () => {
    const json = JSON.stringify({
      header: {
        format: 'unknown/draw',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      content: {},
    })

    expect(() => parseDrawDocument(json)).toThrow('DRAW_INVALID_HEADER')
  })

  it('rejects invalid creation timestamps', () => {
    const json = JSON.stringify({
      header: {
        format: 'hybrid-canvas/draw',
        version: 1,
        createdAt: 'not-a-date',
      },
      content: {},
    })

    expect(() => parseDrawDocument(json)).toThrow('DRAW_INVALID_CREATED_AT')
  })

  it('rejects excessive nesting', () => {
    let value = {}

    for (let index = 0; index < 140; index += 1) {
      value = { child: value }
    }

    const json = JSON.stringify({
      header: createDrawFileHeader(),
      content: value,
    })

    expect(() => parseDrawDocument(json)).toThrow('DRAW_DEPTH_EXCEEDED')
  })
})
`

    const oldLifecycleSnapshotFunction = `function snapshot(documentValue: unknown): TLEditorSnapshot {
  return {
    document: documentValue,
    session: {},
  } as unknown as TLEditorSnapshot
}`

    const newLifecycleSnapshotFunction = `function validSnapshotWire(): TLEditorSnapshot {
  /*
   * Lifecycle tests cross the actual file parser but use a mocked editor
   * session. They must therefore provide a valid persisted snapshot envelope,
   * without pretending to reimplement live tldraw record validation.
   */
  return {
    document: {
      schema: {
        schemaVersion: 2,
        sequences: {},
      },
      store: {
        'document:document': {
          id: 'document:document',
          typeName: 'document',
          name: 'Untitled',
          meta: {},
        },
      },
    },
    session: {},
  } as TLEditorSnapshot
}

function snapshot(documentValue: unknown): TLEditorSnapshot {
  /*
   * These lifecycle tests invoke change listeners explicitly. The snapshot
   * contents are not interpreted by their mocked editor, so retain a valid
   * parser fixture instead of injecting invalid pseudo tldraw records.
   */
  void documentValue

  return validSnapshotWire()
}`

    const nextDocumentLifecycleTest = replaceExactlyOnce(
      documentLifecycleTestSource,
      oldLifecycleSnapshotFunction,
      newLifecycleSnapshotFunction,
      'replace fake cross-domain TLEditorSnapshot fixture',
    )

    if (!apply) {
      console.log('P0.1 snapshot wire-envelope validation is safe to apply.')
      console.log('')
      console.log('Changes:')
      console.log('- rejects incomplete { document: {}, session: {} } snapshots;')
      console.log('- requires document.schema, document.store and session objects;')
      console.log('- removes the raw parsed as unknown as DrawFileContainer assertion;')
      console.log('- updates persistence and lifecycle fixtures to valid wire envelopes;')
      console.log('')
      console.log('Run again with --apply to write the changes.')
      return
    }

    await Promise.all([
      writeFile(paths.snapshotService, nextSnapshotService, 'utf8'),
      writeFile(paths.snapshotServiceTest, nextSnapshotServiceTest, 'utf8'),
      writeFile(
        paths.documentLifecycleTest,
        nextDocumentLifecycleTest,
        'utf8',
      ),
    ])

    console.log('Applied P0.1 snapshot wire-envelope validation.')
    console.log('')
    console.log('Verify:')
    console.log('  pnpm --filter @hybrid-canvas/file test')
    console.log('  pnpm --filter @hybrid-canvas/file typecheck')
    console.log('  pnpm --filter @hybrid-canvas/test-cross-domain-contract test')
    console.log('  pnpm typecheck')
    console.log('  pnpm lint')
    console.log('  pnpm test')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

await main()