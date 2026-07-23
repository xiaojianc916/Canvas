import { createCanvasDocumentService } from '@hybrid-canvas/document'
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
