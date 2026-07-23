#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const workflowPath = 'apps/desktop/src/application/canvas/canvas-workflow.ts'
const workspacePath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'
const workflowTestPath =
  'apps/desktop/src/application/canvas/canvas-workflow.test.ts'
const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

const workflow = `import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type {
  ApplicationClosePlan,
  CanvasCloseIntent,
  CanvasDocumentService,
  CanvasReleaseResult,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

export type CanvasCloseState =
  | { readonly state: 'confirmation-required' }
  | {
      readonly state: 'releasing'
      readonly intent: CanvasCloseIntent
    }
  | {
      readonly state: 'release-failed'
      readonly intent: CanvasCloseIntent
    }

export interface CanvasCloseSnapshot {
  readonly states: Readonly<Record<CanvasSessionId, CanvasCloseState>>
}

const EMPTY_CLOSE_SNAPSHOT: CanvasCloseSnapshot = Object.freeze({
  states: Object.freeze({}),
})

export interface CanvasWorkflow {
  readonly create: (title: string) => Promise<void>
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>

  /**
   * 每个 canvas session 都拥有独立 close transaction。
   *
   * 同一 session 的重复请求复用同一 Promise；
   * 不同 session 的 native document release 可并行执行。
   */
  readonly closeCanvas: (
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ) => Promise<void>

  readonly cancelCanvasClose: (sessionId: CanvasSessionId) => void
  readonly getCloseSnapshot: () => CanvasCloseSnapshot

  readonly planApplicationClose: () => ApplicationClosePlan
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void
}

export function createCanvasWorkflow(
  documents: CanvasDocumentService,
  workspace: WorkbenchSessionStore,
): CanvasWorkflow {
  const listeners = new Set<() => void>()
  const closeOperations = new Map<CanvasSessionId, Promise<void>>()
  const closeStates = new Map<CanvasSessionId, CanvasCloseState>()

  let version = 0
  let closeSnapshot = EMPTY_CLOSE_SNAPSHOT

  const stopDocumentSubscription = documents.subscribe(emit)

  function emit(): void {
    version += 1

    for (const listener of listeners) {
      listener()
    }
  }

  function publishCloseStates(): void {
    closeSnapshot =
      closeStates.size === 0
        ? EMPTY_CLOSE_SNAPSHOT
        : {
            states: Object.freeze(
              Object.fromEntries(closeStates) as Record<
                CanvasSessionId,
                CanvasCloseState
              >,
            ),
          }

    emit()
  }

  function setCloseState(
    sessionId: CanvasSessionId,
    state: CanvasCloseState,
  ): void {
    closeStates.set(sessionId, state)
    publishCloseStates()
  }

  function clearCloseState(sessionId: CanvasSessionId): void {
    if (!closeStates.delete(sessionId)) {
      return
    }

    publishCloseStates()
  }

  async function create(title: string): Promise<void> {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (workspaceError) {
      const release = await documents.releaseCanvas(
        opened.sessionId,
        'discard',
      )

      if (
        release.kind !== 'released' &&
        release.kind !== 'not-found'
      ) {
        throw new Error('CANVAS_CREATION_ROLLBACK_FAILED')
      }

      throw workspaceError
    }
  }

  async function open(): Promise<void> {
    const opened = await documents.open()

    if (!opened) {
      return
    }

    try {
      workspace.createCanvas(opened)
    } catch (workspaceError) {
      const release = await documents.releaseCanvas(
        opened.sessionId,
        'discard',
      )

      if (
        release.kind !== 'released' &&
        release.kind !== 'not-found'
      ) {
        throw new Error('CANVAS_OPEN_ROLLBACK_FAILED')
      }

      throw workspaceError
    }
  }

  function closeCanvas(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<void> {
    const existingOperation = closeOperations.get(sessionId)

    if (existingOperation) {
      return existingOperation
    }

    const operation = performClose(sessionId, intent).finally(() => {
      closeOperations.delete(sessionId)
    })

    closeOperations.set(sessionId, operation)

    return operation
  }

  async function performClose(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<void> {
    setCloseState(sessionId, {
      state: 'releasing',
      intent,
    })

    let result = await documents.releaseCanvas(sessionId, intent)

    if (result.kind === 'wait-for-save') {
      await result.operation.catch(() => undefined)
      result = await documents.releaseCanvas(sessionId, intent)
    }

    applyReleaseResult(sessionId, intent, result)
  }

  function applyReleaseResult(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
    result: CanvasReleaseResult,
  ): void {
    switch (result.kind) {
      case 'released':
        workspace.closeCanvas(sessionId)
        clearCloseState(sessionId)
        return

      case 'confirmation-required':
        setCloseState(sessionId, {
          state: 'confirmation-required',
        })
        return

      case 'release-failed':
        setCloseState(sessionId, {
          state: 'release-failed',
          intent,
        })
        return

      case 'not-found':
        clearCloseState(sessionId)
        return

      case 'wait-for-save':
        setCloseState(sessionId, {
          state: 'release-failed',
          intent,
        })
    }
  }

  return {
    create,
    open,
    save: documents.save,
    closeCanvas,

    cancelCanvasClose(sessionId) {
      const state = closeStates.get(sessionId)

      if (!state || state.state === 'releasing') {
        return
      }

      clearCloseState(sessionId)
    },

    getCloseSnapshot() {
      return closeSnapshot
    },

    planApplicationClose: documents.planApplicationClose,
    getEditorSession: documents.getEditorSession,
    getSessionSnapshot: documents.getSessionSnapshot,

    getVersion() {
      return version
    },

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      stopDocumentSubscription()
      closeOperations.clear()
      closeStates.clear()
      closeSnapshot = EMPTY_CLOSE_SNAPSHOT
      listeners.clear()
      documents.dispose()
    },
  }
}
`

await writeFile(workflowPath, workflow, 'utf8')

let workspace = await readFile(workspacePath, 'utf8')

workspace = workspace.replace(
  `  readonly cancelCanvasClose: () => void`,
  `  readonly cancelCanvasClose: (sessionId: CanvasSessionId) => void`,
)

workspace = workspace.replace(
  `  const closeSnapshot = useSyncExternalStore(
    port.canvases.subscribe,
    port.canvases.getCloseSnapshot,
    port.canvases.getCloseSnapshot,
  )`,
  `  const closeSnapshot = useSyncExternalStore(
    port.canvases.subscribe,
    port.canvases.getCloseSnapshot,
    port.canvases.getCloseSnapshot,
  )

  const confirmationClose = Object.entries(closeSnapshot.states).find(
    ([, state]) => state.state === 'confirmation-required',
  )

  const failedClose = Object.entries(closeSnapshot.states).find(
    ([, state]) => state.state === 'release-failed',
  )`,
)

workspace = workspace.replace(
  `            onCancel={port.canvases.cancelCanvasClose}
            onConfirm={() => {
              if (closeSnapshot.state === 'confirmation-required') {
                handleCloseCanvas(closeSnapshot.sessionId, 'discard')
              }
            }}
            open={closeSnapshot.state === 'confirmation-required'}`,
  `            onCancel={() => {
              if (confirmationClose) {
                port.canvases.cancelCanvasClose(confirmationClose[0])
              }
            }}
            onConfirm={() => {
              if (confirmationClose) {
                handleCloseCanvas(confirmationClose[0], 'discard')
              }
            }}
            open={confirmationClose !== undefined}`,
)

workspace = workspace.replace(
  `            onCancel={port.canvases.cancelCanvasClose}
            onConfirm={() => {
              if (closeSnapshot.state === 'release-failed') {
                handleCloseCanvas(
                  closeSnapshot.sessionId,
                  closeSnapshot.intent,
                )
              }
            }}
            open={closeSnapshot.state === 'release-failed'}`,
  `            onCancel={() => {
              if (failedClose) {
                port.canvases.cancelCanvasClose(failedClose[0])
              }
            }}
            onConfirm={() => {
              if (failedClose && failedClose[1].state === 'release-failed') {
                handleCloseCanvas(
                  failedClose[0],
                  failedClose[1].intent,
                )
              }
            }}
            open={failedClose !== undefined}`,
)

await writeFile(workspacePath, workspace, 'utf8')

const workflowTest = `import type {
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
`

await writeFile(workflowTestPath, workflowTest, 'utf8')

let architectureCheck = await readFile(architectureCheckPath, 'utf8')

architectureCheck = architectureCheck.replace(
  `if (!workflow.includes("readonly intent: CanvasCloseIntent")) {
  violations.push(
    'workflow: release state must retain the original CanvasCloseIntent',
  )
}`,
  `if (!workflow.includes("readonly intent: CanvasCloseIntent")) {
  violations.push(
    'workflow: release state must retain the original CanvasCloseIntent',
  )
}

if (!workflow.includes('const closeOperations = new Map')) {
  violations.push(
    'workflow: canvas close operations must be isolated per CanvasSessionId',
  )
}

if (!workflow.includes('const closeStates = new Map')) {
  violations.push(
    'workflow: canvas close states must be isolated per CanvasSessionId',
  )
}

if (workflow.includes('let activeClose: Promise<void> | null')) {
  violations.push(
    'workflow: global single canvas close operation is forbidden',
  )
}`,
)

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log('Per-session canvas lifecycle coordinator refactor written.')