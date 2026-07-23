#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const workspacePath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

const workflowTestPath =
  'apps/desktop/src/application/canvas/canvas-workflow.test.ts'

const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

let workspace = await readFile(workspacePath, 'utf8')

workspace = workspace.replace(
  `export interface WorkspaceCanvasUIPort {
  readonly create: (title: string) => Promise<void>`,
  `export type WorkspaceCanvasCloseState =
  | { readonly state: 'confirmation-required' }
  | {
      readonly state: 'releasing'
      readonly intent: 'normal' | 'discard'
    }
  | {
      readonly state: 'release-failed'
      readonly intent: 'normal' | 'discard'
    }

export interface WorkspaceCanvasCloseSnapshot {
  readonly states: Readonly<
    Record<CanvasSessionId, WorkspaceCanvasCloseState>
  >
}

export interface WorkspaceCanvasUIPort {
  readonly create: (title: string) => Promise<void>`,
)

workspace = workspace.replace(
  `  readonly getCloseSnapshot: () => import('../../application/canvas/canvas-workflow').CanvasCloseSnapshot`,
  `  readonly getCloseSnapshot: () => WorkspaceCanvasCloseSnapshot`,
)

await writeFile(workspacePath, workspace, 'utf8')

let workflowTest = await readFile(workflowTestPath, 'utf8')

workflowTest = workflowTest.replace(
  `  it('retains discard intent for a failed native release retry', async () => {`,
  `  it('cancels only the selected canvas close state', async () => {
    const documents = createDocumentPort(async () => ({
      kind: 'confirmation-required',
    }))

    const workspace = createWorkspace()

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-a', 'normal')
    await workflow.closeCanvas('session-b', 'normal')

    workflow.cancelCanvasClose('session-a')

    expect(workflow.getCloseSnapshot()).toEqual({
      states: {
        'session-b': {
          state: 'confirmation-required',
        },
      },
    })

    expect(workspace.closeCanvas).not.toHaveBeenCalled()
  })

  it('retains discard intent for a failed native release retry', async () => {`,
)

await writeFile(workflowTestPath, workflowTest, 'utf8')

let architectureCheck = await readFile(architectureCheckPath, 'utf8')

architectureCheck = architectureCheck.replace(
  `if (!workflow?.includes('await documents.releaseCanvas')) {
  violations.push('Canvas lifecycle rollback must await native release')
}`,
  `if (!workflow?.includes('await documents.releaseCanvas')) {
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
}`,
)

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log('Canvas lifecycle UI contract and per-session architecture gate written.')