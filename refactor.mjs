#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const documentServicePath =
  'editor/document/src/application/canvas-document-service.ts'

const workflowPath =
  'apps/desktop/src/application/canvas/canvas-workflow.ts'

const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

const [documentService, workflow] = await Promise.all([
  readFile(documentServicePath, 'utf8'),
  readFile(workflowPath, 'utf8'),
])

const sourceProblems = []

if (documentService.includes(`kind: 'wait-for-save'`)) {
  sourceProblems.push(
    'DocumentService still exposes the removed wait-for-save result.',
  )
}

if (!documentService.includes('while (owned.saveOperation)')) {
  sourceProblems.push(
    'DocumentService does not settle active saves inside releaseCanvas.',
  )
}

if (workflow.includes(`result.kind === 'wait-for-save'`)) {
  sourceProblems.push(
    'CanvasWorkflow still contains the removed release retry protocol.',
  )
}

if (!workflow.includes('wait-for-settlement')) {
  sourceProblems.push(
    'CanvasWorkflow does not contain the unified settlement lifecycle.',
  )
}

if (sourceProblems.length > 0) {
  throw new Error(
    [
      'Unified lifecycle refactor is incomplete:',
      ...sourceProblems.map((problem) => '- ' + problem),
    ].join('\n'),
  )
}

const architectureCheck = `#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import process from 'node:process'

const documentSessionPath =
  'editor/document/src/domain/document-session.ts'

const files = [
  'platforms/desktop-runtime/src/public-api.ts',
  'platforms/desktop-runtime/src/adapters/file/file-system.ts',
  'apps/desktop/src/application/canvas/canvas-workflow.ts',
  'apps/desktop/src/application/termination/application-termination-coordinator.ts',
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  'editor/document/src/application/canvas-document-service.ts',
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
  'planApplicationClose: () => ApplicationClosePlan',
]

const sources = await Promise.all(
  files.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })),
)

const documentSession = await readFile(documentSessionPath, 'utf8')

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

const workflow = sourceFor(
  'apps/desktop/src/application/canvas/canvas-workflow.ts',
)

const documentService = sourceFor(
  'editor/document/src/application/canvas-document-service.ts',
)

const termination = sourceFor(
  'apps/desktop/src/application/termination/application-termination-coordinator.ts',
)

const workspace = sourceFor(
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)

if (!workflow?.includes('CanvasCloseSnapshot')) {
  violations.push('Canvas lifecycle coordinator snapshot is missing')
}

if (!workflow?.includes('const closeOperations = new Map')) {
  violations.push(
    'Canvas lifecycle must store close operations per CanvasSessionId',
  )
}

if (!workflow?.includes('const closeStates = new Map')) {
  violations.push(
    'Canvas lifecycle must store close state per CanvasSessionId',
  )
}

if (workflow?.includes('let activeClose: Promise<void> | null')) {
  violations.push(
    'Global single canvas close transaction is forbidden',
  )
}

if (!workflow?.includes('wait-for-settlement')) {
  violations.push(
    'CanvasWorkflow must own one settlement phase for saves and releases',
  )
}

if (!workflow?.includes('documents.getLifecycleSnapshot()')) {
  violations.push(
    'CanvasWorkflow must own application close planning',
  )
}

if (workflow?.includes(\`result.kind === 'wait-for-save'\`)) {
  violations.push(
    'CanvasWorkflow must not retry a second release transaction after save',
  )
}

if (!workflow?.includes('cancelCanvasClose(sessionId)')) {
  violations.push(
    'Canvas close cancellation must target one CanvasSessionId',
  )
}

if (documentService?.includes('planApplicationClose')) {
  violations.push(
    'DocumentService must not own a second application termination lifecycle',
  )
}

if (!documentService?.includes('getLifecycleSnapshot')) {
  violations.push(
    'DocumentService must expose lifecycle facts without owning termination',
  )
}

if (documentService?.includes(\`kind: 'wait-for-save'\`)) {
  violations.push(
    'DocumentService must not expose a second-stage release result',
  )
}

if (!documentService?.includes('while (owned.saveOperation)')) {
  violations.push(
    'DocumentService must settle active saves inside releaseCanvas',
  )
}

if (!documentService?.includes('CanvasReleaseFailureCode')) {
  violations.push(
    'Document release failures must expose stable sanitized codes',
  )
}

if (!documentService?.includes('toCanvasReleaseFailure')) {
  violations.push(
    'Document release failures must classify native failures safely',
  )
}

if (!termination?.includes('waiting-for-settlement')) {
  violations.push(
    'Application termination must wait for lifecycle settlement',
  )
}

if (termination?.includes('waiting-for-saves')) {
  violations.push(
    'Application termination must not retain a save-only waiting state',
  )
}

if (workspace?.includes('../../application/canvas/')) {
  violations.push(
    'Workspace presentation must not import canvas application implementation',
  )
}

if (!workspace?.includes('WorkspaceCanvasCloseSnapshot')) {
  violations.push(
    'Workspace presentation must own a structural close UI contract',
  )
}

if (!documentSession.includes('phaseBeforeClosing')) {
  violations.push(
    'DocumentSession must retain its exact phase before native release',
  )
}

if (!documentSession.includes('phase = phaseBeforeClosing')) {
  violations.push(
    'DocumentSession must restore the exact pre-close phase on failure',
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
  'Architecture gate rebuilt with the correct document service path.',
)