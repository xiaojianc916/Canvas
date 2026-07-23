#!/usr/bin/env node

import { readFile, rm, writeFile } from 'node:fs/promises'

const packageJsonPath = 'package.json'

const lifecycleArchitectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

const workflowTestPath =
  'apps/desktop/src/application/canvas/canvas-workflow.test.ts'

const terminationTestPath =
  'apps/desktop/src/application/termination/application-termination-coordinator.test.ts'

const documentServiceTestPath =
  'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts'

function replaceRequired(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`Cannot apply lifecycle test refactor: missing ${label}`)
  }

  return source.replace(oldText, newText)
}

let packageJson = await readFile(packageJsonPath, 'utf8')

packageJson = replaceRequired(
  packageJson,
  ` && node tests/architecture/check-ipc-bindings.mjs && node tests/architecture/check-canvas-lifecycle.mjs`,
  ` && node tests/architecture/check-ipc-bindings.mjs`,
  'check-canvas-lifecycle command entry',
)

await writeFile(packageJsonPath, packageJson, 'utf8')

await rm(lifecycleArchitectureCheckPath, {
  force: true,
})

const workflowTest = `import type {
  CanvasDocumentLifecycleSnapshot,
  CanvasDocumentService,
  CanvasReleaseResult,
} from '@hybrid-canvas/document'
import { describe, expect, it, vi } from 'vitest'

import { createCanvasWorkflow } from './canvas-workflow'

type ReleaseHandler = (
  sessionId: string,
  intent: 'normal' | 'discard',
) => Promise<CanvasReleaseResult>

function createDocumentPort(
  releaseHandler: ReleaseHandler,
  getLifecycleSnapshot: () => CanvasDocumentLifecycleSnapshot = () => ({
    savingOperations: [],
    unsavedSessionIds: [],
  }),
) {
  return {
    create: vi.fn(() => ({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'Canvas',
    })),
    open: vi.fn(),
    save: vi.fn(),
    releaseCanvas: vi.fn(releaseHandler),
    getLifecycleSnapshot: vi.fn(getLifecycleSnapshot),
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

describe('CanvasWorkflow lifecycle coordinator', () => {
  it('removes a workspace tab only after native release succeeds', async () => {
    const documents = createDocumentPort(async () => ({
      kind: 'released',
    }))

    const workspace = createWorkspace()
    const workflow = createCanvasWorkflow(documents, workspace as never)

    await workflow.closeCanvas('session-a', 'normal')

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-a')
    expect(workflow.getCloseSnapshot()).toEqual({
      states: {},
    })
  })

  it('keeps different session transactions independent while one is releasing', async () => {
    let resolveReleaseA!: () => void

    const pendingReleaseA = new Promise<void>((resolve) => {
      resolveReleaseA = resolve
    })

    const documents = createDocumentPort(async (sessionId) => {
      if (sessionId === 'session-a') {
        await pendingReleaseA
        return { kind: 'released' }
      }

      return { kind: 'confirmation-required' }
    })

    const workspace = createWorkspace()
    const workflow = createCanvasWorkflow(documents, workspace as never)

    const closeA = workflow.closeCanvas('session-a', 'normal')
    await workflow.closeCanvas('session-b', 'normal')

    expect(workflow.getCloseSnapshot()).toEqual({
      states: {
        'session-a': {
          state: 'releasing',
          intent: 'normal',
        },
        'session-b': {
          state: 'confirmation-required',
        },
      },
    })

    expect(workspace.closeCanvas).not.toHaveBeenCalled()

    resolveReleaseA()
    await closeA

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-a')
    expect(workflow.getCloseSnapshot()).toEqual({
      states: {
        'session-b': {
          state: 'confirmation-required',
        },
      },
    })
  })

  it('deduplicates only repeated requests for the same session', async () => {
    let resolveRelease!: () => void

    const pendingRelease = new Promise<void>((resolve) => {
      resolveRelease = resolve
    })

    const documents = createDocumentPort(async () => {
      await pendingRelease

      return { kind: 'released' }
    })

    const workspace = createWorkspace()
    const workflow = createCanvasWorkflow(documents, workspace as never)

    const first = workflow.closeCanvas('session-a', 'normal')
    const duplicate = workflow.closeCanvas('session-a', 'discard')

    expect(duplicate).toBe(first)
    expect(documents.releaseCanvas).toHaveBeenCalledTimes(1)
    expect(documents.releaseCanvas).toHaveBeenCalledWith(
      'session-a',
      'normal',
    )

    resolveRelease()
    await first

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-a')
  })

  it('cancels only the selected confirmation state', async () => {
    const documents = createDocumentPort(async () => ({
      kind: 'confirmation-required',
    }))

    const workspace = createWorkspace()
    const workflow = createCanvasWorkflow(documents, workspace as never)

    await workflow.closeCanvas('session-a', 'normal')
    await workflow.closeCanvas('session-b', 'normal')

    workflow.cancelCanvasClose('session-a')

    expect(workflow.getCloseSnapshot()).toEqual({
      states: {
        'session-b': {
          state: 'confirmation-required',
        },
      },
    })
  })

  it('preserves discard intent and failure classification for retry', async () => {
    let attempts = 0

    const documents = createDocumentPort(async () => {
      attempts += 1

      if (attempts === 1) {
        return {
          kind: 'release-failed',
          failure: {
            code: 'persistence',
            recoverable: true,
          },
        }
      }

      return { kind: 'released' }
    })

    const workspace = createWorkspace()
    const workflow = createCanvasWorkflow(documents, workspace as never)

    await workflow.closeCanvas('session-a', 'discard')

    expect(workflow.getCloseSnapshot()).toEqual({
      states: {
        'session-a': {
          state: 'release-failed',
          intent: 'discard',
          failure: {
            code: 'persistence',
            recoverable: true,
          },
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

  it('waits for both active saves and native releases before application termination', async () => {
    let resolveSave!: () => void
    let resolveRelease!: () => void

    const saving = new Promise<void>((resolve) => {
      resolveSave = resolve
    })

    const releasing = new Promise<void>((resolve) => {
      resolveRelease = resolve
    })

    const documents = createDocumentPort(
      async () => {
        await releasing
        return { kind: 'released' }
      },
      () => ({
        savingOperations: [saving],
        unsavedSessionIds: [],
      }),
    )

    const workspace = createWorkspace()
    const workflow = createCanvasWorkflow(documents, workspace as never)

    const closeOperation = workflow.closeCanvas('session-a', 'normal')

    expect(workflow.planApplicationClose()).toEqual({
      kind: 'wait-for-settlement',
      operations: [saving, closeOperation],
    })

    resolveSave()
    resolveRelease()

    await Promise.all([saving, closeOperation])

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-a')
  })
})
`

await writeFile(workflowTestPath, workflowTest, 'utf8')

const terminationTest = `import { describe, expect, it, vi } from 'vitest'

import { createApplicationTerminationCoordinator } from './application-termination-coordinator'

describe('ApplicationTerminationCoordinator', () => {
  it('dispatches the requested native termination intent', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
      },
      { terminate },
    )

    coordinator.request('update-restart')

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('update-restart')
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'update-restart',
    })
  })

  it('waits for settlement and then recalculates the close plan', async () => {
    let resolveSettlement!: () => void

    const settlement = new Promise<void>((resolve) => {
      resolveSettlement = resolve
    })

    const terminate = vi.fn()

    const planApplicationClose = vi
      .fn()
      .mockReturnValueOnce({
        kind: 'wait-for-settlement' as const,
        operations: [settlement],
      })
      .mockReturnValueOnce({
        kind: 'close-now' as const,
      })

    const coordinator = createApplicationTerminationCoordinator(
      { planApplicationClose },
      { terminate },
    )

    coordinator.request('window-close')

    expect(coordinator.getSnapshot()).toEqual({
      state: 'waiting-for-settlement',
      intent: 'window-close',
    })

    resolveSettlement()
    await settlement
    await Promise.resolve()

    expect(planApplicationClose).toHaveBeenCalledTimes(2)
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('window-close')
  })

  it('does not terminate after cancellation when an old settlement resolves', async () => {
    let resolveSettlement!: () => void

    const settlement = new Promise<void>((resolve) => {
      resolveSettlement = resolve
    })

    const terminate = vi.fn()

    const planApplicationClose = vi.fn(() => ({
      kind: 'wait-for-settlement' as const,
      operations: [settlement],
    }))

    const coordinator = createApplicationTerminationCoordinator(
      { planApplicationClose },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.cancel()

    expect(coordinator.getSnapshot()).toEqual({
      state: 'idle',
    })

    resolveSettlement()
    await settlement
    await Promise.resolve()

    expect(planApplicationClose).toHaveBeenCalledTimes(1)
    expect(terminate).not.toHaveBeenCalled()
    expect(coordinator.getSnapshot()).toEqual({
      state: 'idle',
    })
  })

  it('ignores additional requests and cancellation after termination begins', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
      },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.request('application-exit')
    coordinator.cancel()

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('window-close')
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'window-close',
    })
  })
})
`

await writeFile(terminationTestPath, terminationTest, 'utf8')

let documentServiceTest = await readFile(documentServiceTestPath, 'utf8')

const documentFailureTest = `  it('requires confirmation after a save fails before normal close', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-save-failure',
      displayName: 'save-failure.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }]}))

    harness.persistence.save.mockRejectedValue(
      new Error('native document_save rejected'),
    )

    await expect(harness.service.save(opened.sessionId)).rejects.toThrow(
      'native document_save rejected',
    )

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'confirmation-required',
    })

    expect(harness.persistence.close).not.toHaveBeenCalled()
    expect(harness.closeEditorSession).not.toHaveBeenCalled()
  })

`

if (!documentServiceTest.includes('requires confirmation after a save fails')) {
  documentServiceTest = replaceRequired(
    documentServiceTest,
    `  it('keeps the editor and document session alive after native release failure', async () => {`,
    documentFailureTest +
      `  it('keeps the editor and document session alive after native release failure', async () => {`,
    'document release failure test insertion point',
  )
}

await writeFile(documentServiceTestPath, documentServiceTest, 'utf8')

console.log(
  'Lifecycle token gate deleted and behavioral lifecycle tests installed.',
)