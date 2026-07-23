#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const documentServicePath =
  'editor/document/src/application/canvas-document-service.ts'

const documentPublicApiPath =
  'editor/document/src/public-api.ts'

const workflowPath =
  'apps/desktop/src/application/canvas/canvas-workflow.ts'

const workflowTestPath =
  'apps/desktop/src/application/canvas/canvas-workflow.test.ts'

const terminationPath =
  'apps/desktop/src/application/termination/application-termination-coordinator.ts'

const terminationTestPath =
  'apps/desktop/src/application/termination/application-termination-coordinator.test.ts'

const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

function replaceRequired(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`Cannot apply refactor: missing ${label}`)
  }

  return source.replace(oldText, newText)
}

let documentService = await readFile(documentServicePath, 'utf8')

documentService = replaceRequired(
  documentService,
  `export type ApplicationClosePlan =
  | { readonly kind: 'close-now' }
  | {
      readonly kind: 'confirm-discard'
      readonly sessionIds: readonly CanvasSessionId[]
    }
  | {
      readonly kind: 'wait-for-saves'
      readonly operations: readonly Promise<void>[]
    }`,
  `export interface CanvasDocumentLifecycleSnapshot {
  readonly savingOperations: readonly Promise<void>[]
  readonly unsavedSessionIds: readonly CanvasSessionId[]
}`,
  'legacy ApplicationClosePlan contract',
)

documentService = replaceRequired(
  documentService,
  `  readonly planApplicationClose: () => ApplicationClosePlan`,
  `  readonly getLifecycleSnapshot: () => CanvasDocumentLifecycleSnapshot`,
  'CanvasDocumentService.planApplicationClose',
)

documentService = replaceRequired(
  documentService,
  `  function planApplicationClose(): ApplicationClosePlan {
    const operations: Promise<void>[] = []
    const dirtySessionIds: CanvasSessionId[] = []

    for (const [sessionId, owned] of sessions) {
      if (owned.saveOperation) {
        operations.push(owned.saveOperation)
        continue
      }

      const state = owned.document.getSnapshot().persistence

      if (state === 'dirty' || state === 'failed') {
        dirtySessionIds.push(sessionId)
      }
    }

    if (operations.length > 0) {
      return { kind: 'wait-for-saves', operations }
    }

    if (dirtySessionIds.length > 0) {
      return { kind: 'confirm-discard', sessionIds: dirtySessionIds }
    }

    return { kind: 'close-now' }
  }`,
  `  function getLifecycleSnapshot(): CanvasDocumentLifecycleSnapshot {
    const savingOperations: Promise<void>[] = []
    const unsavedSessionIds: CanvasSessionId[] = []

    for (const [sessionId, owned] of sessions) {
      if (owned.saveOperation) {
        savingOperations.push(owned.saveOperation)
        continue
      }

      const persistence = owned.document.getSnapshot().persistence

      if (persistence === 'dirty' || persistence === 'failed') {
        unsavedSessionIds.push(sessionId)
      }
    }

    return {
      savingOperations,
      unsavedSessionIds,
    }
  }`,
  'document lifecycle planning implementation',
)

documentService = replaceRequired(
  documentService,
  `    planApplicationClose,`,
  `    getLifecycleSnapshot,`,
  'CanvasDocumentService return contract',
)

await writeFile(documentServicePath, documentService, 'utf8')

let documentPublicApi = await readFile(documentPublicApiPath, 'utf8')

documentPublicApi = replaceRequired(
  documentPublicApi,
  `  type ApplicationClosePlan,
  type CanvasCloseIntent,`,
  `  type CanvasCloseIntent,
  type CanvasDocumentLifecycleSnapshot,`,
  'document public API lifecycle export',
)

await writeFile(documentPublicApiPath, documentPublicApi, 'utf8')

const workflow = `import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type {
  CanvasCloseIntent,
  CanvasDocumentService,
  CanvasReleaseFailure,
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
      readonly failure: CanvasReleaseFailure
    }

export interface CanvasCloseSnapshot {
  readonly states: Readonly<Record<CanvasSessionId, CanvasCloseState>>
}

/**
 * Application termination has exactly one asynchronous boundary:
 * every active save and every active native document release settles first.
 */
export type ApplicationClosePlan =
  | { readonly kind: 'close-now' }
  | {
      readonly kind: 'confirm-discard'
      readonly sessionIds: readonly CanvasSessionId[]
    }
  | {
      readonly kind: 'wait-for-settlement'
      readonly operations: readonly Promise<void>[]
    }

const EMPTY_CLOSE_SNAPSHOT: CanvasCloseSnapshot = Object.freeze({
  states: Object.freeze({}),
})

export interface CanvasWorkflow {
  readonly create: (title: string) => Promise<void>
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
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
    if (closeStates.delete(sessionId)) {
      publishCloseStates()
    }
  }

  async function create(title: string): Promise<void> {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (workspaceError) {
      await rollbackOpenedCanvas(opened.sessionId, 'CANVAS_CREATION_ROLLBACK_FAILED')
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
      await rollbackOpenedCanvas(opened.sessionId, 'CANVAS_OPEN_ROLLBACK_FAILED')
      throw workspaceError
    }
  }

  async function rollbackOpenedCanvas(
    sessionId: CanvasSessionId,
    errorCode: string,
  ): Promise<void> {
    const result = await documents.releaseCanvas(sessionId, 'discard')

    if (result.kind !== 'released' && result.kind !== 'not-found') {
      throw new Error(errorCode)
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

    const operation = runCloseTransaction(sessionId, intent).finally(() => {
      closeOperations.delete(sessionId)
      emit()
    })

    closeOperations.set(sessionId, operation)

    return operation
  }

  async function runCloseTransaction(
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
          failure: result.failure,
        })
        return

      case 'not-found':
        clearCloseState(sessionId)
        return

      case 'wait-for-save':
        throw new Error('CANVAS_RELEASE_SETTLEMENT_INCOMPLETE')
    }
  }

  function planApplicationClose(): ApplicationClosePlan {
    const documentLifecycle = documents.getLifecycleSnapshot()

    const operations = [
      ...documentLifecycle.savingOperations,
      ...closeOperations.values(),
    ]

    if (operations.length > 0) {
      return {
        kind: 'wait-for-settlement',
        operations,
      }
    }

    if (documentLifecycle.unsavedSessionIds.length > 0) {
      return {
        kind: 'confirm-discard',
        sessionIds: documentLifecycle.unsavedSessionIds,
      }
    }

    return { kind: 'close-now' }
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

    planApplicationClose,
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

let workflowTest = await readFile(workflowTestPath, 'utf8')

workflowTest = replaceRequired(
  workflowTest,
  `    planApplicationClose: vi.fn(() => ({ kind: 'close-now' as const })),`,
  `    getLifecycleSnapshot: vi.fn(() => ({
      savingOperations: [],
      unsavedSessionIds: [],
    })),`,
  'workflow document lifecycle test port',
)

workflowTest = workflowTest.replace(
  `  it('retains discard intent for a failed native release retry', async () => {`,
  `  it('waits for active per-session release operations before application termination', async () => {
    let resolveRelease!: () => void

    const release = new Promise<void>((resolve) => {
      resolveRelease = resolve
    })

    const documents = createDocumentPort(async () => {
      await release
      return { kind: 'released' }
    })

    const workspace = createWorkspace()

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    const closing = workflow.closeCanvas('session-a', 'normal')

    expect(workflow.planApplicationClose()).toEqual({
      kind: 'wait-for-settlement',
      operations: [closing],
    })

    resolveRelease()
    await closing

    expect(workflow.planApplicationClose()).toEqual({
      kind: 'close-now',
    })
  })

  it('retains discard intent for a failed native release retry', async () => {`,
)

await writeFile(workflowTestPath, workflowTest, 'utf8')

const termination = `import type { CanvasSessionId } from '@hybrid-canvas/document'

import type { ApplicationClosePlan } from '../canvas/canvas-workflow'

export type ApplicationTerminationIntent =
  | 'window-close'
  | 'update-restart'
  | 'application-exit'

export type ApplicationTerminationSnapshot =
  | {
      readonly state: 'idle'
    }
  | {
      readonly state: 'confirmation-required'
      readonly intent: ApplicationTerminationIntent
      readonly sessionIds: readonly CanvasSessionId[]
    }
  | {
      readonly state: 'waiting-for-settlement'
      readonly intent: ApplicationTerminationIntent
    }
  | {
      readonly state: 'terminating'
      readonly intent: ApplicationTerminationIntent
    }

export interface ApplicationTerminator {
  readonly terminate: (intent: ApplicationTerminationIntent) => void
}

export interface ApplicationClosePort {
  readonly planApplicationClose: () => ApplicationClosePlan
}

export interface ApplicationTerminationCoordinator {
  readonly request: (intent: ApplicationTerminationIntent) => void
  readonly cancel: () => void
  readonly confirmDiscard: () => void
  readonly getSnapshot: () => ApplicationTerminationSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void
}

export function createApplicationTerminationCoordinator(
  canvases: ApplicationClosePort,
  terminator: ApplicationTerminator,
): ApplicationTerminationCoordinator {
  let snapshot: ApplicationTerminationSnapshot = { state: 'idle' }
  let generation = 0
  let disposed = false

  const listeners = new Set<() => void>()

  function emit(next: ApplicationTerminationSnapshot): void {
    snapshot = next

    for (const listener of listeners) {
      listener()
    }
  }

  function request(intent: ApplicationTerminationIntent): void {
    if (disposed || snapshot.state === 'terminating') {
      return
    }

    evaluate(intent, canvases.planApplicationClose())
  }

  function beginTermination(intent: ApplicationTerminationIntent): void {
    generation += 1

    emit({
      state: 'terminating',
      intent,
    })

    terminator.terminate(intent)
  }

  function evaluate(
    intent: ApplicationTerminationIntent,
    plan: ApplicationClosePlan,
  ): void {
    if (plan.kind === 'close-now') {
      beginTermination(intent)
      return
    }

    if (plan.kind === 'confirm-discard') {
      emit({
        state: 'confirmation-required',
        intent,
        sessionIds: plan.sessionIds,
      })
      return
    }

    const currentGeneration = ++generation

    emit({
      state: 'waiting-for-settlement',
      intent,
    })

    void Promise.allSettled(plan.operations).then(() => {
      if (!disposed && currentGeneration === generation) {
        request(intent)
      }
    })
  }

  return {
    request,

    cancel() {
      if (snapshot.state === 'terminating') {
        return
      }

      generation += 1
      emit({ state: 'idle' })
    },

    confirmDiscard() {
      if (snapshot.state !== 'confirmation-required') {
        return
      }

      beginTermination(snapshot.intent)
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      disposed = true
      generation += 1
      listeners.clear()
    },
  }
}
`

await writeFile(terminationPath, termination, 'utf8')

let terminationTest = await readFile(terminationTestPath, 'utf8')

terminationTest = terminationTest.replace(
  `  it('does not cancel after native termination begins', () => {`,
  `  it('waits for all lifecycle settlement before re-evaluating termination', async () => {
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

    expect(terminate).not.toHaveBeenCalled()

    resolveSettlement()
    await settlement
    await Promise.resolve()

    expect(planApplicationClose).toHaveBeenCalledTimes(2)
    expect(terminate).toHaveBeenCalledWith('window-close')
  })

  it('does not cancel after native termination begins', () => {`,
)

await writeFile(terminationTestPath, terminationTest, 'utf8')

let architectureCheck = await readFile(architectureCheckPath, 'utf8')

architectureCheck = replaceRequired(
  architectureCheck,
  `  'void documents.releaseCanvas',`,
  `  'void documents.releaseCanvas',
  'wait-for-saves',
  'planApplicationClose: () => ApplicationClosePlan',`,
  'legacy lifecycle architecture forbidden list',
)

architectureCheck = architectureCheck.replace(
  `if (!workflow?.includes('CanvasCloseSnapshot')) {`,
  `if (!workflow?.includes('wait-for-settlement')) {
  violations.push(
    'CanvasWorkflow must own one application settlement phase for saves and releases',
  )
}

if (!workflow?.includes('documents.getLifecycleSnapshot()')) {
  violations.push(
    'CanvasWorkflow must own application close planning instead of delegating it',
  )
}

if (documentService?.includes('planApplicationClose')) {
  violations.push(
    'Document service must not own a second application termination lifecycle',
  )
}

if (!workflow?.includes('CanvasCloseSnapshot')) {`,
)

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log(
  'Unified Canvas lifecycle coordinator refactor written: document state, per-session release, and application termination now use one settlement model.',
)