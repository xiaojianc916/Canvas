#!/usr/bin/env node

/**
 * P0-A — Close the native document handle when opening a persisted document
 * fails before the Canvas session has been committed.
 *
 * This refactor establishes one fail-closed open transaction:
 *
 *   native open / registry insert
 *     -> outer .draw validation
 *     -> configured tldraw store creation
 *     -> document session registration
 *
 * If outer parsing or tldraw validation fails, the native document handle is
 * closed before the original error is rethrown.
 *
 * If native rollback also fails, both failures are retained in an
 * AggregateError with the stable message DOCUMENT_OPEN_ROLLBACK_FAILED.
 *
 * Usage:
 *   node refactor-p0-open-transaction.mjs --check
 *   node refactor-p0-open-transaction.mjs --apply
 *   node refactor-p0-open-transaction.mjs --apply /path/to/Canvas
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

if (apply && check) {
  fail('Use either --check or --apply, not both.')
}

if (!apply && !check) {
  fail('Missing mode. Use --check or --apply.')
}

const paths = {
  packageJson: join(root, 'package.json'),
  documentService: join(
    root,
    'editor/document/src/application/canvas-document-service.ts',
  ),
  rollbackTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/canvas-document-open-rollback.test.ts',
  ),
}

function fail(message) {
  console.error(`\nP0-A open transaction refactor failed:\n${message}\n`)
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

const currentOpenTransaction = `  async function open(): Promise<OpenedCanvasSession | null> {
    const opened = await persistence.open()

    if (!opened) {
      return null
    }

    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const initialSnapshot = parseEditorSnapshot(opened.content)

    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      initialSnapshot,
      extensions,
    })

    sessions.set(sessionId, createOwnedSession(editor, opened.id))

    return {
      canvasId,
      sessionId,
      title: opened.displayName,
    }
  }`

const nextOpenTransaction = `  async function open(): Promise<OpenedCanvasSession | null> {
    const opened = await persistence.open()

    if (!opened) {
      return null
    }

    /*
     * Native document_open registers an opaque document handle before the
     * renderer can validate the logical .draw payload with the complete tldraw
     * extension schema.
     *
     * Treat parsing, configured store creation and session registration as one
     * transaction. Until sessions.set() succeeds, any failure must release the
     * native document handle.
     */
    try {
      const canvasId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      const initialSnapshot = parseEditorSnapshot(opened.content)

      const editor = editorSessions.create({
        documentId: canvasId,
        sessionId,
        initialSnapshot,
        extensions,
      })

      sessions.set(sessionId, createOwnedSession(editor, opened.id))

      return {
        canvasId,
        sessionId,
        title: opened.displayName,
      }
    } catch (openError) {
      return rollbackOpenedNativeDocument(opened.id, openError)
    }
  }

  async function rollbackOpenedNativeDocument(
    documentId: string,
    openError: unknown,
  ): Promise<never> {
    try {
      await persistence.close(documentId)
    } catch (rollbackError) {
      /*
       * Never hide a leaked native handle behind the original parsing or
       * tldraw validation error. Preserve both failures for diagnostics while
       * exposing a stable application-level failure message.
       */
      throw new AggregateError(
        [openError, rollbackError],
        'DOCUMENT_OPEN_ROLLBACK_FAILED',
      )
    }

    throw openError
  }`

const rollbackTestSource = `import { createCanvasDocumentService } from '@hybrid-canvas/document'
import { describe, expect, it, vi } from 'vitest'

const VALID_OUTER_CONTAINER = JSON.stringify({
  header: {
    format: 'hybrid-canvas/draw',
    version: 1,
    createdAt: '2026-07-23T00:00:00.000Z',
  },
  content: {
    document: {
      schema: {},
      store: {},
    },
    session: {},
  },
})

interface HarnessOptions {
  readonly content: string
  readonly editorOpenError?: Error
  readonly rollbackError?: Error
}

function createHarness({
  content,
  editorOpenError = new Error('DRAW_INVALID_SNAPSHOT'),
  rollbackError,
}: HarnessOptions) {
  const editorSessions = {
    create: vi.fn(() => {
      throw editorOpenError
    }),
    close: vi.fn(),
    dispose: vi.fn(),
  }

  const close = rollbackError
    ? vi.fn(async () => {
        throw rollbackError
      })
    : vi.fn(async () => {})

  const persistence = {
    open: vi.fn(async () => ({
      id: 'native-document-id',
      displayName: 'broken.draw',
      content,
    })),
    save: vi.fn(async () => {}),
    saveAs: vi.fn(async () => null),
    close,
  }

  const service = createCanvasDocumentService({
    editorSessions,
    persistence,
    extensions: [],
  })

  return {
    service,
    editorSessions,
    persistence,
  }
}

describe('CanvasDocumentService open transaction', () => {
  it('closes the native document when outer parsing fails', async () => {
    const { service, editorSessions, persistence } = createHarness({
      content: 'not-json',
    })

    await expect(service.open()).rejects.toThrow()

    expect(editorSessions.create).not.toHaveBeenCalled()
    expect(persistence.close).toHaveBeenCalledTimes(1)
    expect(persistence.close).toHaveBeenCalledWith('native-document-id')
  })

  it('closes the native document when tldraw snapshot loading fails', async () => {
    const snapshotError = new Error('DRAW_INVALID_SNAPSHOT')
    const { service, editorSessions, persistence } = createHarness({
      content: VALID_OUTER_CONTAINER,
      editorOpenError: snapshotError,
    })

    await expect(service.open()).rejects.toBe(snapshotError)

    expect(editorSessions.create).toHaveBeenCalledTimes(1)
    expect(persistence.close).toHaveBeenCalledTimes(1)
    expect(persistence.close).toHaveBeenCalledWith('native-document-id')
  })

  it('preserves both failures when native rollback fails', async () => {
    const snapshotError = new Error('DRAW_INVALID_SNAPSHOT')
    const rollbackError = new Error('NATIVE_DOCUMENT_CLOSE_FAILED')
    const { service, persistence } = createHarness({
      content: VALID_OUTER_CONTAINER,
      editorOpenError: snapshotError,
      rollbackError,
    })

    let failure: unknown

    try {
      await service.open()
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(AggregateError)

    const aggregate = failure as AggregateError

    expect(aggregate.message).toBe('DOCUMENT_OPEN_ROLLBACK_FAILED')
    expect(aggregate.errors).toEqual([snapshotError, rollbackError])
    expect(persistence.close).toHaveBeenCalledTimes(1)
    expect(persistence.close).toHaveBeenCalledWith('native-document-id')
  })
})
`

function replaceOpenTransaction(source) {
  if (
    source.includes(
      "return rollbackOpenedNativeDocument(opened.id, openError)",
    ) &&
    source.includes('DOCUMENT_OPEN_ROLLBACK_FAILED')
  ) {
    return {
      content: source,
      changed: false,
    }
  }

  const firstIndex = source.indexOf(currentOpenTransaction)

  if (firstIndex === -1) {
    throw new Error(
      [
        `Expected open() implementation was not found in:`,
        paths.documentService,
        '',
        'The repository may differ from the audited commit.',
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
  }

  const secondIndex = source.indexOf(
    currentOpenTransaction,
    firstIndex + currentOpenTransaction.length,
  )

  if (secondIndex !== -1) {
    throw new Error(
      'Expected exactly one CanvasDocumentService.open() implementation.',
    )
  }

  return {
    content:
      source.slice(0, firstIndex) +
      nextOpenTransaction +
      source.slice(firstIndex + currentOpenTransaction.length),
    changed: true,
  }
}

async function prepareRollbackTest() {
  if (!(await exists(paths.rollbackTest))) {
    return {
      changed: true,
      content: rollbackTestSource,
    }
  }

  const existing = await readFile(paths.rollbackTest, 'utf8')

  if (existing === rollbackTestSource) {
    return {
      changed: false,
      content: existing,
    }
  }

  throw new Error(
    [
      `Rollback test already exists with different content:`,
      paths.rollbackTest,
      '',
      'Refusing to overwrite an unaudited test file.',
    ].join('\n'),
  )
}

async function main() {
  if (!(await exists(paths.packageJson))) {
    throw new Error(
      [
        `Canvas repository root was not found: ${root}`,
        'Run this script from the repository root or pass the root path.',
      ].join('\n'),
    )
  }

  if (!(await exists(paths.documentService))) {
    throw new Error(
      `Required source file was not found: ${paths.documentService}`,
    )
  }

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected repository package name: ${String(packageJson.name)}`,
    )
  }

  const documentServiceSource = await readFile(
    paths.documentService,
    'utf8',
  )

  const documentServiceChange = replaceOpenTransaction(
    documentServiceSource,
  )

  const rollbackTestChange = await prepareRollbackTest()

  const changed =
    documentServiceChange.changed || rollbackTestChange.changed

  if (!changed) {
    console.log('P0-A native document rollback is already applied.')
    return
  }

  if (check) {
    console.log('P0-A open transaction refactor is safe to apply.')
    console.log('')
    console.log('It will:')
    console.log(
      '- roll back the native document handle when .draw parsing fails;',
    )
    console.log(
      '- roll back the native document handle when tldraw rejects a snapshot;',
    )
    console.log(
      '- preserve both open and rollback failures when cleanup fails;',
    )
    console.log(
      '- add cross-domain regression coverage for all three paths;',
    )
    console.log(
      '- leave the configured createTLStore({ snapshot }) boundary unchanged;',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the refactor.',
    )
    return
  }

  await mkdir(dirname(paths.rollbackTest), {
    recursive: true,
  })

  const writes = []

  if (documentServiceChange.changed) {
    writes.push(
      writeFile(
        paths.documentService,
        documentServiceChange.content,
        'utf8',
      ),
    )
  }

  if (rollbackTestChange.changed) {
    writes.push(
      writeFile(
        paths.rollbackTest,
        rollbackTestChange.content,
        'utf8',
      ),
    )
  }

  await Promise.all(writes)

  console.log('Applied P0-A fail-closed document open transaction.')
  console.log('')
  console.log('Changed:')
  console.log(
    '- editor/document/src/application/canvas-document-service.ts',
  )
  console.log(
    '- tests/cross-domain-contract/document-lifecycle/canvas-document-open-rollback.test.ts',
  )
  console.log('')
  console.log('Required verification:')
  console.log(
    '  pnpm --filter @hybrid-canvas/document typecheck',
  )
  console.log(
    '  pnpm --filter @hybrid-canvas/test-cross-domain-contract typecheck',
  )
  console.log(
    '  pnpm --filter @hybrid-canvas/test-cross-domain-contract test',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm lint')
  console.log('  pnpm test')
}

main().catch((error) => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error))
})