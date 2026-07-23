#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const documentServicePath =
  'editor/document/src/application/canvas-document-service.ts'

const workflowPath =
  'apps/desktop/src/application/canvas/canvas-workflow.ts'

const lifecycleTestPath =
  'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts'

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
  `export type CanvasReleaseResult =
  | { readonly kind: 'released' }
  | { readonly kind: 'confirmation-required' }
  | {
      readonly kind: 'wait-for-save'
      readonly operation: Promise<void>
    }
  | {
      readonly kind: 'release-failed'
      readonly failure: CanvasReleaseFailure
    }
  | { readonly kind: 'not-found' }`,
  `export type CanvasReleaseResult =
  | { readonly kind: 'released' }
  | { readonly kind: 'confirmation-required' }
  | {
      readonly kind: 'release-failed'
      readonly failure: CanvasReleaseFailure
    }
  | { readonly kind: 'not-found' }`,
  'CanvasReleaseResult wait-for-save variant',
)

documentService = replaceRequired(
  documentService,
  `    if (owned.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: owned.saveOperation,
      }
    }

    const persistenceState = owned.document.getSnapshot().persistence`,
  `    while (owned.saveOperation) {
      await owned.saveOperation.catch(() => undefined)
    }

    const persistenceState = owned.document.getSnapshot().persistence`,
  'DocumentService delegated save-wait branch',
)

await writeFile(documentServicePath, documentService, 'utf8')

let workflow = await readFile(workflowPath, 'utf8')

workflow = replaceRequired(
  workflow,
  `    let result = await documents.releaseCanvas(sessionId, intent)

    if (result.kind === 'wait-for-save') {
      await result.operation.catch(() => undefined)
      result = await documents.releaseCanvas(sessionId, intent)
    }

    applyReleaseResult(sessionId, intent, result)`,
  `    const result = await documents.releaseCanvas(sessionId, intent)

    applyReleaseResult(sessionId, intent, result)`,
  'workflow save-wait retry branch',
)

workflow = replaceRequired(
  workflow,
  `      case 'not-found':
        clearCloseState(sessionId)
        return

      case 'wait-for-save':
        throw new Error('CANVAS_RELEASE_SETTLEMENT_INCOMPLETE')`,
  `      case 'not-found':
        clearCloseState(sessionId)
        return`,
  'workflow wait-for-save result branch',
)

await writeFile(workflowPath, workflow, 'utf8')

let lifecycleTest = await readFile(lifecycleTestPath, 'utf8')

lifecycleTest = lifecycleTest.replace(
  `  it('keeps the editor and document session alive after native release failure', async () => {`,
  `  it('settles an active save inside the same release transaction', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-saving',
      displayName: 'saving.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }]}))

    let resolveSave!: () => void

    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve
    })

    harness.persistence.save.mockImplementation(() => pendingSave)

    const saving = harness.service.save(opened.sessionId)
    const releasing = harness.service.releaseCanvas(
      opened.sessionId,
      'discard',
    )

    expect(harness.persistence.close).not.toHaveBeenCalled()

    resolveSave()

    await saving

    await expect(releasing).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.persistence.close).toHaveBeenCalledWith(
      'native-document-saving',
    )
  })

  it('keeps the editor and document session alive after native release failure', async () => {`,
)

await writeFile(lifecycleTestPath, lifecycleTest, 'utf8')

let architectureCheck = await readFile(architectureCheckPath, 'utf8')

architectureCheck = replaceRequired(
  architectureCheck,
  `  'planApplicationClose: () => ApplicationClosePlan',`,
  `  'planApplicationClose: () => ApplicationClosePlan',
  'wait-for-save',`,
  'lifecycle forbidden protocol list',
)

architectureCheck = replaceRequired(
  architectureCheck,
  `if (documentService?.includes('planApplicationClose')) {
  violations.push(
    'Document service must not own a second application termination lifecycle',
  )
}

if (!workflow?.includes('CanvasCloseSnapshot')) {`,
  `const documentService = sources.find(
  ({ path }) =>
    path === 'editor/document/src/application/canvas/canvas-document-service.ts',
)?.source

if (documentService?.includes('planApplicationClose')) {
  violations.push(
    'Document service must not own a second application termination lifecycle',
  )
}

if (!documentService?.includes('while (owned.saveOperation)')) {
  violations.push(
    'Document release must settle its own save operation without workflow retries',
  )
}

if (!workflow?.includes('CanvasCloseSnapshot')) {`,
  'documentService architecture-check declaration order',
)

architectureCheck = replaceRequired(
  architectureCheck,
  `const documentService = sources.find(
  ({ path }) =>
    path === 'editor/document/src/application/canvas/canvas-document-service.ts',
)?.source

if (!documentService?.includes('CanvasReleaseFailureCode')) {`,
  `if (!documentService?.includes('CanvasReleaseFailureCode')) {`,
  'duplicate documentService declaration',
)

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log(
  'Unified document release transaction refactor written: wait-for-save protocol removed.',
)