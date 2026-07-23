#!/usr/bin/env node

import { readFile, rm, writeFile } from 'node:fs/promises'

const documentServicePath =
  'editor/document/src/application/canvas-document-service.ts'

const documentPublicApiPath =
  'editor/document/src/public-api.ts'

const workflowPath =
  'apps/desktop/src/application/canvas/canvas-workflow.ts'

const workspaceContainerPath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

const workspaceContractsPublicApiPath =
  'features/workspace/src/contracts/public-api.ts'

const obsoleteLifecycleContractPath =
  'features/workspace/src/contracts/canvas-lifecycle-contract.ts'

const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

function requireIndex(source, text, label) {
  const index = source.indexOf(text)

  if (index < 0) {
    throw new Error(`Cannot apply recovery: missing ${label}`)
  }

  return index
}

function removeBetween(source, startText, endText, label) {
  const start = requireIndex(source, startText, label + ' start')
  const end = source.indexOf(endText, start)

  if (end < 0) {
    throw new Error(`Cannot apply recovery: missing ${label} end`)
  }

  return source.slice(0, start) + source.slice(end + endText.length)
}

let documentService = await readFile(documentServicePath, 'utf8')

if (!documentService.includes('export type CanvasCloseState =')) {
  const marker = 'export type CanvasReleaseResult ='
  const index = requireIndex(
    documentService,
    marker,
    'CanvasReleaseResult insertion point',
  )

  const contract = `export type CanvasCloseState =
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

  documentService =
    documentService.slice(0, index) +
    contract +
    documentService.slice(index)
}

await writeFile(documentServicePath, documentService, 'utf8')

let documentPublicApi = await readFile(documentPublicApiPath, 'utf8')

if (!documentPublicApi.includes('type CanvasCloseSnapshot,')) {
  documentPublicApi = documentPublicApi.replace(
    '  type CanvasCloseIntent,\n',
    `  type CanvasCloseIntent,
  type CanvasCloseSnapshot,
  type CanvasCloseState,
`,
  )
}

await writeFile(documentPublicApiPath, documentPublicApi, 'utf8')

let workflow = await readFile(workflowPath, 'utf8')

const workflowBodyMarker =
  '/**\n * Application termination has exactly one asynchronous boundary:'

const workflowBodyIndex = requireIndex(
  workflow,
  workflowBodyMarker,
  'CanvasWorkflow body marker',
)

const workflowBody = workflow.slice(workflowBodyIndex)

const workflowImports = `import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type {
  CanvasCloseIntent,
  CanvasCloseSnapshot,
  CanvasCloseState,
  CanvasDocumentService,
  CanvasReleaseResult,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'

`

workflow = workflowImports + workflowBody
workflow = workflow.replaceAll(
  'intent as DocumentCanvasCloseIntent',
  'intent',
)
workflow = workflow.replaceAll(
  `'discard' as DocumentCanvasCloseIntent`,
  `'discard'`,
)

await writeFile(workflowPath, workflow, 'utf8')

let workspace = await readFile(workspaceContainerPath, 'utf8')

if (workspace.includes('export type WorkspaceCanvasCloseState =')) {
  workspace = removeBetween(
    workspace,
    'export type WorkspaceCanvasCloseState =',
    '}\n\nexport interface WorkspaceCanvasUIPort',
    'WorkspaceContainer duplicated close contract',
  ).replace(
    '\n\n\nexport interface WorkspaceUIPort',
    '\n\nexport interface WorkspaceUIPort',
  )
}

workspace = workspace.replace(
  /import type \{[^}]*\} from '@hybrid-canvas\/workspace\/contracts'/,
  `import type {
  CanvasSessionId,
  WorkbenchSessionStore,
  WorkbenchTabId,
  WorkspaceShellActions,
} from '@hybrid-canvas/workspace/contracts'`,
)

workspace = workspace.replace(
  /import type \{[^}]*\} from '@hybrid-canvas\/document'\\n?/,
  '',
)

const documentContractImport = `import type {
  CanvasCloseIntent,
  CanvasCloseSnapshot,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
`

workspace = documentContractImport + workspace

workspace = workspace.replaceAll(
  'WorkspaceCanvasCloseSnapshot',
  'CanvasCloseSnapshot',
)

workspace = workspace.replaceAll(
  `intent: 'normal' | 'discard'`,
  `intent: CanvasCloseIntent`,
)

workspace = workspace.replace(
  `  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/document').CanvasSessionSnapshot | null`,
  `  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null`,
)

await writeFile(workspaceContainerPath, workspace, 'utf8')

let workspaceContractsPublicApi = await readFile(
  workspaceContractsPublicApiPath,
  'utf8',
)

workspaceContractsPublicApi = workspaceContractsPublicApi.replace(
  `export type {
  CanvasCloseIntent,
  CanvasCloseSnapshot,
  CanvasCloseState,
  CanvasReleaseFailure,
  CanvasReleaseFailureCode,
} from './canvas-lifecycle-contract'

`,
  '',
)

await writeFile(
  workspaceContractsPublicApiPath,
  workspaceContractsPublicApi,
  'utf8',
)

await rm(obsoleteLifecycleContractPath, {
  force: true,
})

const architectureCheck = `#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import process from 'node:process'

const files = [
  'platforms/desktop-runtime/src/public-api.ts',
  'platforms/desktop-runtime/src/adapters/file/file-system.ts',
  'apps/desktop/src/application/canvas/canvas-workflow.ts',
  'apps/desktop/src/application/termination/application-termination-coordinator.ts',
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  'editor/document/src/application/canvas-document-service.ts',
  'editor/document/src/public-api.ts',
  'apps/desktop/src-tauri/src/ipc/mod.rs',
]

const forbidden = [
  'createDrawFileCommands',
  'DrawFileCommands',
  'createFileDialog',
  'FileDialog',
  'file_open',
  'file_save',
  'requestClose',
  'discardAndClose',
  'discardAllAndClose',
  'CanvasCloseDecision',
  'CanvasCloseRequestResult',
  'pendingCloseSessionId',
  'void documents.releaseCanvas',
  'wait-for-save',
  'wait-for-saves',
  'WorkspaceCanvasCloseState',
  'WorkspaceCanvasCloseSnapshot',
  'DocumentCanvasCloseIntent',
  'canvas-lifecycle-contract',
]

const sources = await Promise.all(
  files.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })),
)

const violations = []

for (const { path, source } of sources) {
  for (const token of forbidden) {
    if (source.includes(token)) {
      violations.push(path + ': forbidden legacy token ' + token)
    }
  }
}

function sourceFor(path) {
  return sources.find((entry) => entry.path === path)?.source
}

const documentService = sourceFor(
  'editor/document/src/application/canvas-document-service.ts',
)

const documentPublicApi = sourceFor(
  'editor/document/src/public-api.ts',
)

const workflow = sourceFor(
  'apps/desktop/src/application/canvas/canvas-workflow.ts',
)

const workspace = sourceFor(
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)

const termination = sourceFor(
  'apps/desktop/src/application/termination/application-termination-coordinator.ts',
)

if (!documentService?.includes('export type CanvasCloseState')) {
  violations.push(
    'Document service must be the only CanvasCloseState contract source',
  )
}

if (!documentService?.includes('export interface CanvasCloseSnapshot')) {
  violations.push(
    'Document service must be the only CanvasCloseSnapshot contract source',
  )
}

if (!documentPublicApi?.includes('type CanvasCloseState')) {
  violations.push(
    'Document public API must export CanvasCloseState',
  )
}

if (!documentPublicApi?.includes('type CanvasCloseSnapshot')) {
  violations.push(
    'Document public API must export CanvasCloseSnapshot',
  )
}

if (workflow?.includes('export type CanvasCloseState')) {
  violations.push(
    'CanvasWorkflow must not redefine CanvasCloseState',
  )
}

if (workflow?.includes('export interface CanvasCloseSnapshot')) {
  violations.push(
    'CanvasWorkflow must not redefine CanvasCloseSnapshot',
  )
}

if (!workflow?.includes('CanvasCloseSnapshot')) {
  violations.push(
    'CanvasWorkflow must consume the document-owned close snapshot contract',
  )
}

if (!workspace?.includes('CanvasCloseSnapshot')) {
  violations.push(
    'Workspace presentation must consume the document-owned close snapshot',
  )
}

if (!workflow?.includes('const closeOperations = new Map')) {
  violations.push(
    'Canvas close coordinator must track operations per CanvasSessionId',
  )
}

if (!workflow?.includes('const closeStates = new Map')) {
  violations.push(
    'Canvas close coordinator must track states per CanvasSessionId',
  )
}

if (workflow?.includes('let activeClose: Promise<void> | null')) {
  violations.push(
    'Global Canvas close transaction is forbidden',
  )
}

if (!workflow?.includes('wait-for-settlement')) {
  violations.push(
    'CanvasWorkflow must own unified save and release settlement',
  )
}

if (!documentService?.includes('while (owned.saveOperation)')) {
  violations.push(
    'Document release must settle its own active save operation',
  )
}

if (!termination?.includes('waiting-for-settlement')) {
  violations.push(
    'Application termination must wait for lifecycle settlement',
  )
}

if (violations.length > 0) {
  console.error(
    'Canvas lifecycle architecture check failed:\\n' +
      violations.map((item) => '- ' + item).join('\\n'),
  )

  process.exitCode = 1
} else {
  console.log('Canvas lifecycle architecture check passed.')
}
`

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log(
  'Canvas lifecycle imports rebuilt and duplicate workspace contracts deleted.',
)