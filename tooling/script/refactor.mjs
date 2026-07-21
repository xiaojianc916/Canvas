#!/usr/bin/env node

/**
 * Architecture refactor:
 *
 *   features/canvas-session
 *     -> editor/document
 *
 * Main goals:
 * - Document lifecycle belongs to the editor subsystem, not product features.
 * - editor/document must not depend on features/workspace.
 * - apps/desktop owns cross-module orchestration.
 * - TLStore remains the only persisted canvas model.
 * - No compatibility wrapper or parallel implementation is retained.
 *
 * Requirements:
 * - Run from repository root.
 * - Run on a non-main branch.
 * - Working tree must be clean.
 * - Node.js >= 24.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { execFileSync, execSync } from 'node:child_process'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const allowMain = args.has('--allow-main')
const allowDirty = args.has('--allow-dirty')
const skipVerify = args.has('--skip-verify')

const oldPackageDirectory = join(root, 'features/canvas-session')
const newPackageDirectory = join(root, 'editor/document')

main()

function main() {
  preflight()

  console.log('1/9 Moving canvas-session to editor/document...')
  movePackage()

  console.log('2/9 Rebuilding the document lifecycle package...')
  writeDocumentPackage()

  console.log('3/9 Adding desktop application orchestration...')
  writeCanvasWorkflow()

  console.log('4/9 Updating the desktop composition root...')
  writeApplicationCompositionRoot()

  console.log('5/9 Updating application close coordination...')
  writeTerminationCoordinator()

  console.log('6/9 Updating imports and package dependencies...')
  updateRepositoryReferences()

  console.log('7/9 Strengthening architecture enforcement...')
  updateArchitectureChecks()

  console.log('8/9 Recording the architecture decision...')
  writeArchitectureDecision()

  console.log('9/9 Updating lockfile and validating...')
  if (!skipVerify) {
    verify()
  }

  printSummary()
}

function preflight() {
  requirePath('package.json')
  requirePath('pnpm-workspace.yaml')
  requirePath('apps/desktop/package.json')
  requirePath('tests/architecture/check.mjs')
  requirePath('AGENTS.md')

  if (!existsSync(oldPackageDirectory)) {
    if (existsSync(newPackageDirectory)) {
      fail('editor/document already exists. The refactor may already have been applied.')
    }

    fail('features/canvas-session does not exist.')
  }

  if (existsSync(newPackageDirectory)) {
    fail('editor/document already exists; refusing to overwrite it.')
  }

  const branch = git(['branch', '--show-current']).trim()

  if (!branch) {
    fail('Detached HEAD is not supported.')
  }

  if (!allowMain && ['main', 'master'].includes(branch)) {
    fail(
      [
        `Refusing to modify branch "${branch}".`,
        'Create a refactor branch first, or explicitly pass --allow-main.',
      ].join('\n'),
    )
  }

  const status = git(['status', '--porcelain'])

  if (!allowDirty && status.trim()) {
    fail(
      [
        'Working tree is not clean.',
        'Commit or stash existing changes, or explicitly pass --allow-dirty.',
      ].join('\n'),
    )
  }

  const major = Number.parseInt(process.versions.node.split('.')[0], 10)

  if (major < 24) {
    fail(`Node.js 24 or newer is required; current version is ${process.version}.`)
  }
}

function movePackage() {
  mkdirSync(dirname(newPackageDirectory), { recursive: true })
  git(['mv', 'features/canvas-session', 'editor/document'])
}

function writeDocumentPackage() {
  writeJson('editor/document/package.json', {
    name: '@hybrid-canvas/document',
    version: '0.1.0',
    private: true,
    type: 'module',
    sideEffects: false,
    exports: {
      '.': {
        types: './src/public-api.ts',
        default: './src/public-api.ts',
      },
    },
    scripts: {
      build: 'tsc --project tsconfig.json --noEmit',
      check: 'tsc --project tsconfig.json --noEmit',
      typecheck: 'tsc --project tsconfig.json --noEmit',
      test: 'vitest run',
      clean: 'rimraf .turbo *.tsbuildinfo',
    },
    dependencies: {
      '@hybrid-canvas/canvas': 'workspace:*',
      '@hybrid-canvas/file': 'workspace:*',
      tldraw: 'catalog:',
    },
    devDependencies: {
      typescript: 'catalog:',
      vitest: 'catalog:',
    },
  })

  writeJson('editor/document/tsconfig.json', {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      tsBuildInfoFile: './node_modules/.cache/typescript/document.tsbuildinfo',
      paths: {
        '@hybrid-canvas/canvas': ['../core/src/public-api.ts'],
        '@hybrid-canvas/canvas/application': ['../core/src/application/public-api.ts'],
        '@hybrid-canvas/canvas/extensions': ['../core/src/extensions-public-api.ts'],
        '@hybrid-canvas/file': ['../persistence/src/public-api.ts'],
      },
    },
    include: ['src/**/*.ts'],
  })

  rmIfExists('editor/document/src/application/canvas-session-service.ts')

  writeText(
    'editor/document/src/application/canvas-document-service.ts',
    String.raw`import type {
  EditorSession,
  EditorSessionRegistry,
} from '@hybrid-canvas/canvas/application'
import type { HybridCanvasExtension } from '@hybrid-canvas/canvas/extensions'
import {
  parseDrawDocument,
  serializeDrawDocument,
} from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'

export type CanvasId = string
export type CanvasSessionId = string

export type CanvasPersistenceState =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'failed'

export interface OpenedCanvasSession {
  readonly canvasId: CanvasId
  readonly sessionId: CanvasSessionId
  readonly title: string
}

export interface CanvasSessionSnapshot {
  readonly sessionId: CanvasSessionId
  readonly persistence: CanvasPersistenceState
}

export type CanvasCloseDecision =
  | { readonly kind: 'close-now' }
  | {
      readonly kind: 'confirm-discard'
      readonly persistence: 'dirty' | 'failed'
    }
  | {
      readonly kind: 'wait-for-save'
      readonly operation: Promise<void>
    }
  | { readonly kind: 'not-found' }

export type ApplicationClosePlan =
  | { readonly kind: 'close-now' }
  | {
      readonly kind: 'confirm-discard'
      readonly sessionIds: readonly CanvasSessionId[]
    }
  | {
      readonly kind: 'wait-for-saves'
      readonly operations: readonly Promise<void>[]
    }

export interface CanvasDocumentService {
  readonly create: (title: string) => OpenedCanvasSession
  readonly open: () => Promise<OpenedCanvasSession | null>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (
    sessionId: CanvasSessionId,
  ) => CanvasCloseDecision
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly getEditorSession: (
    sessionId: CanvasSessionId,
  ) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void
}

export interface CanvasEditorSessionRegistryPort {
  readonly create: EditorSessionRegistry['create']
  readonly close: EditorSessionRegistry['close']
  readonly dispose: EditorSessionRegistry['dispose']
}

export interface DrawPersistencePort {
  readonly read: (path: string) => Promise<string>
  readonly write: (path: string, content: string) => Promise<void>
}

export interface CanvasFileSelectionPort {
  readonly selectOpenPath: () => Promise<string | null>
  readonly selectSavePath: (
    suggestedName: string,
  ) => Promise<string | null>
}

export interface CreateCanvasDocumentServiceDependencies {
  readonly editorSessions: CanvasEditorSessionRegistryPort
  readonly persistence: DrawPersistencePort
  readonly fileSelection: CanvasFileSelectionPort
  readonly extensions: readonly HybridCanvasExtension[]
}

type CanvasSessionState =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'failed'
  | 'closing'
  | 'closed'

interface OwnedCanvasSession {
  readonly editor: EditorSession
  stopObserving: () => void
  filePath: string | null
  revision: number
  savedRevision: number
  state: CanvasSessionState
  saveOperation: Promise<void> | null
}

const ALLOWED_TRANSITIONS: Readonly<
  Record<CanvasSessionState, readonly CanvasSessionState[]>
> = {
  clean: ['dirty', 'saving', 'closing'],
  dirty: ['saving', 'closing'],
  saving: ['clean', 'dirty', 'failed'],
  failed: ['dirty', 'saving', 'closing'],
  closing: ['closed'],
  closed: [],
}

export function createCanvasDocumentService({
  editorSessions,
  persistence,
  fileSelection,
  extensions,
}: CreateCanvasDocumentServiceDependencies): CanvasDocumentService {
  const sessions = new Map<CanvasSessionId, OwnedCanvasSession>()
  const listeners = new Set<() => void>()

  function emit(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  function create(title: string): OpenedCanvasSession {
    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      extensions,
    })

    sessions.set(
      sessionId,
      createOwnedSession(editor, null, 'dirty'),
    )

    return {
      canvasId,
      sessionId,
      title,
    }
  }

  async function open(): Promise<OpenedCanvasSession | null> {
    const filePath = await fileSelection.selectOpenPath()

    if (!filePath) {
      return null
    }

    const content = await persistence.read(filePath)
    const initialSnapshot = parseEditorSnapshot(content)
    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      initialSnapshot,
      extensions,
    })

    sessions.set(
      sessionId,
      createOwnedSession(editor, filePath, 'clean'),
    )

    return {
      canvasId,
      sessionId,
      title: getFileTitle(filePath),
    }
  }

  function save(sessionId: CanvasSessionId): Promise<void> {
    const session = requireSession(sessionId)

    if (session.saveOperation) {
      return session.saveOperation
    }

    const operation = performSave(session).finally(() => {
      session.saveOperation = null
    })

    session.saveOperation = operation
    return operation
  }

  async function performSave(
    session: OwnedCanvasSession,
  ): Promise<void> {
    const filePath =
      session.filePath ??
      (await fileSelection.selectSavePath('未命名画板.draw'))

    if (!filePath) {
      return
    }

    const capturedRevision = session.revision
    transition(session, 'saving')
    emit()

    try {
      const snapshot = session.editor.getSnapshot()
      const content = serializeDrawDocument(snapshot)

      await persistence.write(filePath, content)

      session.filePath = filePath
      session.savedRevision = capturedRevision

      transition(
        session,
        session.revision === capturedRevision
          ? 'clean'
          : 'dirty',
      )
      emit()
    } catch (error) {
      transition(session, 'failed')
      emit()
      throw error
    }
  }

  function requestClose(
    sessionId: CanvasSessionId,
  ): CanvasCloseDecision {
    const session = sessions.get(sessionId)

    if (!session) {
      return { kind: 'not-found' }
    }

    if (session.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: session.saveOperation,
      }
    }

    if (
      session.state === 'dirty' ||
      session.state === 'failed'
    ) {
      return {
        kind: 'confirm-discard',
        persistence: session.state,
      }
    }

    closeNow(sessionId, session)
    return { kind: 'close-now' }
  }

  function discardAndClose(
    sessionId: CanvasSessionId,
  ): void {
    const session = requireSession(sessionId)

    if (session.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    closeNow(sessionId, session)
  }

  function closeNow(
    sessionId: CanvasSessionId,
    session: OwnedCanvasSession,
  ): void {
    transition(session, 'closing')
    transition(session, 'closed')
    release(sessionId)
    emit()
  }

  function release(sessionId: CanvasSessionId): void {
    const session = sessions.get(sessionId)

    session?.stopObserving()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
  }

  function planApplicationClose(): ApplicationClosePlan {
    const operations: Promise<void>[] = []
    const sessionIds: CanvasSessionId[] = []

    for (const [sessionId, session] of sessions) {
      if (session.saveOperation) {
        operations.push(session.saveOperation)
      } else if (
        session.state === 'dirty' ||
        session.state === 'failed'
      ) {
        sessionIds.push(sessionId)
      }
    }

    if (operations.length > 0) {
      return {
        kind: 'wait-for-saves',
        operations,
      }
    }

    if (sessionIds.length > 0) {
      return {
        kind: 'confirm-discard',
        sessionIds,
      }
    }

    return { kind: 'close-now' }
  }

  function createOwnedSession(
    editor: EditorSession,
    filePath: string | null,
    initialState: 'clean' | 'dirty',
  ): OwnedCanvasSession {
    const session: OwnedCanvasSession = {
      editor,
      filePath,
      revision: 0,
      savedRevision: initialState === 'clean' ? 0 : -1,
      state: initialState,
      saveOperation: null,
      stopObserving: () => {},
    }

    session.stopObserving =
      editor.onUserDocumentChange(() => {
        if (
          session.state === 'closing' ||
          session.state === 'closed'
        ) {
          return
        }

        session.revision += 1

        if (
          session.state !== 'saving' &&
          session.state !== 'dirty'
        ) {
          transition(session, 'dirty')
          emit()
        }
      })

    return session
  }

  function requireSession(
    sessionId: CanvasSessionId,
  ): OwnedCanvasSession {
    const session = sessions.get(sessionId)

    if (!session) {
      throw new Error('CANVAS_SESSION_NOT_FOUND')
    }

    return session
  }

  return {
    create,
    open,
    save,
    requestClose,
    discardAndClose,
    planApplicationClose,

    getEditorSession(sessionId) {
      return sessions.get(sessionId)?.editor ?? null
    },

    getSessionSnapshot(sessionId) {
      const session = sessions.get(sessionId)

      if (!session) {
        return null
      }

      return {
        sessionId,
        persistence: toPersistenceState(session.state),
      }
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose() {
      for (const session of sessions.values()) {
        session.stopObserving()
      }

      sessions.clear()
      editorSessions.dispose()
    },
  }
}

function transition(
  session: OwnedCanvasSession,
  nextState: CanvasSessionState,
): void {
  if (session.state === nextState) {
    return
  }

  if (!ALLOWED_TRANSITIONS[session.state].includes(nextState)) {
    throw new Error(
      'CANVAS_SESSION_INVALID_TRANSITION:' +
        session.state +
        '->' +
        nextState,
    )
  }

  session.state = nextState
}

function toPersistenceState(
  state: CanvasSessionState,
): CanvasPersistenceState {
  switch (state) {
    case 'clean':
    case 'dirty':
    case 'saving':
    case 'failed':
      return state

    case 'closing':
    case 'closed':
      return 'clean'
  }
}

function parseEditorSnapshot(
  json: string,
): TLEditorSnapshot {
  try {
    return parseDrawDocument(json).content
  } catch (containerError) {
    try {
      const parsed: unknown = JSON.parse(json)

      if (isEditorSnapshot(parsed)) {
        return parsed
      }
    } catch {
      // Keep the validated container error as the public failure.
    }

    throw containerError
  }
}

function isEditorSnapshot(
  value: unknown,
): value is TLEditorSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'document' in value &&
    'session' in value
  )
}

function getFileTitle(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const fileName =
    normalized.slice(normalized.lastIndexOf('/') + 1)

  return fileName.toLowerCase().endsWith('.draw')
    ? fileName.slice(0, -5)
    : fileName
}
`,
  )

  writeText(
    'editor/document/src/public-api.ts',
    String.raw`export {
  type ApplicationClosePlan,
  type CanvasCloseDecision,
  type CanvasDocumentService,
  type CanvasEditorSessionRegistryPort,
  type CanvasFileSelectionPort,
  type CanvasId,
  type CanvasPersistenceState,
  type CanvasSessionId,
  type CanvasSessionSnapshot,
  type CreateCanvasDocumentServiceDependencies,
  type DrawPersistencePort,
  type OpenedCanvasSession,
  createCanvasDocumentService,
} from './application/canvas-document-service'
`,
  )
}

function writeCanvasWorkflow() {
  writeText(
    'apps/desktop/src/application/canvas/canvas-workflow.ts',
    String.raw`import type {
  ApplicationClosePlan,
  CanvasCloseDecision,
  CanvasDocumentService,
  CanvasSessionId,
  CanvasSessionSnapshot,
} from '@hybrid-canvas/document'
import type { EditorSession } from '@hybrid-canvas/canvas/application'
import type {
  WorkbenchSessionStore,
} from '@hybrid-canvas/workspace/contracts'

export interface CanvasWorkflow {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (
    sessionId: CanvasSessionId,
  ) => Promise<void>
  readonly requestClose: (
    sessionId: CanvasSessionId,
  ) => CanvasCloseDecision
  readonly discardAndClose: (
    sessionId: CanvasSessionId,
  ) => void
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly discardAllAndClose: (
    sessionIds: readonly CanvasSessionId[],
  ) => void
  readonly getEditorSession: (
    sessionId: CanvasSessionId,
  ) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null
  readonly subscribe: (
    listener: () => void,
  ) => () => void
  readonly dispose: () => void
}

export function createCanvasWorkflow(
  documents: CanvasDocumentService,
  workspace: WorkbenchSessionStore,
): CanvasWorkflow {
  function create(title: string): void {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      documents.discardAndClose(opened.sessionId)
      throw error
    }
  }

  async function open(): Promise<void> {
    const opened = await documents.open()

    if (!opened) {
      return
    }

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      documents.discardAndClose(opened.sessionId)
      throw error
    }
  }

  function requestClose(
    sessionId: CanvasSessionId,
  ): CanvasCloseDecision {
    const decision = documents.requestClose(sessionId)

    if (decision.kind === 'close-now') {
      workspace.closeCanvas(sessionId)
    }

    return decision
  }

  function discardAndClose(
    sessionId: CanvasSessionId,
  ): void {
    documents.discardAndClose(sessionId)
    workspace.closeCanvas(sessionId)
  }

  function discardAllAndClose(
    sessionIds: readonly CanvasSessionId[],
  ): void {
    for (const sessionId of sessionIds) {
      discardAndClose(sessionId)
    }
  }

  return {
    create,
    open,
    save: documents.save,
    requestClose,
    discardAndClose,
    planApplicationClose: documents.planApplicationClose,
    discardAllAndClose,
    getEditorSession: documents.getEditorSession,
    getSessionSnapshot: documents.getSessionSnapshot,
    subscribe: documents.subscribe,
    dispose: documents.dispose,
  }
}
`,
  )
}

function writeApplicationCompositionRoot() {
  writeText(
    'apps/desktop/src/bootstrap/application.ts',
    String.raw`import {
  createEditorSessionRegistry,
} from '@hybrid-canvas/canvas/application'
import {
  createCanvasDocumentService,
} from '@hybrid-canvas/document'
import { flowchartExtension } from '@hybrid-canvas/flowchart'
import {
  createDrawFileCommands,
  createFileDialog,
  createMainWindowController,
  type MainWindowController,
} from '@hybrid-canvas/platforms-desktop-runtime'
import {
  type CommandRegistry,
  createCommandRegistry,
  createWorkbenchSessionController,
  type WorkbenchSessionStore,
} from '@hybrid-canvas/workspace/contracts'

import {
  createApplicationTerminationCoordinator,
  type ApplicationTerminationCoordinator,
} from '../application/termination/application-termination-coordinator'
import {
  createCanvasWorkflow,
  type CanvasWorkflow,
} from '../application/canvas/canvas-workflow'

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: CanvasWorkflow
  readonly termination: ApplicationTerminationCoordinator
  readonly mainWindow: MainWindowController
  readonly dispose: () => void
}

export function createApplicationRuntime(): ApplicationRuntime {
  const workspace = createWorkbenchSessionController()
  const commands = createCommandRegistry()
  const drawFiles = createDrawFileCommands()
  const dialog = createFileDialog()
  const mainWindow = createMainWindowController()
  const editorSessions = createEditorSessionRegistry()

  const documents = createCanvasDocumentService({
    editorSessions,
    persistence: {
      read: drawFiles.readDraw,
      write: drawFiles.saveDraw,
    },
    fileSelection: {
      async selectOpenPath() {
        const [path] = await dialog.open({
          filters: [
            {
              name: 'Hybrid Canvas 画布',
              extensions: ['draw'],
            },
          ],
        })

        return path ?? null
      },

      selectSavePath(suggestedName) {
        return dialog.save({
          filters: [
            {
              name: 'Hybrid Canvas 画布',
              extensions: ['draw'],
            },
          ],
          defaultPath: suggestedName,
        })
      },
    },
    extensions: [flowchartExtension],
  })

  const canvases = createCanvasWorkflow(
    documents,
    workspace,
  )

  const termination =
    createApplicationTerminationCoordinator(canvases, {
      terminate: () => mainWindow.forceClose(),
    })

  return {
    workspace,
    commands,
    canvases,
    termination,
    mainWindow,

    dispose() {
      termination.dispose()
      canvases.dispose()
    },
  }
}
`,
  )
}

function writeTerminationCoordinator() {
  writeText(
    'apps/desktop/src/application/termination/application-termination-coordinator.ts',
    String.raw`import type {
  ApplicationClosePlan,
  CanvasSessionId,
} from '@hybrid-canvas/document'

export type ApplicationTerminationIntent =
  | 'window-close'
  | 'update-restart'
  | 'application-exit'

export type ApplicationTerminationSnapshot =
  | { readonly state: 'idle' }
  | {
      readonly state: 'confirmation-required'
      readonly intent: ApplicationTerminationIntent
      readonly sessionIds: readonly CanvasSessionId[]
    }
  | {
      readonly state: 'waiting-for-saves'
      readonly intent: ApplicationTerminationIntent
    }
  | {
      readonly state: 'terminating'
      readonly intent: ApplicationTerminationIntent
    }

export interface ApplicationTerminator {
  readonly terminate: (
    intent: ApplicationTerminationIntent,
  ) => Promise<void>
}

export interface ApplicationClosePort {
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly discardAllAndClose: (
    sessionIds: readonly CanvasSessionId[],
  ) => void
}

export interface ApplicationTerminationCoordinator {
  readonly request: (
    intent: ApplicationTerminationIntent,
  ) => void
  readonly cancel: () => void
  readonly confirmDiscard: () => void
  readonly getSnapshot:
    () => ApplicationTerminationSnapshot
  readonly subscribe: (
    listener: () => void,
  ) => () => void
  readonly dispose: () => void
}

export function createApplicationTerminationCoordinator(
  canvases: ApplicationClosePort,
  terminator: ApplicationTerminator,
): ApplicationTerminationCoordinator {
  let snapshot: ApplicationTerminationSnapshot = {
    state: 'idle',
  }

  let generation = 0
  let disposed = false
  const listeners = new Set<() => void>()

  function emit(
    next: ApplicationTerminationSnapshot,
  ): void {
    snapshot = next

    for (const listener of listeners) {
      listener()
    }
  }

  function request(
    intent: ApplicationTerminationIntent,
  ): void {
    if (
      disposed ||
      snapshot.state === 'terminating'
    ) {
      return
    }

    evaluate(
      intent,
      canvases.planApplicationClose(),
    )
  }

  function evaluate(
    intent: ApplicationTerminationIntent,
    plan: ApplicationClosePlan,
  ): void {
    if (plan.kind === 'close-now') {
      emit({
        state: 'terminating',
        intent,
      })

      void terminator.terminate(intent)
      return
    }

    if (plan.kind === 'confirm-discard') {
      emit({
        state: 'confirmation-required',
        intent,
        sessionIds: plan.sessionIds,
      })

      return
    }

    const currentGeneration = ++generation

    emit({
      state: 'waiting-for-saves',
      intent,
    })

    void Promise.allSettled(plan.operations).then(() => {
      if (
        !disposed &&
        currentGeneration === generation
      ) {
        request(intent)
      }
    })
  }

  return {
    request,

    cancel() {
      generation += 1
      emit({ state: 'idle' })
    },

    confirmDiscard() {
      if (
        snapshot.state !==
        'confirmation-required'
      ) {
        return
      }

      const { intent, sessionIds } = snapshot

      canvases.discardAllAndClose(sessionIds)
      request(intent)
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose() {
      disposed = true
      generation += 1
      listeners.clear()
    },
  }
}
`,
  )
}

function updateRepositoryReferences() {
  replaceInTextFiles(
    ['apps', 'editor', 'features', 'foundations', 'platforms', 'tests', 'tooling', 'docs'],
    '@hybrid-canvas/document',
    '@hybrid-canvas/document',
  )

  replaceInTextFiles(
    ['apps', 'editor', 'features', 'tests', 'docs'],
    'features/canvas-session',
    'editor/document',
  )

  updateJson('apps/desktop/package.json', (pkg) => {
    pkg.dependencies ??= {}

    delete pkg.dependencies['@hybrid-canvas/document']
    pkg.dependencies['@hybrid-canvas/document'] = 'workspace:*'

    pkg.dependencies = sortObject(pkg.dependencies)
    return pkg
  })

  updateJson('architecture.scaffolds.json', (manifest) => {
    manifest.version = 2

    manifest.policy = {
      purpose:
        'Reserved scaffolds are allowed only when ownership, activation and removal rules are explicit.',
      requiredFields: [
        'path',
        'stage',
        'role',
        'owner',
        'activationCondition',
        'removalCondition',
        'allowedDependencies',
        'forbiddenDependencies',
      ],
    }

    manifest.scaffolds = manifest.scaffolds.map((scaffold) => ({
      owner: inferScaffoldOwner(scaffold.path),
      removalCondition:
        'Remove the scaffold if the activation condition is not expected within two release milestones.',
      allowedDependencies: inferAllowedDependencies(scaffold.path),
      ...scaffold,
    }))

    return manifest
  })

  const appShellPath = 'apps/desktop/src/presentation/AppShell.tsx'
  replaceInFile(
    appShellPath,
    "import type { CanvasService } from '@hybrid-canvas/document'",
    "import type { CanvasWorkflow } from '../application/canvas/canvas-workflow'",
  )
  replaceInFile(
    appShellPath,
    'readonly canvases: CanvasService',
    'readonly canvases: CanvasWorkflow',
  )

  const workspaceContainerPath = 'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

  replaceInFile(
    workspaceContainerPath,
    "import('@hybrid-canvas/document').CanvasCloseDecision",
    "import('@hybrid-canvas/document').CanvasCloseDecision",
  )

  updateAgentsDocument()
}

function updateArchitectureChecks() {
  const path = 'tests/architecture/check.mjs'
  let text = readText(path)

  text = text.replaceAll('features/canvas-session/', 'editor/document/')

  text = text.replace(
    String.raw`(?:asset|canvas|desktop(?:-ipc)?|file|flowchart`,
    String.raw`(?:asset|canvas|document|desktop(?:-ipc)?|file|flowchart`,
  )

  text = text.replace(
    String.raw`'editor/': '(?:asset|canvas|file|plugin)'`,
    String.raw`'editor/': '(?:asset|canvas|document|file|plugin)'`,
  )

  const marker = 'function validateScaffoldManifest() {'

  if (!text.includes(marker)) {
    fail('Could not locate validateScaffoldManifest in architecture checker.')
  }

  text = text.replace(
    marker,
    String.raw`function validateActiveArchitecture() {
  const documentPackage = join(root, 'editor/document/package.json')
  try {
    const manifest = JSON.parse(readFileSync(documentPackage, 'utf8'))
    if (manifest.name !== '@hybrid-canvas/document') {
      violations.push(
        'editor/document must be published internally as @hybrid-canvas/document',
      )
    }
    if (manifest.dependencies?.['@hybrid-canvas/workspace']) {
      violations.push(
        'editor/document must not depend on product workspace',
      )
    }
  } catch {
    violations.push(
      'editor/document/package.json is missing or invalid',
    )
  }
}

validateActiveArchitecture()

${marker}`,
  )

  text = text.replace(
    'if (scaffoldManifest.version !== 1 || !Array.isArray(scaffoldManifest.scaffolds)) {',
    'if (![1, 2].includes(scaffoldManifest.version) || !Array.isArray(scaffoldManifest.scaffolds)) {',
  )

  text = text.replace(
    `if (!scaffold.role || !scaffold.activationCondition) {
      violations.push(\`\${scaffold.path}: scaffold requires role and activationCondition\`)
    }`,
    `if (!scaffold.role || !scaffold.activationCondition) {
      violations.push(\`\${scaffold.path}: scaffold requires role and activationCondition\`)
    }
    if (scaffoldManifest.version >= 2) {
      if (!scaffold.owner || !scaffold.removalCondition) {
        violations.push(
          \`\${scaffold.path}: scaffold requires owner and removalCondition\`,
        )
      }
      if (!Array.isArray(scaffold.allowedDependencies)) {
        violations.push(
          \`\${scaffold.path}: scaffold requires allowedDependencies\`,
        )
      }
    }`,
  )

  writeText(path, text)
}

function writeArchitectureDecision() {
  writeText(
    'docs/adr/ADR-002-document-lifecycle-boundary.md',
    String.raw`# ADR-002：画布文档生命周期边界

- 状态：Accepted
- 日期：2026-07-21
- 决策者：Hybrid Canvas maintainers

## 背景

原有 \`features/canvas-session\` 同时依赖：

- editor/core；
- editor/persistence；
- features/workspace。

它既拥有画布文档会话，又直接修改产品工作台状态。这导致编辑器子系统反向依赖产品 UI，并使文档生命周期无法在无 Workspace 的环境中独立测试或复用。

## 决策

将画布文档生命周期移动到：

\`editor/document\`

包名为：

\`@hybrid-canvas/document\`

该包拥有：

- EditorSession 集合；
- 文档打开和创建；
- dirty revision；
- 保存状态机；
- 文件格式编解码协调；
- 关闭决策；
- 应用退出前的文档关闭计划。

该包不得依赖：

- React；
- Workspace；
- Tauri；
- 桌面窗口；
- 产品命令注册；
- 平台 adapter 类型。

桌面应用在 composition root 中创建：

- CanvasDocumentService；
- WorkbenchSessionStore；
- CanvasWorkflow。

CanvasWorkflow 是应用层协调器，负责在文档会话与 Workspace 标签页之间维护一致性。

## 依赖关系

\`\`\`mermaid
graph TD
  Desktop[apps/desktop]
  Workflow[CanvasWorkflow]
  Workspace[features/workspace]
  Document[editor/document]
  Core[editor/core]
  Persistence[editor/persistence]
  Platform[platforms/desktop-runtime]

  Desktop --> Workflow
  Workflow --> Workspace
  Workflow --> Document
  Document --> Core
  Document --> Persistence
  Desktop --> Platform
\`\`\`

## 状态所有权

- TLStore：唯一画布文档事实来源；
- EditorSession：Editor/TLStore 运行时生命周期；
- CanvasDocumentService：文件路径、revision 和保存状态；
- WorkbenchSessionStore：标签页、活动画布和 Workspace 投影；
- CanvasWorkflow：跨模块事务与失败补偿；
- React：仅拥有对话框开关等临时 UI 状态。

## 备选方案

### 保持 canvas-session 为 Feature

拒绝。它不是用户可选择的产品能力，而是所有画布文档都需要的编辑器生命周期基础能力。

### 合并到 editor/core

拒绝。editor/core 应只管理 tldraw runtime、schema 和扩展注册，不应知道文件选择或应用退出。

### 让 Workspace 拥有文档会话

拒绝。Workspace 是产品壳层投影，不应拥有 TLStore、文件路径或保存事务。

## 后果

正面影响：

- 消除 editor/application 对 Workspace 的反向依赖；
- 文档生命周期可脱离 React 和 Tauri 测试；
- 跨模块事务集中在应用层；
- 为原子保存、恢复和文件监视提供稳定边界。

代价：

- 增加一个小型 CanvasWorkflow 协调器；
- 文档会话和 Workspace 标签页仍是两种状态，但所有同步只发生在一个位置；
- 后续需要为跨模块补偿路径增加测试。

## 重新评估条件

出现以下情况时重新评估：

- Workspace 被多个应用复用；
- 引入多窗口共享同一文档会话；
- 引入协作服务器和后台文档进程；
- 文档生命周期迁移到独立进程；
- 插件需要受控访问文档级能力。
`,
  )

  writeText(
    'docs/architecture/scaffold-policy.md',
    String.raw`# 架构脚手架策略

空脚手架不是默认错误，但必须是受治理的架构资产。

每个预留脚手架必须声明：

1. 路径；
2. 生命周期阶段；
3. 稳定职责；
4. 所有者；
5. 激活条件；
6. 删除条件；
7. 允许依赖；
8. 禁止依赖。

## 允许预留的条件

只有同时满足以下条件才允许保留：

- 对应已确认的产品方向，而非纯假想复用；
- 边界位置已确定；
- 激活不会要求反转现有依赖；
- 存在明确移除条件；
- 架构测试能够验证其依赖约束；
- 不产生运行时代码、空 service、空 manager 或虚假公共 API。

## 禁止的脚手架

以下结构即使为空也不得预留：

- 根级 utils、types、services、managers；
- 没有使用方的通用事件总线；
- 仅为潜在可替换性建立的 editor abstraction；
- 与 tldraw 并行的第二文档模型；
- 未定义 capability 的插件宿主；
- 同时依赖 features 与 platforms 的基础包；
- 没有删除条件的永久占位包。

## 生命周期

\`\`\`text
reserved
  -> domain-only
  -> partial
  -> active
  -> deprecated
  -> removed
\`\`\`

阶段变化必须更新：

- architecture.scaffolds.json；
- 对应 ADR/RFC；
- package exports；
- 架构测试；
- 激活后的契约测试。
`,
  )
}

function updateAgentsDocument() {
  const path = 'AGENTS.md'
  let text = readText(path)

  text = text.replace(
    '│   ├── persistence/    #   TLStore snapshot, .draw container, 文件 I/O',
    [
      '│   ├── persistence/    #   TLStore snapshot, .draw container, 文件格式',
      '│   ├── document/       #   文档会话、保存状态与生命周期',
    ].join('\n'),
  )

  text = text.replace(
    '- `editor/core` 是唯一可以创建 TLSchema、TLStore、控制 Editor 生命周期的包。',
    [
      '- `editor/core` 是唯一可以创建 TLSchema、TLStore、控制 Editor 生命周期的包。',
      '- `editor/document` 拥有文档会话、文件路径、revision、保存状态和关闭计划。',
      '- `editor/document` 不得依赖 Workspace、React、Tauri 或平台 adapter。',
      '- 跨 editor 与 workspace 的协调只能位于 apps composition root。',
    ].join('\n'),
  )

  text = text.replace(
    '- 不为假想需求创建抽象、空目录、兼容层或第二套实现。',
    [
      '- 不为假想需求创建抽象、兼容层或第二套实现。',
      '- 允许通过 architecture.scaffolds.json 登记预留脚手架；每项必须声明所有者、激活条件、删除条件和依赖约束。',
    ].join('\n'),
  )

  writeText(path, text)
}

function verify() {
  run('pnpm install --lockfile-only')
  run('pnpm format')
  run('pnpm test:architecture')
  run('pnpm lint')
  run('pnpm typecheck')
  run('pnpm test')
  run('cargo fmt --check')
  run('cargo clippy --workspace --all-targets --all-features -- -D warnings')
  run('cargo test --workspace --all-features')
  run('pnpm build')
}

function printSummary() {
  console.log('')
  console.log('Architecture refactor applied.')
  console.log('')
  console.log('Key changes:')
  console.log('- features/canvas-session moved to editor/document')
  console.log('- @hybrid-canvas/document no longer depends on Workspace')
  console.log('- apps/desktop now owns document/workspace orchestration')
  console.log('- scaffold governance now includes owner and removal policy')
  console.log('- ADR-002 records the document lifecycle decision')
  console.log('')
  console.log('Review the result with:')
  console.log('  git status --short')
  console.log('  git diff --stat')
  console.log('  git diff')
}

function replaceInTextFiles(roots, oldValue, newValue) {
  for (const entry of roots) {
    const absolute = join(root, entry)

    if (!existsSync(absolute)) {
      continue
    }

    walkFiles(absolute, (path) => {
      if (!/\.(?:ts|tsx|js|mjs|cjs|json|md|yaml|yml)$/.test(path)) {
        return
      }

      const text = readFileSync(path, 'utf8')

      if (!text.includes(oldValue)) {
        return
      }

      writeFileSync(path, text.replaceAll(oldValue, newValue), 'utf8')
    })
  }
}

function walkFiles(directory, visitor) {
  for (const name of readdirSync(directory)) {
    if (['.git', '.turbo', 'dist', 'node_modules', 'target'].includes(name)) {
      continue
    }

    const path = join(directory, name)
    const stats = statSync(path)

    if (stats.isDirectory()) {
      walkFiles(path, visitor)
    } else {
      visitor(path)
    }
  }
}

function updateJson(path, update) {
  const current = JSON.parse(readText(path))
  writeJson(path, update(current))
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`)
}

function sortObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function inferScaffoldOwner(path) {
  if (path.startsWith('editor/')) {
    return 'editor'
  }

  if (path.startsWith('features/')) {
    return path.split('/').slice(0, 2).join('/')
  }

  if (path.startsWith('platforms/')) {
    return 'desktop-platform'
  }

  return 'architecture'
}

function inferAllowedDependencies(path) {
  if (path.startsWith('features/')) {
    return ['editor/', 'foundations/']
  }

  if (path.startsWith('editor/')) {
    return ['foundations/']
  }

  if (path.startsWith('platforms/')) {
    return ['editor/', 'foundations/']
  }

  return ['foundations/']
}

function replaceInFile(path, oldValue, newValue) {
  const text = readText(path)

  if (!text.includes(oldValue)) {
    return
  }

  writeText(path, text.replaceAll(oldValue, newValue))
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8')
}

function writeText(path, content) {
  const absolute = join(root, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content, 'utf8')
}

function rmIfExists(path) {
  const absolute = join(root, path)

  if (existsSync(absolute)) {
    rmSync(absolute, {
      recursive: true,
      force: true,
    })
  }
}

function requirePath(path) {
  if (!existsSync(join(root, path))) {
    fail(`Expected repository path is missing: ${path}`)
  }
}

function run(command) {
  console.log(`\n> ${command}`)
  execSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })
}

function git(arguments_) {
  return execFileSync('git', arguments_, {
    cwd: root,
    encoding: 'utf8',
  })
}

function fail(message) {
  console.error(`\nRefactor aborted:\n${message}\n`)
  process.exit(1)
}
