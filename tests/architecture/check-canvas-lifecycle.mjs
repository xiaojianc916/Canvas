#!/usr/bin/env node

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
    'Canvas lifecycle architecture check failed:\n' +
      violations.map((item) => '- ' + item).join('\n'),
  )

  process.exitCode = 1
} else {
  console.log('Canvas lifecycle architecture check passed.')
}
