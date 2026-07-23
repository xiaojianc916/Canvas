#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const documentServicePath =
  'editor/document/src/application/canvas-document-service.ts'

const documentPublicApiPath =
  'editor/document/src/public-api.ts'

const workflowPath =
  'apps/desktop/src/application/canvas/canvas-workflow.ts'

const workspacePath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

const lifecycleTestPath =
  'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts'

const workflowTestPath =
  'apps/desktop/src/application/canvas/canvas-workflow.test.ts'

const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

let documentService = await readFile(documentServicePath, 'utf8')

documentService = documentService.replace(
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
  `export type CanvasCloseIntent = 'normal' | 'discard'

export type CanvasReleaseFailureCode =
  | 'permission-denied'
  | 'persistence'
  | 'not-found'
  | 'platform'

export interface CanvasReleaseFailure {
  readonly code: CanvasReleaseFailureCode
  readonly recoverable: boolean
}

export type CanvasReleaseResult =
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
)

documentService = documentService.replace(
  `    } catch {
      owned.document.cancelClosing()
      emit()

      return { kind: 'release-failed' }
    }`,
  `    } catch (error) {
      owned.document.cancelClosing()
      emit()

      return {
        kind: 'release-failed',
        failure: toCanvasReleaseFailure(error),
      }
    }`,
)

documentService = documentService.replace(
  `  function planApplicationClose(): ApplicationClosePlan {`,
  `  function toCanvasReleaseFailure(error: unknown): CanvasReleaseFailure {
    if (
      typeof error === 'object' &&
      error !== null &&
      'details' in error &&
      typeof error.details === 'object' &&
      error.details !== null
    ) {
      const details = error.details as Record<string, unknown>
      const code = details['code']
      const recoverable = details['recoverable']

      if (
        (code === 'permission-denied' ||
          code === 'persistence' ||
          code === 'not-found' ||
          code === 'platform') &&
        typeof recoverable === 'boolean'
      ) {
        return {
          code,
          recoverable,
        }
      }
    }

    return {
      code: 'platform',
      recoverable: false,
    }
  }

  function planApplicationClose(): ApplicationClosePlan {`,
)

await writeFile(documentServicePath, documentService, 'utf8')

let documentPublicApi = await readFile(documentPublicApiPath, 'utf8')

documentPublicApi = documentPublicApi.replace(
  `  type CanvasCloseIntent,
  type CanvasReleaseResult,`,
  `  type CanvasCloseIntent,
  type CanvasReleaseFailure,
  type CanvasReleaseFailureCode,
  type CanvasReleaseResult,`,
)

await writeFile(documentPublicApiPath, documentPublicApi, 'utf8')

let workflow = await readFile(workflowPath, 'utf8')

workflow = workflow.replace(
  `  CanvasCloseIntent,
  CanvasDocumentService,`,
  `  CanvasCloseIntent,
  CanvasDocumentService,
  CanvasReleaseFailure,`,
)

workflow = workflow.replace(
  `  | {
      readonly state: 'release-failed'
      readonly intent: CanvasCloseIntent
    }`,
  `  | {
      readonly state: 'release-failed'
      readonly intent: CanvasCloseIntent
      readonly failure: CanvasReleaseFailure
    }`,
)

workflow = workflow.replace(
  `      case 'release-failed':
        setCloseState(sessionId, {
          state: 'release-failed',
          intent,
        })
        return`,
  `      case 'release-failed':
        setCloseState(sessionId, {
          state: 'release-failed',
          intent,
          failure: result.failure,
        })
        return`,
)

workflow = workflow.replace(
  `      case 'wait-for-save':
        setCloseState(sessionId, {
          state: 'release-failed',
          intent,
        })`,
  `      case 'wait-for-save':
        setCloseState(sessionId, {
          state: 'release-failed',
          intent,
          failure: {
            code: 'platform',
            recoverable: false,
          },
        })`,
)

await writeFile(workflowPath, workflow, 'utf8')

let workspace = await readFile(workspacePath, 'utf8')

workspace = workspace.replace(
  `  | {
      readonly state: 'release-failed'
      readonly intent: 'normal' | 'discard'
    }`,
  `  | {
      readonly state: 'release-failed'
      readonly intent: 'normal' | 'discard'
      readonly failure: {
        readonly code:
          | 'permission-denied'
          | 'persistence'
          | 'not-found'
          | 'platform'
        readonly recoverable: boolean
      }
    }`,
)

await writeFile(workspacePath, workspace, 'utf8')

let lifecycleTest = await readFile(lifecycleTestPath, 'utf8')

lifecycleTest = lifecycleTest.replace(
  `    harness.persistence.close.mockRejectedValue(
      new Error('native document_close rejected'),
    )

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'release-failed',
    })`,
  `    harness.persistence.close.mockRejectedValue(
      Object.assign(new Error('native document_close rejected'), {
        details: {
          code: 'permission-denied',
          recoverable: true,
        },
      }),
    )

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'release-failed',
      failure: {
        code: 'permission-denied',
        recoverable: true,
      },
    })`,
)

await writeFile(lifecycleTestPath, lifecycleTest, 'utf8')

let workflowTest = await readFile(workflowTestPath, 'utf8')

workflowTest = workflowTest.replaceAll(
  `{ kind: 'release-failed' }`,
  `{
        kind: 'release-failed',
        failure: {
          code: 'persistence',
          recoverable: true,
        },
      }`,
)

workflowTest = workflowTest.replaceAll(
  `          intent: 'discard',
        },`,
  `          intent: 'discard',
          failure: {
            code: 'persistence',
            recoverable: true,
          },
        },`,
)

await writeFile(workflowTestPath, workflowTest, 'utf8')

let architectureCheck = await readFile(architectureCheckPath, 'utf8')

architectureCheck = architectureCheck.replace(
  `if (!workflow?.includes('CanvasCloseSnapshot')) {
  violations.push('Canvas lifecycle coordinator snapshot is missing')
}`,
  `if (!workflow?.includes('CanvasCloseSnapshot')) {
  violations.push('Canvas lifecycle coordinator snapshot is missing')
}

const documentService = sources.find(
  ({ path }) =>
    path === 'editor/document/src/application/canvas-document-service.ts',
)?.source

if (!documentService?.includes('CanvasReleaseFailureCode')) {
  violations.push(
    'Document release failures must expose a stable, sanitized error code',
  )
}

if (!documentService?.includes('toCanvasReleaseFailure')) {
  violations.push(
    'Document release failures must classify IPC errors without exposing raw messages',
  )
}

if (!workflow?.includes('failure: result.failure')) {
  violations.push(
    'Canvas close state must preserve the classified release failure',
  )
}`,
)

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log('Canvas native-release failure classification refactor written.')