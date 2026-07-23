#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const lifecycleContractPath =
  'features/workspace/src/contracts/canvas-lifecycle-contract.ts'

const workspaceContractsPublicApiPath =
  'features/workspace/src/contracts/public-api.ts'

const workflowPath =
  'apps/desktop/src/application/canvas/canvas-workflow.ts'

const workspaceContainerPath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

function replaceRequired(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`Cannot apply refactor: missing ${label}`)
  }

  return source.replace(oldText, newText)
}

const lifecycleContract = `import type { CanvasSessionId } from './workbench-contract'

export type CanvasCloseIntent = 'normal' | 'discard'

export type CanvasReleaseFailureCode =
  | 'permission-denied'
  | 'persistence'
  | 'not-found'
  | 'platform'

export interface CanvasReleaseFailure {
  readonly code: CanvasReleaseFailureCode
  readonly recoverable: boolean
}

export type CanvasCloseState =
  | {
      readonly state: 'confirmation-required'
    }
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
`

await writeFile(lifecycleContractPath, lifecycleContract, 'utf8')

let workspaceContractsPublicApi = await readFile(
  workspaceContractsPublicApiPath,
  'utf8',
)

workspaceContractsPublicApi = replaceRequired(
  workspaceContractsPublicApi,
  `export type {
  RegisteredCommand,`,
  `export type {
  CanvasCloseIntent,
  CanvasCloseSnapshot,
  CanvasCloseState,
  CanvasReleaseFailure,
  CanvasReleaseFailureCode,
} from './canvas-lifecycle-contract'

export type {
  RegisteredCommand,`,
  'workspace contracts lifecycle export insertion point',
)

await writeFile(
  workspaceContractsPublicApiPath,
  workspaceContractsPublicApi,
  'utf8',
)

let workflow = await readFile(workflowPath, 'utf8')

workflow = replaceRequired(
  workflow,
  `import type {
  CanvasCloseIntent,
  CanvasDocumentService,
  CanvasReleaseFailure,
  CanvasReleaseResult,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'`,
  `import type {
  CanvasCloseIntent as DocumentCanvasCloseIntent,
  CanvasDocumentService,
  CanvasReleaseResult,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type {
  CanvasCloseIntent,
  CanvasCloseSnapshot,
  CanvasCloseState,
  WorkbenchSessionStore,
} from '@hybrid-canvas/workspace/contracts'`,
  'CanvasWorkflow lifecycle contract imports',
)

workflow = replaceRequired(
  workflow,
  `export type CanvasCloseState =
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
 * Application termination has exactly one asynchronous boundary:`,
  `/**
 * Application termination has exactly one asynchronous boundary:`,
  'CanvasWorkflow duplicated lifecycle state contract',
)

workflow = workflow.replaceAll(
  `intent: CanvasCloseIntent`,
  `intent: CanvasCloseIntent`,
)

workflow = replaceRequired(
  workflow,
  `    const result = await documents.releaseCanvas(sessionId, intent)`,
  `    const result = await documents.releaseCanvas(
      sessionId,
      intent as DocumentCanvasCloseIntent,
    )`,
  'CanvasWorkflow document close intent boundary',
)

workflow = replaceRequired(
  workflow,
  `    const result = await documents.releaseCanvas(sessionId, 'discard')`,
  `    const result = await documents.releaseCanvas(
      sessionId,
      'discard' as DocumentCanvasCloseIntent,
    )`,
  'CanvasWorkflow rollback close intent boundary',
)

await writeFile(workflowPath, workflow, 'utf8')

let workspaceContainer = await readFile(workspaceContainerPath, 'utf8')

workspaceContainer = replaceRequired(
  workspaceContainer,
  `  CanvasSessionId,
  WorkbenchSessionStore,`,
  `  CanvasCloseIntent,
  CanvasCloseSnapshot,
  CanvasSessionId,
  WorkbenchSessionStore,`,
  'WorkspaceContainer lifecycle contract imports',
)

workspaceContainer = replaceRequired(
  workspaceContainer,
  `export type WorkspaceCanvasCloseState =
  | { readonly state: 'confirmation-required' }
  | {
      readonly state: 'releasing'
      readonly intent: 'normal' | 'discard'
    }
  | {
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
    }

export interface WorkspaceCanvasCloseSnapshot {
  readonly states: Readonly<
    Record<CanvasSessionId, WorkspaceCanvasCloseState>
  >
}

`,
  ``,
  'WorkspaceContainer duplicated lifecycle contracts',
)

workspaceContainer = replaceRequired(
  workspaceContainer,
  `    intent: 'normal' | 'discard',`,
  `    intent: CanvasCloseIntent,`,
  'WorkspaceCanvasUIPort close intent',
)

workspaceContainer = replaceRequired(
  workspaceContainer,
  `  readonly getCloseSnapshot: () => WorkspaceCanvasCloseSnapshot`,
  `  readonly getCloseSnapshot: () => CanvasCloseSnapshot`,
  'WorkspaceCanvasUIPort close snapshot',
)

workspaceContainer = replaceRequired(
  workspaceContainer,
  `(sessionId: CanvasSessionId, intent: 'normal' | 'discard' = 'normal') => {`,
  `(sessionId: CanvasSessionId, intent: CanvasCloseIntent = 'normal') => {`,
  'WorkspaceContainer close callback intent',
)

await writeFile(workspaceContainerPath, workspaceContainer, 'utf8')

let architectureCheck = await readFile(architectureCheckPath, 'utf8')

architectureCheck = replaceRequired(
  architectureCheck,
  `  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  'editor/document/src/application/canvas-document-service.ts',`,
  `  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  'features/workspace/src/contracts/canvas-lifecycle-contract.ts',
  'editor/document/src/application/canvas-document-service.ts',`,
  'architecture check lifecycle contract source',
)

architectureCheck = replaceRequired(
  architectureCheck,
  `const workspace = sourceFor(
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)`,
  `const workspace = sourceFor(
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)

const lifecycleContract = sourceFor(
  'features/workspace/src/contracts/canvas-lifecycle-contract.ts',
)`,
  'architecture check lifecycle contract lookup',
)

architectureCheck = replaceRequired(
  architectureCheck,
  `if (!workspace?.includes('WorkspaceCanvasCloseSnapshot')) {
  violations.push(
    'Workspace presentation must own a structural close UI contract',
  )
}`,
  `if (workspace?.includes('WorkspaceCanvasCloseState')) {
  violations.push(
    'Workspace presentation must not duplicate the canvas close state contract',
  )
}

if (workspace?.includes('WorkspaceCanvasCloseSnapshot')) {
  violations.push(
    'Workspace presentation must not duplicate the canvas close snapshot contract',
  )
}

if (!workspace?.includes('CanvasCloseSnapshot')) {
  violations.push(
    'Workspace presentation must consume the shared canvas close contract',
  )
}

if (!lifecycleContract?.includes('export type CanvasCloseState')) {
  violations.push(
    'Workspace contracts must own the single canvas close state definition',
  )
}

if (!lifecycleContract?.includes('export interface CanvasCloseSnapshot')) {
  violations.push(
    'Workspace contracts must own the single canvas close snapshot definition',
  )
}

if (!workflow?.includes('@hybrid-canvas/workspace/contracts')) {
  violations.push(
    'CanvasWorkflow must consume the shared workspace close lifecycle contract',
  )
}`,
  'architecture check duplicated presentation lifecycle contract',
)

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log(
  'Canvas close lifecycle contract centralized in workspace contracts.',
)