#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import process from 'node:process'

const files = {
  documentService:
    'editor/document/src/application/canvas-document-service.ts',
  workflow:
    'apps/desktop/src/application/canvas/canvas-workflow.ts',
  workspace:
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  documentPublicApi: 'editor/document/src/public-api.ts',
}

const [
  documentService,
  workflow,
  workspace,
  documentPublicApi,
] = await Promise.all(
  Object.values(files).map((path) => readFile(path, 'utf8')),
)

const violations = []

const removedSymbols = [
  'CanvasCloseDecision',
  'CanvasCloseRequestResult',
  'requestClose',
  'discardAndClose',
  'discardAllAndClose',
  'pendingCloseSessionId',
]

for (const symbol of removedSymbols) {
  for (const [name, source] of Object.entries({
    documentService,
    workflow,
    workspace,
    documentPublicApi,
  })) {
    if (source.includes(symbol)) {
      violations.push(
        name + ': obsolete canvas-close API remains: ' + symbol,
      )
    }
  }
}

if (!documentService.includes('CanvasCloseIntent')) {
  violations.push('documentService: CanvasCloseIntent is required')
}

if (!documentService.includes('releaseCanvas')) {
  violations.push('documentService: releaseCanvas is required')
}

if (!workflow.includes('CanvasCloseSnapshot')) {
  violations.push('workflow: CanvasCloseSnapshot is required')
}

if (!workflow.includes('closeCanvas')) {
  violations.push('workflow: closeCanvas is required')
}

if (!workflow.includes('workspace.closeCanvas(sessionId)')) {
  violations.push(
    'workflow: workspace tab removal must be owned by the close transaction',
  )
}

if (!workspace.includes('getCloseSnapshot')) {
  violations.push(
    'workspace: UI must render close state from CanvasLifecycleCoordinator',
  )
}

if (workspace.includes('useState<CanvasSessionId')) {
  violations.push(
    'workspace: component-local canvas close state is forbidden',
  )
}

if (violations.length > 0) {
  console.error(
    'Canvas lifecycle architecture check failed:\n' +
      violations.map((item) => '- ' + item).join('\n'),
  )

  process.exitCode = 1
} else {
  console.log('Canvas lifecycle architecture check passed.')
}
