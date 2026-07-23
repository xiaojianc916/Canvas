#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const lifecycleTestPath =
  'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts'
const workflowTestPath =
  'apps/desktop/src/application/canvas/canvas-workflow.test.ts'
const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'
const packagePath = 'package.json'

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

await write(
  lifecycleTestPath,
  `import type {
  EditorDocumentEvent,
  EditorSession,
} from '@hybrid-canvas/canvas/application'
import { createCanvasDocumentService } from '@hybrid-canvas/document'
import { serializeDrawDocument } from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

function snapshot(documentValue: unknown): TLEditorSnapshot {
  return {
    document: documentValue,
    session: {},
  } as unknown as TLEditorSnapshot
}

function createHarness() {
  let currentSnapshot = snapshot({ shapes: [] })

  const documentListeners = new Set<(event: EditorDocumentEvent) => void>()
  const closeEditorSession = vi.fn()

  const persistence = {
    open: vi.fn(),
    save: vi.fn(),
    saveAs: vi.fn(),
    close: vi.fn(),
  }

  const editor = {
    sessionId: 'editor-session',
    documentId: 'editor-document',

    captureDocument() {
      return currentSnapshot
    },

    getSnapshot() {
      return currentSnapshot
    },

    subscribeDocumentEvents(listener: (event: EditorDocumentEvent) => void) {
      documentListeners.add(listener)

      return () => {
        documentListeners.delete(listener)
      }
    },
  } as unknown as EditorSession

  const service = createCanvasDocumentService({
    editorSessions: {
      create: () => editor,
      close: closeEditorSession,
      dispose: vi.fn(),
    },
    persistence,
    extensions: [],
  })

  return {
    service,
    persistence,
    closeEditorSession,

    ready() {
      for (const listener of documentListeners) {
        listener({ kind: 'ready' })
      }
    },

    change(nextSnapshot: TLEditorSnapshot) {
      currentSnapshot = nextSnapshot

      for (const listener of documentListeners) {
        listener({ kind: 'changed' })
      }
    },
  }
}

describe('Canvas document native-release contract', () => {
  it('releases a clean unsaved canvas without invoking native document_close', async () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.persistence.close).not.toHaveBeenCalled()
    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
    expect(harness.service.getEditorSession(opened.sessionId)).toBeNull()
  })

  it('requires an explicit discard intent for dirty canvases', async () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }] }))

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'confirmation-required',
    })

    expect(harness.service.getEditorSession(opened.sessionId)).not.toBeNull()

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'discard'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
  })

  it('opens through the native gateway without exposing a filesystem path', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-opened',
      displayName: 'architecture.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    await expect(harness.service.open()).resolves.toEqual({
      canvasId: expect.any(String),
      sessionId: expect.any(String),
      title: 'architecture.draw',
    })
  })

  it('uses Save As once and retains only an opaque native document ID', async () => {
    const harness = createHarness()
    const opened = harness.service.create('未命名画布')

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }]}))

    harness.persistence.saveAs.mockResolvedValue({
      id: 'native-document-created',
      displayName: 'untitled.draw',
    })

    await harness.service.save(opened.sessionId)

    expect(harness.persistence.saveAs).toHaveBeenCalledWith(
      expect.any(String),
      {
        suggestedName: '未命名画布.draw',
      },
    )

    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })
  })

  it('uses native document_save for an opened native document', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-existing',
      displayName: 'existing.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }]}))

    await harness.service.save(opened.sessionId)

    expect(harness.persistence.save).toHaveBeenCalledWith(
      'native-document-existing',
      expect.any(String),
    )
  })

  it('keeps the editor and document session alive after native release failure', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-release-failure',
      displayName: 'failure.draw',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()

    harness.persistence.close.mockRejectedValue(
      new Error('native document_close rejected'),
    )

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'release-failed',
    })

    expect(harness.closeEditorSession).not.toHaveBeenCalled()
    expect(harness.service.getEditorSession(opened.sessionId)).not.toBeNull()
    expect(harness.service.getSessionSnapshot(opened.sessionId)).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })

    harness.persistence.close.mockResolvedValue(undefined)

    await expect(
      harness.service.releaseCanvas(opened.sessionId, 'normal'),
    ).resolves.toEqual({
      kind: 'released',
    })

    expect(harness.closeEditorSession).toHaveBeenCalledWith(opened.sessionId)
  })
})
`,
)

await write(
  workflowTestPath,
  `import type {
  CanvasDocumentService,
  CanvasReleaseResult,
} from '@hybrid-canvas/document'
import { describe, expect, it, vi } from 'vitest'

import { createCanvasWorkflow } from './canvas-workflow'

function createDocumentPort(results: readonly CanvasReleaseResult[]) {
  const queue = [...results]

  return {
    create: vi.fn(() => ({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'Canvas',
    })),
    open: vi.fn(),
    save: vi.fn(),
    releaseCanvas: vi.fn(async () => queue.shift() ?? { kind: 'not-found' }),
    planApplicationClose: vi.fn(() => ({ kind: 'close-now' as const })),
    getEditorSession: vi.fn(() => null),
    getSessionSnapshot: vi.fn(() => null),
    getVersion: vi.fn(() => 0),
    subscribe: vi.fn(() => () => {}),
    dispose: vi.fn(),
  } as unknown as CanvasDocumentService
}

describe('CanvasWorkflow close transaction', () => {
  it('removes the workspace canvas only after native release succeeds', async () => {
    const documents = createDocumentPort([{ kind: 'released' }])

    const workspace = {
      createCanvas: vi.fn(),
      closeCanvas: vi.fn(),
    }

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-1', 'normal')

    expect(documents.releaseCanvas).toHaveBeenCalledWith(
      'session-1',
      'normal',
    )

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-1')
    expect(workflow.getCloseSnapshot()).toEqual({ state: 'idle' })
  })

  it('publishes confirmation-required without removing the workspace tab', async () => {
    const documents = createDocumentPort([
      { kind: 'confirmation-required' },
    ])

    const workspace = {
      createCanvas: vi.fn(),
      closeCanvas: vi.fn(),
    }

    const workflow = createCanvasWorkflow(
      documents,
      workspace as never,
    )

    await workflow.closeCanvas('session-1', 'normal')

    expect(workspace.closeCanvas).not.toHaveBeenCalled()
    expect(workflow.getCloseSnapshot()).toEqual({
      state: 'confirmation-required',
      sessionId: 'session-1',
    })
  })

  it('retains the workspace tab and publishes retry state on release failure', async () => {
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

    await workflow.closeCanvas('session-1', 'normal')

    expect(workspace.closeCanvas).not.toHaveBeenCalled()
    expect(workflow.getCloseSnapshot()).toEqual({
      state: 'release-failed',
      sessionId: 'session-1',
    })

    await workflow.closeCanvas('session-1', 'normal')

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-1')
    expect(workflow.getCloseSnapshot()).toEqual({ state: 'idle' })
  })

  it('waits for an active save and reevaluates the same close intent', async () => {
    const saveOperation = Promise.resolve()

    const documents = createDocumentPort([
      {
        kind: 'wait-for-save',
        operation: saveOperation,
      },
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

    await workflow.closeCanvas('session-1', 'normal')

    expect(documents.releaseCanvas).toHaveBeenNthCalledWith(
      1,
      'session-1',
      'normal',
    )

    expect(documents.releaseCanvas).toHaveBeenNthCalledWith(
      2,
      'session-1',
      'normal',
    )

    expect(workspace.closeCanvas).toHaveBeenCalledWith('session-1')
  })
})
`,
)

await write(
  architectureCheckPath,
  `#!/usr/bin/env node

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
    'Canvas lifecycle architecture check failed:\\n' +
      violations.map((item) => '- ' + item).join('\\n'),
  )

  process.exitCode = 1
} else {
  console.log('Canvas lifecycle architecture check passed.')
}
`,
)

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))

packageJson.scripts['test:architecture'] =
  'node tests/architecture/check.mjs && node tests/architecture/check-import-graph.mjs && node tests/architecture/check-termination-ux.mjs && node tests/architecture/check-ui-architecture.mjs && node tests/architecture/check-window-surface.mjs && node tests/architecture/check-window-dragging.mjs && node tests/architecture/check-rust-async-boundaries.mjs && node tests/architecture/check-rust-logging.mjs && node tests/architecture/check-ipc-bindings.mjs && node tests/architecture/check-canvas-lifecycle.mjs'

await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

console.log('Canvas lifecycle refactor tests and architecture gate written.')