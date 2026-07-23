import type {
  CanvasDocumentService,
  CanvasReleaseResult,
} from '@hybrid-canvas/document'
import { describe, expect, it, vi } from 'vitest'

import { createCanvasWorkflow } from './canvas-workflow'

function createDocumentPort(
  handler: (
    sessionId: string,
    intent: 'normal' | 'discard',
  ) => Promise<CanvasReleaseResult>,
) {
  return {
    create: vi.fn(() => ({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'Canvas',
    })),
    open: vi.fn(),
    save: vi.fn(),
    releaseCanvas: vi.fn(handler),
    planApplicationClose: vi.fn(() => ({ kind: 'close-now' as const })),
    getEditorSession: vi.fn(() => null),
    getSessionSnapshot: vi.fn(() => null),
    getVersion: vi.fn(() => 0),
    subscribe: vi.fn(() => () => {}),
    dispose: vi.fn(),
  } as unknown as CanvasDocumentService
}

function createWorkspace() {
  return {
    createCanvas: vi.fn(),
    closeCanvas: vi.fn(),
  }
}

describe('CanvasWorkflow per-session close transactions', () => {
  it('removes a workspace tab only after its native release succeeds', async () => {
    const documents = createDocumentPort(async () => ({
      kind: 'released',
    }))

    const workspace = createWorkspace()

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-a', 'normal')

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-a')
    expect(workflow.getCloseSnapshot()).toEqual({
      states: {},
    })
  })

  it('stores confirmation state per canvas session', async () => {
    const documents = createDocumentPort(async (sessionId) =>
      sessionId === 'session-a'
        ? { kind: 'confirmation-required' }
        : { kind: 'released' },
    )

    const workspace = createWorkspace()

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-a', 'normal')
    await workflow.closeCanvas('session-b', 'normal')

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-b')
    expect(workflow.getCloseSnapshot()).toEqual({
      states: {
        'session-a': {
          state: 'confirmation-required',
        },
      },
    })
  })

  it('runs different canvas releases concurrently', async () => {
    let releaseA

    const releaseAPromise = new Promise((resolve) => {
      releaseA = resolve
    })

    const documents = createDocumentPort(async (sessionId) => {
      if (sessionId === 'session-a') {
        await releaseAPromise
      }

      return { kind: 'released' }
    })

    const workspace = createWorkspace()

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    const closeA = workflow.closeCanvas('session-a', 'normal')
    const closeB = workflow.closeCanvas('session-b', 'normal')

    await closeB

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-b')
    expect(workspace.closeCanvas).not.toHaveBeenCalledWith('session-a')

    releaseA()

    await closeA

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-a')
  })

  it('deduplicates only repeated requests for the same canvas session', async () => {
    let release

    const pendingRelease = new Promise((resolve) => {
      release = resolve
    })

    const documents = createDocumentPort(async () => {
      await pendingRelease

      return { kind: 'released' }
    })

    const workspace = createWorkspace()

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    const first = workflow.closeCanvas('session-a', 'normal')
    const duplicate = workflow.closeCanvas('session-a', 'discard')

    expect(duplicate).toBe(first)
    expect(documents.releaseCanvas).toHaveBeenCalledTimes(1)

    release()

    await first

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-a')
  })

  it('retains discard intent for a failed native release retry', async () => {
    let attempts = 0

    const documents = createDocumentPort(async () => {
      attempts += 1

      return attempts === 1
        ? { kind: 'release-failed' }
        : { kind: 'released' }
    })

    const workspace = createWorkspace()

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-a', 'discard')

    expect(workflow.getCloseSnapshot()).toEqual({
      states: {
        'session-a': {
          state: 'release-failed',
          intent: 'discard',
        },
      },
    })

    await workflow.closeCanvas('session-a', 'discard')

    expect(documents.releaseCanvas).toHaveBeenNthCalledWith(
      1,
      'session-a',
      'discard',
    )

    expect(documents.releaseCanvas).toHaveBeenNthCalledWith(
      2,
      'session-a',
      'discard',
    )

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-a')
  })
})
