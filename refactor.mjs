#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const documentSessionPath = 'editor/document/src/domain/document-session.ts'
const documentServicePath =
  'editor/document/src/application/canvas-document-service.ts'
const workflowPath = 'apps/desktop/src/application/canvas/canvas-workflow.ts'
const workspaceContainerPath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'
const lifecycleTestPath =
  'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts'

let documentSession = await readFile(documentSessionPath, 'utf8')

documentSession = documentSession.replace(
  `  readonly beginClosing: () => void
  readonly completeClosing: () => void`,
  `  readonly beginClosing: () => void
  readonly cancelClosing: () => void
  readonly completeClosing: () => void`,
)

documentSession = documentSession.replace(
  `    completeClosing() {
      if (phase !== 'closing') {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phase = 'closed'
    },`,
  `    cancelClosing() {
      if (phase !== 'closing') {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phase = 'ready'
    },

    completeClosing() {
      if (phase !== 'closing') {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phase = 'closed'
    },`,
)

await writeFile(documentSessionPath, documentSession, 'utf8')

let documentService = await readFile(documentServicePath, 'utf8')

documentService = documentService.replace(
  `  readonly requestClose: (sessionId: CanvasSessionId) => CanvasCloseDecision
  readonly discardAndClose: (sessionId: CanvasSessionId) => void`,
  `  readonly requestClose: (sessionId: CanvasSessionId) => CanvasCloseDecision
  readonly close: (sessionId: CanvasSessionId) => Promise<void>
  readonly discardAndClose: (sessionId: CanvasSessionId) => Promise<void>`,
)

documentService = documentService.replace(
  `    closeNow(sessionId, owned)

    return { kind: 'close-now' }`,
  `    return { kind: 'close-now' }`,
)

documentService = documentService.replace(
  `  function discardAndClose(sessionId: CanvasSessionId) {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    closeNow(sessionId, owned)
  }

  function closeNow(sessionId: CanvasSessionId, owned: OwnedCanvasSession) {
    owned.document.beginClosing()
    owned.document.completeClosing()

    const documentId = owned.document.getDocumentId()

    if (documentId) {
      void persistence.close(documentId)
    }

    owned.stopObservingDocument()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
    emit()
  }`,
  `  async function close(sessionId: CanvasSessionId): Promise<void> {
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
  }`,
)

documentService = documentService.replace(
  `    requestClose,
    discardAndClose,`,
  `    requestClose,
    close,
    discardAndClose,`,
)

documentService = documentService.replace(
  `    dispose() {
      for (const [sessionId, owned] of sessions) {
        const documentId = owned.document.getDocumentId()

        if (documentId) {
          void persistence.close(documentId)
        }

        owned.stopObservingDocument()
        editorSessions.close(sessionId)
      }`,
  `    dispose() {
      for (const [sessionId, owned] of sessions) {
        // dispose 只在应用运行时被销毁时执行。此时 native process 的退出会
        // 统一释放 DocumentRegistry；不得在这里 fire-and-forget document_close。
        owned.stopObservingDocument()
        editorSessions.close(sessionId)
      }`,
)

await writeFile(documentServicePath, documentService, 'utf8')

let workflow = await readFile(workflowPath, 'utf8')

workflow = workflow.replace(
  `  readonly discardAndClose: (sessionId: CanvasSessionId) => void`,
  `  readonly discardAndClose: (sessionId: CanvasSessionId) => Promise<void>`,
)

workflow = workflow.replace(
  `      case 'close-now':
        workspace.closeCanvas(sessionId)
        return { kind: 'closed' }`,
  `      case 'close-now':
        await documents.close(sessionId)
        workspace.closeCanvas(sessionId)
        return { kind: 'closed' }`,
)

workflow = workflow.replace(
  `  function discardAndClose(sessionId: CanvasSessionId): void {
    documents.discardAndClose(sessionId)
    workspace.closeCanvas(sessionId)
  }

  function discardAllAndClose(sessionIds: readonly CanvasSessionId[]): void {
    for (const sessionId of sessionIds) {
      discardAndClose(sessionId)
    }
  }`,
  `  async function discardAndClose(sessionId: CanvasSessionId): Promise<void> {
    await documents.discardAndClose(sessionId)
    workspace.closeCanvas(sessionId)
  }

  function discardAllAndClose(sessionIds: readonly CanvasSessionId[]): void {
    for (const sessionId of sessionIds) {
      void discardAndClose(sessionId)
    }
  }`,
)

await writeFile(workflowPath, workflow, 'utf8')

let workspaceContainer = await readFile(workspaceContainerPath, 'utf8')

workspaceContainer = workspaceContainer.replace(
  `  readonly discardAndClose: (sessionId: CanvasSessionId) => void`,
  `  readonly discardAndClose: (sessionId: CanvasSessionId) => Promise<void>`,
)

workspaceContainer = workspaceContainer.replace(
  `          onConfirm={() => {
            if (!pendingCloseSessionId) {
              return
            }

            try {
              port.canvases.discardAndClose(pendingCloseSessionId)
            } catch (cause) {
              reportError('discard and close canvas failed', {
                scope: 'workspace',
                operation: 'discard-and-close-canvas',
                sessionId: pendingCloseSessionId,
                cause,
              })

              return
            }

            setPendingCloseSessionId(null)
          }}`,
  `          onConfirm={() => {
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
          }}`,
)

await writeFile(workspaceContainerPath, workspaceContainer, 'utf8')

let lifecycleTest = await readFile(lifecycleTestPath, 'utf8')

lifecycleTest = lifecycleTest.replace(
  `    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'close-now',
    })

    await Promise.resolve()

    expect(harness.persistence.close).toHaveBeenCalledWith(
      'document-native-close',
    )`,
  `    expect(harness.service.requestClose(opened.sessionId)).toEqual({
      kind: 'close-now',
    })

    await harness.service.close(opened.sessionId)

    expect(harness.persistence.close).toHaveBeenCalledWith(
      'document-native-close',
    )

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)`,
)

lifecycleTest = lifecycleTest.replace(
  `  })
})`,
  `  })

  it('keeps the canvas session alive when native document_close fails', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'document-native-close-failure',
      displayName: 'close-failure.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected document to open')
    }

    harness.ready()

    const closeError = new Error('native document close failed')
    harness.persistence.close.mockRejectedValue(closeError)

    await expect(harness.service.close(opened.sessionId)).rejects.toBe(closeError)

    expect(harness.closeEditorSession).not.toHaveBeenCalled()
    expect(harness.service.getEditorSession(opened.sessionId)).not.toBeNull()
    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })

    harness.persistence.close.mockResolvedValue(undefined)

    await harness.service.close(opened.sessionId)

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
  })
})`,
)

await writeFile(lifecycleTestPath, lifecycleTest, 'utf8')

console.log('Document close transaction refactor written.')