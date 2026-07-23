import type {
  CanvasDocumentService,
  CanvasReleaseResult,
} from '@hybrid-canvas/document'
import { describe, expect, it, vi } from 'vitest'

import { createCanvasWorkflow } from './canvas-workflow'

function createDocumentPort(results: readonly CanvasReleaseResult[]) {
  const queue = [...results]

  return {
    create: vi.fn(() => ({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'Canvas',
    })),
    open: vi.fn(),
    save: vi.fn(),
    releaseCanvas: vi.fn(async () => queue.shift() ?? { kind: 'not-found' }),
    planApplicationClose: vi.fn(() => ({ kind: 'close-now' as const })),
    getEditorSession: vi.fn(() => null),
    getSessionSnapshot: vi.fn(() => null),
    getVersion: vi.fn(() => 0),
    subscribe: vi.fn(() => () => {}),
    dispose: vi.fn(),
  } as unknown as CanvasDocumentService
}

describe('CanvasWorkflow close transaction', () => {
  it('removes the workspace canvas only after native release succeeds', async () => {
    const documents = createDocumentPort([{ kind: 'released' }])

    const workspace = {
      createCanvas: vi.fn(),
      closeCanvas: vi.fn(),
    }

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-1', 'normal')

    expect(documents.releaseCanvas).toHaveBeenCalledWith(
      'session-1',
      'normal',
    )

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-1')
    expect(workflow.getCloseSnapshot()).toEqual({ state: 'idle' })
  })

  it('publishes confirmation-required without removing the workspace tab', async () => {
    const documents = createDocumentPort([
      { kind: 'confirmation-required' },
    ])

    const workspace = {
      createCanvas: vi.fn(),
      closeCanvas: vi.fn(),
    }

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-1', 'normal')

    expect(workspace.closeCanvas).not.toHaveBeenCalled()
    expect(workflow.getCloseSnapshot()).toEqual({
      state: 'confirmation-required',
      sessionId: 'session-1',
    })
  })

  it('retains the workspace tab and publishes retry state on release failure', async () => {
    const documents = createDocumentPort([
      { kind: 'release-failed' },
      { kind: 'released' },
    ])

    const workspace = {
      createCanvas: vi.fn(),
      closeCanvas: vi.fn(),
    }

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-1', 'normal')

    expect(workspace.closeCanvas).not.toHaveBeenCalled()
    expect(workflow.getCloseSnapshot()).toEqual({
      state: 'release-failed',
      sessionId: 'session-1',
    })

    await workflow.closeCanvas('session-1', 'normal')

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-1')
    expect(workflow.getCloseSnapshot()).toEqual({ state: 'idle' })
  })

  it('waits for an active save and reevaluates the same close intent', async () => {
    const saveOperation = Promise.resolve()

    const documents = createDocumentPort([
      {
        kind: 'wait-for-save',
        operation: saveOperation,
      },
      { kind: 'released' },
    ])

    const workspace = {
      createCanvas: vi.fn(),
      closeCanvas: vi.fn(),
    }

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-1', 'normal')

    expect(documents.releaseCanvas).toHaveBeenNthCalledWith(
      1,
      'session-1',
      'normal',
    )

    expect(documents.releaseCanvas).toHaveBeenNthCalledWith(
      2,
      'session-1',
      'normal',
    )

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-1')
  })
})
