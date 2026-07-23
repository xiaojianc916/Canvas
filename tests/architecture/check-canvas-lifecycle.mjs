#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import process from 'node:process'

const documentSessionPath =
  'editor/document/src/domain/document-session.ts'

const files = [
  'platforms/desktop-runtime/src/public-api.ts',
  'platforms/desktop-runtime/src/adapters/file/file-system.ts',
  'apps/desktop/src/application/canvas/canvas-workflow.ts',
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

const workflow = sources.find(
  ({ path }) =>
    path === 'apps/desktop/src/application/canvas/canvas-workflow.ts',
)?.source

if (!workflow?.includes('CanvasCloseSnapshot')) {
  violations.push('Canvas lifecycle coordinator snapshot is missing')
}

if (!documentSession.includes('phaseBeforeClosing')) {
  violations.push(
    'DocumentSession must retain the phase that existed before closing',
  )
}

if (!documentSession.includes('phase = phaseBeforeClosing')) {
  violations.push(
    'DocumentSession close cancellation must restore the exact prior phase',
  )
}

if (documentSession.includes("phase = 'ready'\n    },\n\n    completeClosing")) {
  violations.push(
    'DocumentSession close cancellation must not unconditionally restore ready',
  )
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
}

if (!workflow?.includes('closeCanvas')) {
  violations.push('Canvas lifecycle coordinator entry point is missing')
}

if (!workflow?.includes('await documents.releaseCanvas')) {
  violations.push('Canvas lifecycle rollback must await native release')
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

if (!workflow?.includes('cancelCanvasClose(sessionId)')) {
  violations.push(
    'Canvas close cancellation must target one CanvasSessionId',
  )
}

const workspace = sources.find(
  ({ path }) =>
    path === 'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)?.source

if (workspace?.includes('../../application/canvas/')) {
  violations.push(
    'Workspace presentation must not import canvas application implementation',
  )
}

if (!workspace?.includes('WorkspaceCanvasCloseSnapshot')) {
  violations.push(
    'Workspace presentation must own a structural canvas close UI contract',
  )
}

if (violations.length > 0) {
  console.error(
    'Canvas legacy protocol removal check failed:\n' +
      violations.map((item) => '- ' + item).join('\n'),
  )

  process.exitCode = 1
} else {
  console.log('Canvas legacy protocol removal check passed.')
}
