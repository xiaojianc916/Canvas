#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const workflowPath = 'apps/desktop/src/application/canvas/canvas-workflow.ts'
const workspacePath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'
const workflowTestPath =
  'apps/desktop/src/application/canvas/canvas-workflow.test.ts'
const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

let workflow = await readFile(workflowPath, 'utf8')

workflow = workflow.replace(
  `  | {
      readonly state: 'releasing'
      readonly sessionId: CanvasSessionId
    }
  | {
      readonly state: 'release-failed'
      readonly sessionId: CanvasSessionId
    }`,
  `  | {
      readonly state: 'releasing'
      readonly sessionId: CanvasSessionId
      readonly intent: CanvasCloseIntent
    }
  | {
      readonly state: 'release-failed'
      readonly sessionId: CanvasSessionId
      readonly intent: CanvasCloseIntent
    }`,
)

workflow = workflow.replace(
  `    setCloseSnapshot({
      state: 'releasing',
      sessionId,
    })`,
  `    setCloseSnapshot({
      state: 'releasing',
      sessionId,
      intent,
    })`,
)

workflow = workflow.replace(
  `    applyReleaseResult(sessionId, result)`,
  `    applyReleaseResult(sessionId, intent, result)`,
)

workflow = workflow.replace(
  `  function applyReleaseResult(
    sessionId: CanvasSessionId,
    result: CanvasReleaseResult,
  ): void {`,
  `  function applyReleaseResult(
    sessionId: CanvasSessionId,
    intent: CanvasCloseIntent,
    result: CanvasReleaseResult,
  ): void {`,
)

workflow = workflow.replace(
  `        setCloseSnapshot({
          state: 'release-failed',
          sessionId,
        })`,
  `        setCloseSnapshot({
          state: 'release-failed',
          sessionId,
          intent,
        })`,
)

await writeFile(workflowPath, workflow, 'utf8')

let workspace = await readFile(workspacePath, 'utf8')

workspace = workspace.replace(
  `                handleCloseCanvas(closeSnapshot.sessionId, 'normal')`,
  `                handleCloseCanvas(
                  closeSnapshot.sessionId,
                  closeSnapshot.intent,
                )`,
)

await writeFile(workspacePath, workspace, 'utf8')

let workflowTest = await readFile(workflowTestPath, 'utf8')

workflowTest = workflowTest.replace(
  `    expect(workflow.getCloseSnapshot()).toEqual({
      state: 'release-failed',
      sessionId: 'session-1',
    })`,
  `    expect(workflow.getCloseSnapshot()).toEqual({
      state: 'release-failed',
      sessionId: 'session-1',
      intent: 'normal',
    })`,
)

workflowTest = workflowTest.replace(
  `  it('waits for an active save and reevaluates the same close intent', async () => {`,
  `  it('preserves discard intent when native release fails and retries', async () => {
    const documents = createDocumentPort([
      { kind: 'release-failed' },
      { kind: 'released' },
    ])

    const workspace = {
      createCanvas: vi.fn(),
      closeCanvas: vi.fn(),
    }

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-1', 'discard')

    expect(workflow.getCloseSnapshot()).toEqual({
      state: 'release-failed',
      sessionId: 'session-1',
      intent: 'discard',
    })

    await workflow.closeCanvas('session-1', 'discard')

    expect(documents.releaseCanvas).toHaveBeenNthCalledWith(
      1,
      'session-1',
      'discard',
    )

    expect(documents.releaseCanvas).toHaveBeenNthCalledWith(
      2,
      'session-1',
      'discard',
    )

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-1')
  })

  it('waits for an active save and reevaluates the same close intent', async () => {`,
)

await writeFile(workflowTestPath, workflowTest, 'utf8')

let architectureCheck = await readFile(architectureCheckPath, 'utf8')

architectureCheck = architectureCheck.replace(
  `if (!workflow.includes('closeCanvas')) {
  violations.push('workflow: closeCanvas is required')
}`,
  `if (!workflow.includes('closeCanvas')) {
  violations.push('workflow: closeCanvas is required')
}

if (!workflow.includes("readonly intent: CanvasCloseIntent")) {
  violations.push(
    'workflow: release state must retain the original CanvasCloseIntent',
  )
}`,
)

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log('Canvas close retry intent preservation refactor written.')