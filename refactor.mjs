#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const documentServicePath =
  'editor/document/src/application/canvas-document-service.ts'
const documentPublicApiPath = 'editor/document/src/public-api.ts'
const workflowPath = 'apps/desktop/src/application/canvas/canvas-workflow.ts'
const terminationPath =
  'apps/desktop/src/application/termination/application-termination-coordinator.ts'
const terminationTestPath =
  'apps/desktop/src/application/termination/application-termination-coordinator.test.ts'
const workspaceContainerPath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

let documentService = await readFile(documentServicePath, 'utf8')

documentService = documentService.replace(
  `export type CanvasCloseDecision =
  | { readonly kind: 'close-now' }
  | {
      readonly kind: 'confirm-discard'
      readonly persistence: 'dirty' | 'failed'
    }
  | {
      readonly kind: 'wait-for-save'
      readonly operation: Promise<void>
    }
  | { readonly kind: 'not-found' }`,
  `export type CanvasCloseIntent = 'normal' | 'discard'

export type CanvasReleaseResult =
  | { readonly kind: 'released' }
  | { readonly kind: 'confirmation-required' }
  | {
      readonly kind: 'wait-for-save'
      readonly operation: Promise<void>
    }
  | { readonly kind: 'release-failed' }
  | { readonly kind: 'not-found' }`,
)

documentService = documentService.replace(
  `  readonly requestClose: (sessionId: CanvasSessionId) => CanvasCloseDecision
  readonly close: (sessionId: CanvasSessionId) => Promise<void>
  readonly discardAndClose: (sessionId: CanvasSessionId) => Promise<void>`,
  `  readonly releaseCanvas: (
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ) => Promise<CanvasReleaseResult>`,
)

const legacyCloseBlock = `  function requestClose(sessionId: CanvasSessionId): CanvasCloseDecision {
    const owned = sessions.get(sessionId)

    if (!owned) {
      return { kind: 'not-found' }
    }

    if (owned.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: owned.saveOperation,
      }
    }

    const state = owned.document.getSnapshot().persistence

    if (state === 'dirty' || state === 'failed') {
      return {
        kind: 'confirm-discard',
        persistence: state,
      }
    }

    return { kind: 'close-now' }
  }

  async function close(sessionId: CanvasSessionId): Promise<void> {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    const state = owned.document.getSnapshot().persistence

    if (state === 'dirty' || state === 'failed') {
      throw new Error('CANVAS_SESSION_DISCARD_CONFIRMATION_REQUIRED')
    }

    await closeNow(sessionId, owned)
  }

  async function discardAndClose(sessionId: CanvasSessionId): Promise<void> {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    await closeNow(sessionId, owned)
  }

  async function closeNow(
    sessionId: CanvasSessionId,
    owned: OwnedCanvasSession,
  ): Promise<void> {
    owned.document.beginClosing()
    emit()

    const documentId = owned.document.getDocumentId()

    try {
      if (documentId) {
        await persistence.close(documentId)
      }
    } catch (error) {
      owned.document.cancelClosing()
      emit()
      throw error
    }

    owned.document.completeClosing()
    owned.stopObservingDocument()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
    emit()
  }`

const unifiedReleaseBlock = `  async function releaseCanvas(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<CanvasReleaseResult> {
    const owned = sessions.get(sessionId)

    if (!owned) {
      return { kind: 'not-found' }
    }

    if (owned.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: owned.saveOperation,
      }
    }

    const persistenceState = owned.document.getSnapshot().persistence

    if (
      intent === 'normal' &&
      (persistenceState === 'dirty' || persistenceState === 'failed')
    ) {
      return { kind: 'confirmation-required' }
    }

    owned.document.beginClosing()
    emit()

    const documentId = owned.document.getDocumentId()

    try {
      if (documentId) {
        await persistence.close(documentId)
      }
    } catch {
      owned.document.cancelClosing()
      emit()

      return { kind: 'release-failed' }
    }

    owned.document.completeClosing()
    owned.stopObservingDocument()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
    emit()

    return { kind: 'released' }
  }`

documentService = documentService.replace(legacyCloseBlock, unifiedReleaseBlock)

documentService = documentService.replace(
  `    requestClose,
    close,
    discardAndClose,`,
  `    releaseCanvas,`,
)

await writeFile(documentServicePath, documentService, 'utf8')

let documentPublicApi = await readFile(documentPublicApiPath, 'utf8')

documentPublicApi = documentPublicApi.replace(
  `  type CanvasCloseDecision,`,
  `  type CanvasCloseIntent,
  type CanvasReleaseResult,`,
)

await writeFile(documentPublicApiPath, documentPublicApi, 'utf8')

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

export type CanvasCloseSnapshot =
  | { readonly state: 'idle' }
  | {
      readonly state: 'confirmation-required'
      readonly sessionId: CanvasSessionId
    }
  | {
      readonly state: 'releasing'
      readonly sessionId: CanvasSessionId
    }
  | {
      readonly state: 'release-failed'
      readonly sessionId: CanvasSessionId
    }

export interface CanvasWorkflow {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>

  /**
   * 唯一的 canvas 关闭入口。
   *
   * normal：保留未保存内容，必要时进入确认状态。
   * discard：明确放弃未保存内容后释放 native document session。
   */
  readonly closeCanvas: (
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ) => Promise<void>

  readonly cancelCanvasClose: () => void
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

  let version = 0
  let closeSnapshot: CanvasCloseSnapshot = { state: 'idle' }
  let activeClose: Promise<void> | null = null

  const stopDocumentSubscription = documents.subscribe(emit)

  function emit(): void {
    version += 1

    for (const listener of listeners) {
      listener()
    }
  }

  function setCloseSnapshot(next: CanvasCloseSnapshot): void {
    closeSnapshot = next
    emit()
  }

  function create(title: string): void {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      void documents.releaseCanvas(opened.sessionId, 'discard')
      throw error
    }
  }

  async function open(): Promise<void> {
    const opened = await documents.open()

    if (!opened) {
      return
    }

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      await documents.releaseCanvas(opened.sessionId, 'discard')
      throw error
    }
  }

  async function closeCanvas(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<void> {
    if (activeClose) {
      return activeClose
    }

    activeClose = performClose(sessionId, intent).finally(() => {
      activeClose = null
    })

    return activeClose
  }

  async function performClose(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
  ): Promise<void> {
    setCloseSnapshot({
      state: 'releasing',
      sessionId,
    })

    let result = await documents.releaseCanvas(sessionId, intent)

    if (result.kind === 'wait-for-save') {
      await result.operation.catch(() => undefined)
      result = await documents.releaseCanvas(sessionId, intent)
    }

    applyReleaseResult(sessionId, result)
  }

  function applyReleaseResult(
    sessionId: CanvasSessionId,
    result: CanvasReleaseResult,
  ): void {
    switch (result.kind) {
      case 'released':
        workspace.closeCanvas(sessionId)
        setCloseSnapshot({ state: 'idle' })
        return

      case 'confirmation-required':
        setCloseSnapshot({
          state: 'confirmation-required',
          sessionId,
        })
        return

      case 'release-failed':
        setCloseSnapshot({
          state: 'release-failed',
          sessionId,
        })
        return

      case 'not-found':
        setCloseSnapshot({ state: 'idle' })
        return

      case 'wait-for-save':
        setCloseSnapshot({
          state: 'release-failed',
          sessionId,
        })
    }
  }

  return {
    create,
    open,
    save: documents.save,
    closeCanvas,

    cancelCanvasClose() {
      if (closeSnapshot.state === 'releasing') {
        return
      }

      setCloseSnapshot({ state: 'idle' })
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
      listeners.clear()
      documents.dispose()
    },
  }
}
`

await writeFile(workflowPath, workflow, 'utf8')

const termination = `import type { ApplicationClosePlan, CanvasSessionId } from '@hybrid-canvas/document'

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
      readonly state: 'waiting-for-saves'
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

    /*
     * forceClose 会终止 native process；DocumentRegistry 与其私有路径映射
     * 在同一进程生命周期内一起释放。这里不能建立第二套逐 document_close
     * 协议，否则会出现部分 native session 已释放、另一个失败、退出却中止的
     * 不可恢复半关闭状态。
     */
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
      state: 'waiting-for-saves',
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

terminationTest = terminationTest.replaceAll(
  `        discardAllAndClose: vi.fn(),\n`,
  '',
)

await writeFile(terminationTestPath, terminationTest, 'utf8')

let workspaceContainer = await readFile(workspaceContainerPath, 'utf8')

workspaceContainer = workspaceContainer.replace(
  `import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'`,
  `import { useCallback, useMemo, useSyncExternalStore } from 'react'`,
)

workspaceContainer = workspaceContainer.replace(
  `export type WorkspaceCanvasCloseResult =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'confirmation-required'
      readonly sessionId: CanvasSessionId
    }
  | { readonly kind: 'not-found' }

`,
  '',
)

workspaceContainer = workspaceContainer.replace(
  `  readonly requestClose: (sessionId: CanvasSessionId) => Promise<WorkspaceCanvasCloseResult>
  readonly discardAndClose: (sessionId: CanvasSessionId) => Promise<void>`,
  `  readonly closeCanvas: (
    sessionId: CanvasSessionId,
    intent: 'normal' | 'discard',
  ) => Promise<void>
  readonly cancelCanvasClose: () => void
  readonly getCloseSnapshot: () => import('../../application/canvas/canvas-workflow').CanvasCloseSnapshot`,
)

workspaceContainer = workspaceContainer.replace(
  `  const [pendingCloseSessionId, setPendingCloseSessionId] = useState<CanvasSessionId | null>(null)

`,
  '',
)

workspaceContainer = workspaceContainer.replace(
  `  useSyncExternalStore(port.canvases.subscribe, port.canvases.getVersion, port.canvases.getVersion)`,
  `  useSyncExternalStore(port.canvases.subscribe, port.canvases.getVersion, port.canvases.getVersion)

  const closeSnapshot = useSyncExternalStore(
    port.canvases.subscribe,
    port.canvases.getCloseSnapshot,
    port.canvases.getCloseSnapshot,
  )`,
)

const oldHandleClose = `  const handleCloseCanvas = useCallback(
    (sessionId: CanvasSessionId) => {
      void port.canvases
        .requestClose(sessionId)
        .then((result) => {
          if (result.kind === 'confirmation-required') {
            setPendingCloseSessionId(result.sessionId)
          }
        })
        .catch((cause: unknown) => {
          reportError('canvas close request failed', {
            scope: 'workspace',
            operation: 'request-close-canvas',
            sessionId,
            cause,
          })
        })
    },
    [port.canvases],
  )`

const newHandleClose = `  const handleCloseCanvas = useCallback(
    (sessionId: CanvasSessionId, intent: 'normal' | 'discard' = 'normal') => {
      void port.canvases.closeCanvas(sessionId, intent).catch((cause: unknown) => {
        reportError('canvas close transaction failed', {
          scope: 'workspace',
          operation: 'close-canvas',
          sessionId,
          cause,
        })
      })
    },
    [port.canvases],
  )`

workspaceContainer = workspaceContainer.replace(oldHandleClose, newHandleClose)

const oldOverlay = `      overlays={
        <ConfirmationDialog
          confirmLabel="放弃并关闭"
          description="关闭画布会丢失自上次保存后的更改，此操作无法撤销。"
          destructive
          onCancel={() => setPendingCloseSessionId(null)}
          onConfirm={() => {
            if (!pendingCloseSessionId) {
              return
            }

            const sessionId = pendingCloseSessionId

            void port.canvases.discardAndClose(sessionId).then(
              () => {
                setPendingCloseSessionId(null)
              },
              (cause: unknown) => {
                reportError('discard and close canvas failed', {
                  scope: 'workspace',
                  operation: 'discard-and-close-canvas',
                  sessionId,
                  cause,
                })
              },
            )
          }}
          open={pendingCloseSessionId !== null}
          title="放弃未保存的更改？"
        />
      }`

const newOverlay = `      overlays={
        <>
          <ConfirmationDialog
            confirmLabel="放弃并关闭"
            description="关闭画布会丢失自上次保存后的更改，此操作无法撤销。"
            destructive
            onCancel={port.canvases.cancelCanvasClose}
            onConfirm={() => {
              if (closeSnapshot.state === 'confirmation-required') {
                handleCloseCanvas(closeSnapshot.sessionId, 'discard')
              }
            }}
            open={closeSnapshot.state === 'confirmation-required'}
            title="放弃未保存的更改？"
          />

          <ConfirmationDialog
            cancelLabel="保留画布"
            confirmLabel="重试关闭"
            description="无法释放本地文档会话。画布仍保持打开状态，您可以重试关闭。"
            onCancel={port.canvases.cancelCanvasClose}
            onConfirm={() => {
              if (closeSnapshot.state === 'release-failed') {
                handleCloseCanvas(closeSnapshot.sessionId, 'normal')
              }
            }}
            open={closeSnapshot.state === 'release-failed'}
            title="关闭画布失败"
          />
        </>
      }`

workspaceContainer = workspaceContainer.replace(oldOverlay, newOverlay)

await writeFile(workspaceContainerPath, workspaceContainer, 'utf8')

console.log('Canvas lifecycle coordinator refactor written.')