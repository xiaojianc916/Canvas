#!/usr/bin/env node

/**
 * Canvas document lifecycle architecture migration.
 *
 * Run from repository root:
 *
 *   node tooling/script/refactor.mjs --apply
 *
 * This migration:
 * - Replaces event-heuristic dirty tracking with an explicit document lifecycle.
 * - Makes editor/document the sole owner of clean/dirty/saving/failed state.
 * - Introduces deterministic content checkpoints.
 * - Uses an explicit Editor ready event instead of timers or microtasks.
 * - Moves all tests under tests/cross-domain-contract/document-lifecycle.
 * - Removes test files from business source directories.
 * - Adds comments in business files pointing to their test locations.
 */

import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldApply = process.argv.includes('--apply')

const files = {
  packageJson: 'package.json',
  workspace: 'pnpm-workspace.yaml',

  corePackage: 'editor/core/package.json',
  coreEditorSession:
    'editor/core/src/runtime/editor-session.ts',
  coreApplicationPublicApi:
    'editor/core/src/application/public-api.ts',

  documentPackage: 'editor/document/package.json',
  documentPublicApi:
    'editor/document/src/public-api.ts',
  documentCheckpoint:
    'editor/document/src/domain/document-checkpoint.ts',
  documentSession:
    'editor/document/src/domain/document-session.ts',
  editorDocumentPort:
    'editor/document/src/ports/editor-document-port.ts',
  documentService:
    'editor/document/src/application/canvas-document-service.ts',

  misplacedDocumentTest:
    'editor/document/src/application/canvas-document-service.test.ts',

  testPackage:
    'tests/cross-domain-contract/package.json',
  testTsconfig:
    'tests/cross-domain-contract/tsconfig.json',
  testReadme:
    'tests/cross-domain-contract/README.md',
  documentSessionTest:
    'tests/cross-domain-contract/document-lifecycle/document-session.test.ts',
  documentServiceTest:
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
}

function absolute(relativePath) {
  return path.join(root, relativePath)
}

function fail(message) {
  throw new Error(
    `[document-lifecycle-refactor] ${message}`,
  )
}

async function exists(relativePath) {
  try {
    await readFile(absolute(relativePath))
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }

    throw error
  }
}

async function ensureDirectory(relativeDirectory) {
  await mkdir(absolute(relativeDirectory), {
    recursive: true,
  })
}

async function write(relativePath, content) {
  await ensureDirectory(path.dirname(relativePath))

  await writeFile(
    absolute(relativePath),
    content.trimStart(),
    'utf8',
  )

  console.log(`写入：${relativePath}`)
}

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(absolute(relativePath), 'utf8'),
  )
}

async function writeJson(relativePath, value) {
  await write(
    relativePath,
    `${JSON.stringify(value, null, 2)}\n`,
  )
}

async function assertRepository() {
  if (!(await exists(files.packageJson))) {
    fail('请在 hybrid-canvas 仓库根目录执行。')
  }

  const packageJson = await readJson(
    files.packageJson,
  )

  if (packageJson.name !== 'hybrid-canvas') {
    fail(
      `当前 package.json.name 不是 hybrid-canvas：${String(
        packageJson.name,
      )}`,
    )
  }

  for (const required of [
    files.workspace,
    files.corePackage,
    files.documentPackage,
  ]) {
    if (!(await exists(required))) {
      fail(`缺少必要文件：${required}`)
    }
  }
}

async function updateWorkspaceConfiguration() {
  let workspace = await readFile(
    absolute(files.workspace),
    'utf8',
  )

  if (!workspace.includes('- "tests/*"')) {
    const marker = '  - "tooling/*"'

    if (!workspace.includes(marker)) {
      fail(
        'pnpm-workspace.yaml 中找不到 tooling workspace 配置。',
      )
    }

    workspace = workspace.replace(
      marker,
      `${marker}\n  - "tests/*"`,
    )
  }

  await write(files.workspace, workspace)
}

async function updateDocumentPackage() {
  const packageJson = await readJson(
    files.documentPackage,
  )

  /*
   * Tests no longer live inside the business package.
   * The dedicated cross-domain test package owns Vitest.
   */
  if (
    packageJson.scripts &&
    typeof packageJson.scripts === 'object'
  ) {
    delete packageJson.scripts.test
  }

  if (
    packageJson.devDependencies &&
    typeof packageJson.devDependencies === 'object'
  ) {
    delete packageJson.devDependencies.vitest
  }

  await writeJson(files.documentPackage, packageJson)
}

async function createDedicatedTestPackage() {
  await writeJson(files.testPackage, {
    name: '@hybrid-canvas/test-cross-domain-contract',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      check:
        'tsc --project tsconfig.json --noEmit',
      typecheck:
        'tsc --project tsconfig.json --noEmit',
      test:
        'vitest run document-lifecycle',
    },
    dependencies: {
      '@hybrid-canvas/canvas': 'workspace:*',
      '@hybrid-canvas/document': 'workspace:*',
      tldraw: 'catalog:',
    },
    devDependencies: {
      '@types/node': 'catalog:',
      typescript: 'catalog:',
      vitest: 'catalog:',
    },
  })

  await write(
    files.testTsconfig,
    `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.cache/typescript/cross-domain-contract.tsbuildinfo"
  },
  "include": ["document-lifecycle/**/*.ts"]
}
`,
  )

  await write(
    files.testReadme,
    `# Cross-domain contract tests

Tests that verify contracts spanning more than one architectural package.

## Document lifecycle

\`document-lifecycle/\` verifies the contract between:

- \`editor/core\`
- \`editor/document\`
- persistence and close planning

Business source files contain a short comment pointing back to the relevant tests.

Run:

\`\`\`bash
pnpm --filter @hybrid-canvas/test-cross-domain-contract test
\`\`\`
`,
  )
}

async function writeDocumentCheckpoint() {
  await write(
    files.documentCheckpoint,
    `import type { TLEditorSnapshot } from 'tldraw'

// Tests: tests/cross-domain-contract/document-lifecycle/document-session.test.ts

/**
 * Exact content-addressed identity of the persistable TLStore document.
 *
 * The canonical value is retained instead of using a non-cryptographic hash,
 * so dirty-state correctness cannot be affected by a hash collision.
 *
 * Session records such as camera, selection, active tool and viewport are not
 * part of this value.
 */
export interface DocumentCheckpoint {
  readonly canonicalDocument: string
}

export function createDocumentCheckpoint(
  snapshot: TLEditorSnapshot,
): DocumentCheckpoint {
  return {
    canonicalDocument: stableStringify(
      snapshot.document,
    ),
  }
}

export function checkpointsEqual(
  left: DocumentCheckpoint,
  right: DocumentCheckpoint,
): boolean {
  return (
    left.canonicalDocument ===
    right.canonicalDocument
  )
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value)

    case 'number':
      return Number.isFinite(value)
        ? JSON.stringify(value)
        : 'null'

    case 'bigint':
      return JSON.stringify(value.toString())

    case 'undefined':
    case 'function':
    case 'symbol':
      return 'null'

    case 'object':
      break
  }

  if (Array.isArray(value)) {
    return (
      '[' +
      value
        .map((item) => stableStringify(item))
        .join(',') +
      ']'
    )
  }

  const record = value as Record<
    string,
    unknown
  >

  const keys = Object.keys(record)
    .filter(
      (key) => record[key] !== undefined,
    )
    .sort((left, right) =>
      left.localeCompare(right),
    )

  return (
    '{' +
    keys
      .map(
        (key) =>
          JSON.stringify(key) +
          ':' +
          stableStringify(record[key]),
      )
      .join(',') +
    '}'
  )
}
`,
  )
}

async function writeEditorDocumentPort() {
  await write(
    files.editorDocumentPort,
    `import type { TLEditorSnapshot } from 'tldraw'

// Contract tests: tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

export type EditorDocumentEvent =
  | {
      readonly kind: 'ready'
    }
  | {
      readonly kind: 'changed'
    }

export interface EditorDocumentPort {
  /**
   * Returns a synchronous snapshot of the canonical tldraw editor state.
   *
   * The document application layer creates the persistence checkpoint from
   * snapshot.document. Runtime/session state is never used for dirty tracking.
   */
  readonly captureDocument: () => TLEditorSnapshot

  /**
   * Emits ready exactly at the explicit editor attachment boundary.
   *
   * Changed events are emitted only after ready and only for user-originated
   * TLStore document transactions.
   */
  readonly subscribeDocumentEvents: (
    listener: (
      event: EditorDocumentEvent,
    ) => void,
  ) => () => void
}
`,
  )
}

async function writeDocumentSession() {
  await write(
    files.documentSession,
    `import type { TLEditorSnapshot } from 'tldraw'

import {
  checkpointsEqual,
  createDocumentCheckpoint,
  type DocumentCheckpoint,
} from './document-checkpoint'

// Tests: tests/cross-domain-contract/document-lifecycle/document-session.test.ts

export type DocumentSessionPhase =
  | 'initializing'
  | 'ready'
  | 'saving'
  | 'save-failed'
  | 'closing'
  | 'closed'

export type DocumentPersistenceState =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'failed'

export interface DocumentSaveTicket {
  readonly id: number
  readonly checkpoint: DocumentCheckpoint
}

export interface DocumentSessionSnapshot {
  readonly phase: DocumentSessionPhase
  readonly persistence: DocumentPersistenceState
  readonly filePath: string | null
}

export interface DocumentSession {
  readonly initialize: (
    snapshot: TLEditorSnapshot,
  ) => void

  readonly recordDocumentChange: (
    snapshot: TLEditorSnapshot,
  ) => void

  readonly beginSave: (
    snapshot: TLEditorSnapshot,
  ) => DocumentSaveTicket

  readonly completeSave: (
    ticket: DocumentSaveTicket,
    filePath: string,
  ) => void

  readonly failSave: (
    ticket: DocumentSaveTicket,
  ) => void

  readonly beginClosing: () => void
  readonly completeClosing: () => void

  readonly isInitialized: () => boolean
  readonly isDirty: () => boolean
  readonly getPhase: () => DocumentSessionPhase
  readonly getFilePath: () => string | null
  readonly getSnapshot: () => DocumentSessionSnapshot
}

export function createDocumentSession(
  filePath: string | null,
): DocumentSession {
  let phase: DocumentSessionPhase =
    'initializing'

  let currentCheckpoint:
    | DocumentCheckpoint
    | null = null

  let savedCheckpoint:
    | DocumentCheckpoint
    | null = null

  let currentFilePath = filePath
  let activeSave: DocumentSaveTicket | null =
    null
  let nextSaveId = 1

  function assertNotClosed(): void {
    if (
      phase === 'closing' ||
      phase === 'closed'
    ) {
      throw new Error(
        'DOCUMENT_SESSION_NOT_ACTIVE',
      )
    }
  }

  function requireInitialized(): void {
    if (
      currentCheckpoint === null ||
      savedCheckpoint === null
    ) {
      throw new Error(
        'DOCUMENT_SESSION_NOT_INITIALIZED',
      )
    }
  }

  function requireActiveTicket(
    ticket: DocumentSaveTicket,
  ): void {
    if (
      activeSave === null ||
      activeSave.id !== ticket.id
    ) {
      throw new Error(
        'DOCUMENT_SESSION_STALE_SAVE_TICKET',
      )
    }
  }

  function isDirty(): boolean {
    if (
      currentCheckpoint === null ||
      savedCheckpoint === null
    ) {
      return false
    }

    return !checkpointsEqual(
      currentCheckpoint,
      savedCheckpoint,
    )
  }

  function getPersistenceState(): DocumentPersistenceState {
    if (phase === 'saving') {
      return 'saving'
    }

    if (phase === 'save-failed') {
      return 'failed'
    }

    return isDirty() ? 'dirty' : 'clean'
  }

  return {
    initialize(snapshot) {
      assertNotClosed()

      if (phase !== 'initializing') {
        throw new Error(
          'DOCUMENT_SESSION_ALREADY_INITIALIZED',
        )
      }

      const checkpoint =
        createDocumentCheckpoint(snapshot)

      currentCheckpoint = checkpoint
      savedCheckpoint = checkpoint
      phase = 'ready'
    },

    recordDocumentChange(snapshot) {
      assertNotClosed()
      requireInitialized()

      currentCheckpoint =
        createDocumentCheckpoint(snapshot)

      if (phase === 'save-failed') {
        phase = 'ready'
      }
    },

    beginSave(snapshot) {
      assertNotClosed()
      requireInitialized()

      if (phase === 'saving') {
        throw new Error(
          'DOCUMENT_SESSION_SAVE_ALREADY_ACTIVE',
        )
      }

      currentCheckpoint =
        createDocumentCheckpoint(snapshot)

      const ticket: DocumentSaveTicket = {
        id: nextSaveId,
        checkpoint: currentCheckpoint,
      }

      nextSaveId += 1
      activeSave = ticket
      phase = 'saving'

      return ticket
    },

    completeSave(ticket, nextFilePath) {
      assertNotClosed()
      requireActiveTicket(ticket)

      savedCheckpoint = ticket.checkpoint
      currentFilePath = nextFilePath
      activeSave = null
      phase = 'ready'
    },

    failSave(ticket) {
      assertNotClosed()
      requireActiveTicket(ticket)

      activeSave = null
      phase = 'save-failed'
    },

    beginClosing() {
      assertNotClosed()

      if (phase === 'saving') {
        throw new Error(
          'DOCUMENT_SESSION_SAVE_IN_PROGRESS',
        )
      }

      phase = 'closing'
    },

    completeClosing() {
      if (phase !== 'closing') {
        throw new Error(
          'DOCUMENT_SESSION_NOT_CLOSING',
        )
      }

      phase = 'closed'
    },

    isInitialized() {
      return (
        currentCheckpoint !== null &&
        savedCheckpoint !== null
      )
    },

    isDirty,

    getPhase() {
      return phase
    },

    getFilePath() {
      return currentFilePath
    },

    getSnapshot() {
      return {
        phase,
        persistence:
          getPersistenceState(),
        filePath: currentFilePath,
      }
    },
  }
}
`,
  )
}

async function writeEditorSession() {
  await write(
    files.coreEditorSession,
    `import {
  createTLStore,
  getSnapshot as getStoreEditorSnapshot,
  loadSnapshot,
} from '@tldraw/editor'
import {
  defaultBindingUtils,
  defaultShapeUtils,
  type Editor,
  type TLAnyShapeUtilConstructor,
  type TLEditorSnapshot,
  type TLStore,
} from 'tldraw'

import {
  buildExtensionRegistration,
  type ExtensionRegistration,
  type HybridCanvasExtension,
} from '../contracts/public-api'

// Contract tests: tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

export interface CreateEditorSessionOptions {
  readonly sessionId: string
  readonly documentId: string
  readonly initialSnapshot?: TLEditorSnapshot
  readonly extensions?: readonly HybridCanvasExtension[]
}

export type EditorSessionState =
  | 'created'
  | 'attached'
  | 'detached'
  | 'disposed'

export type EditorDocumentEvent =
  | {
      readonly kind: 'ready'
    }
  | {
      readonly kind: 'changed'
    }

export interface CanvasPageSnapshot {
  readonly id: string
  readonly title: string
  readonly isActive: boolean
}

export interface EditorSessionSnapshot {
  readonly pages: readonly CanvasPageSnapshot[]
}

export interface EditorSession {
  readonly sessionId: string
  readonly documentId: string
  readonly store: TLStore
  readonly registration: ExtensionRegistration
  readonly editor: Editor | null
  readonly state: EditorSessionState

  readonly attachEditor: (
    editor: Editor,
  ) => void

  readonly detachEditor: (
    editor: Editor,
  ) => void

  readonly getSnapshot: () => TLEditorSnapshot

  /**
   * Explicit document persistence adapter consumed structurally by
   * editor/document's EditorDocumentPort.
   */
  readonly captureDocument: () => TLEditorSnapshot

  readonly subscribeDocumentEvents: (
    listener: (
      event: EditorDocumentEvent,
    ) => void,
  ) => () => void

  readonly getSessionSnapshot: () => EditorSessionSnapshot
  readonly subscribe: (
    listener: () => void,
  ) => () => void

  readonly createPage: (
    title: string,
  ) => void

  readonly activatePage: (
    pageId: string,
  ) => void

  readonly dispose: () => void
}

export function createEditorSession(
  options: CreateEditorSessionOptions,
): EditorSession {
  const registration =
    buildExtensionRegistration(
      options.extensions,
    )

  const store = createTLStore({
    shapeUtils: [
      ...defaultShapeUtils,
      ...registration.shapeUtils,
    ] as unknown as readonly TLAnyShapeUtilConstructor[],
    bindingUtils: [
      ...defaultBindingUtils,
      ...registration.bindingUtils,
    ],
  })

  if (options.initialSnapshot) {
    loadSnapshot(
      store,
      options.initialSnapshot,
    )
  }

  let attachedEditor: Editor | null = null
  let state: EditorSessionState = 'created'
  let documentReady = false

  const sessionListeners =
    new Set<() => void>()

  const documentListeners =
    new Set<
      (
        event: EditorDocumentEvent,
      ) => void
    >()

  let sessionSnapshot: EditorSessionSnapshot = {
    pages: [],
  }

  function assertActive(): void {
    if (state === 'disposed') {
      throw new Error(
        'EDITOR_SESSION_DISPOSED',
      )
    }
  }

  function captureDocument(): TLEditorSnapshot {
    assertActive()

    return (
      attachedEditor?.getSnapshot() ??
      getStoreEditorSnapshot(store)
    )
  }

  function createSessionSnapshot(): EditorSessionSnapshot {
    if (!attachedEditor) {
      return {
        pages: [],
      }
    }

    const activePageId =
      attachedEditor.getCurrentPageId()

    return {
      pages: attachedEditor
        .getPages()
        .map((page) => ({
          id: page.id,
          title: page.name,
          isActive:
            page.id === activePageId,
        })),
    }
  }

  function publishSessionSnapshot(): void {
    sessionSnapshot =
      createSessionSnapshot()

    for (const listener of sessionListeners) {
      listener()
    }
  }

  function publishDocumentEvent(
    event: EditorDocumentEvent,
  ): void {
    for (const listener of documentListeners) {
      listener(event)
    }
  }

  const stopObservingSession =
    store.listen(
      publishSessionSnapshot,
      {
        scope: 'document',
      },
    )

  /*
   * Persistable change observation is armed only after attachEditor declares
   * the mounted tldraw Editor ready. No timer, microtask or record-type
   * heuristic is used.
   */
  const stopObservingDocument =
    store.listen(
      () => {
        if (
          state !== 'attached' ||
          !documentReady
        ) {
          return
        }

        publishDocumentEvent({
          kind: 'changed',
        })
      },
      {
        scope: 'document',
        source: 'user',
      },
    )

  return {
    sessionId: options.sessionId,
    documentId: options.documentId,
    store,
    registration,

    get editor() {
      return attachedEditor
    },

    get state() {
      return state
    },

    attachEditor(editor) {
      assertActive()

      if (
        attachedEditor &&
        attachedEditor !== editor
      ) {
        throw new Error(
          'EDITOR_SESSION_ALREADY_ATTACHED',
        )
      }

      attachedEditor = editor
      state = 'attached'

      /*
       * Tldraw invokes onMount only after its canonical Editor and initial
       * document records exist. This attachment is therefore the explicit
       * initialization boundary.
       */
      documentReady = true

      publishSessionSnapshot()
      publishDocumentEvent({
        kind: 'ready',
      })
    },

    detachEditor(editor) {
      if (attachedEditor !== editor) {
        return
      }

      documentReady = false
      attachedEditor = null
      state = 'detached'
      publishSessionSnapshot()
    },

    getSnapshot: captureDocument,
    captureDocument,

    subscribeDocumentEvents(listener) {
      assertActive()

      documentListeners.add(listener)

      return () => {
        documentListeners.delete(listener)
      }
    },

    getSessionSnapshot() {
      return sessionSnapshot
    },

    subscribe(listener) {
      sessionListeners.add(listener)

      return () => {
        sessionListeners.delete(listener)
      }
    },

    createPage(title) {
      assertActive()

      attachedEditor?.createPage({
        name: title,
      })
    },

    activatePage(pageId) {
      assertActive()

      const page = attachedEditor
        ?.getPages()
        .find(
          (candidate) =>
            candidate.id === pageId,
        )

      if (attachedEditor && page) {
        attachedEditor.setCurrentPage(page)
      }
    },

    dispose() {
      if (state === 'disposed') {
        return
      }

      stopObservingSession()
      stopObservingDocument()

      sessionListeners.clear()
      documentListeners.clear()

      documentReady = false
      attachedEditor = null
      state = 'disposed'
    },
  }
}

export interface EditorSessionRegistry {
  readonly create: (
    options: CreateEditorSessionOptions,
  ) => EditorSession

  readonly get: (
    sessionId: string,
  ) => EditorSession | null

  readonly require: (
    sessionId: string,
  ) => EditorSession

  readonly close: (
    sessionId: string,
  ) => void

  readonly dispose: () => void
}

export function createEditorSessionRegistry(): EditorSessionRegistry {
  const sessions =
    new Map<string, EditorSession>()

  return {
    create(options) {
      if (sessions.has(options.sessionId)) {
        throw new Error(
          'EDITOR_SESSION_DUPLICATE_ID',
        )
      }

      const session =
        createEditorSession(options)

      sessions.set(
        options.sessionId,
        session,
      )

      return session
    },

    get(sessionId) {
      return sessions.get(sessionId) ?? null
    },

    require(sessionId) {
      const session =
        sessions.get(sessionId)

      if (!session) {
        throw new Error(
          'EDITOR_SESSION_NOT_FOUND',
        )
      }

      return session
    },

    close(sessionId) {
      const session =
        sessions.get(sessionId)

      if (!session) {
        return
      }

      session.dispose()
      sessions.delete(sessionId)
    },

    dispose() {
      for (const session of sessions.values()) {
        session.dispose()
      }

      sessions.clear()
    },
  }
}
`,
  )
}

async function writeCorePublicApi() {
  await write(
    files.coreApplicationPublicApi,
    `export {
  type CanvasPageSnapshot,
  type CreateEditorSessionOptions,
  createEditorSession,
  createEditorSessionRegistry,
  type EditorDocumentEvent,
  type EditorSession,
  type EditorSessionRegistry,
  type EditorSessionSnapshot,
  type EditorSessionState,
} from '../runtime/editor-session'

export {
  type CanvasBoundsViewModel,
  type CanvasSelectionViewModel,
  type CanvasSessionViewModel,
  type CanvasToolId,
  EMPTY_CANVAS_SESSION_VIEW_MODEL,
} from './model/canvas-session-view-model'
`,
  )
}

async function writeDocumentService() {
  await write(
    files.documentService,
    `import type {
  EditorSession,
  EditorSessionRegistry,
} from '@hybrid-canvas/canvas/application'
import type { HybridCanvasExtension } from '@hybrid-canvas/canvas/extensions'
import {
  parseDrawDocument,
  serializeDrawDocument,
} from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'

import {
  createDocumentSession,
  type DocumentSaveTicket,
  type DocumentSession,
  type DocumentPersistenceState,
} from '../domain/document-session'
import type {
  EditorDocumentEvent,
  EditorDocumentPort,
} from '../ports/editor-document-port'

// Tests: tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

export type CanvasId = string
export type CanvasSessionId = string

export type CanvasPersistenceState =
  DocumentPersistenceState

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
  | {
      readonly kind: 'close-now'
    }
  | {
      readonly kind: 'confirm-discard'
      readonly persistence:
        | 'dirty'
        | 'failed'
    }
  | {
      readonly kind: 'wait-for-save'
      readonly operation: Promise<void>
    }
  | {
      readonly kind: 'not-found'
    }

export type ApplicationClosePlan =
  | {
      readonly kind: 'close-now'
    }
  | {
      readonly kind: 'confirm-discard'
      readonly sessionIds:
        readonly CanvasSessionId[]
    }
  | {
      readonly kind: 'wait-for-saves'
      readonly operations:
        readonly Promise<void>[]
    }

export interface CanvasDocumentService {
  readonly create: (
    title: string,
  ) => OpenedCanvasSession

  readonly open: () => Promise<
    OpenedCanvasSession | null
  >

  readonly save: (
    sessionId: CanvasSessionId,
  ) => Promise<void>

  readonly requestClose: (
    sessionId: CanvasSessionId,
  ) => CanvasCloseDecision

  readonly discardAndClose: (
    sessionId: CanvasSessionId,
  ) => void

  readonly planApplicationClose:
    () => ApplicationClosePlan

  readonly getEditorSession: (
    sessionId: CanvasSessionId,
  ) => EditorSession | null

  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null

  readonly getVersion: () => number

  readonly subscribe: (
    listener: () => void,
  ) => () => void

  readonly dispose: () => void
}

export interface CanvasEditorSessionRegistryPort {
  readonly create:
    EditorSessionRegistry['create']

  readonly close:
    EditorSessionRegistry['close']

  readonly dispose:
    EditorSessionRegistry['dispose']
}

export interface DrawPersistencePort {
  readonly read: (
    path: string,
  ) => Promise<string>

  readonly write: (
    path: string,
    content: string,
  ) => Promise<void>
}

export interface CanvasFileSelectionPort {
  readonly selectOpenPath:
    () => Promise<string | null>

  readonly selectSavePath: (
    suggestedName: string,
  ) => Promise<string | null>
}

export interface CreateCanvasDocumentServiceDependencies {
  readonly editorSessions:
    CanvasEditorSessionRegistryPort

  readonly persistence:
    DrawPersistencePort

  readonly fileSelection:
    CanvasFileSelectionPort

  readonly extensions:
    readonly HybridCanvasExtension[]
}

interface OwnedCanvasSession {
  readonly editor: EditorSession
  readonly editorDocument: EditorDocumentPort
  readonly document: DocumentSession

  stopObservingDocument: () => void
  saveOperation: Promise<void> | null
}

export function createCanvasDocumentService({
  editorSessions,
  persistence,
  fileSelection,
  extensions,
}: CreateCanvasDocumentServiceDependencies): CanvasDocumentService {
  const sessions =
    new Map<
      CanvasSessionId,
      OwnedCanvasSession
    >()

  const listeners =
    new Set<() => void>()

  let version = 0

  function emit(): void {
    version += 1

    for (const listener of listeners) {
      listener()
    }
  }

  function create(
    title: string,
  ): OpenedCanvasSession {
    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()

    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      extensions,
    })

    const owned = createOwnedSession(
      editor,
      null,
    )

    sessions.set(sessionId, owned)

    return {
      canvasId,
      sessionId,
      title,
    }
  }

  async function open(): Promise<
    OpenedCanvasSession | null
  > {
    const filePath =
      await fileSelection.selectOpenPath()

    if (!filePath) {
      return null
    }

    const content =
      await persistence.read(filePath)

    const initialSnapshot =
      parseEditorSnapshot(content)

    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()

    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      initialSnapshot,
      extensions,
    })

    const owned = createOwnedSession(
      editor,
      filePath,
    )

    sessions.set(sessionId, owned)

    return {
      canvasId,
      sessionId,
      title: getFileTitle(filePath),
    }
  }

  function createOwnedSession(
    editor: EditorSession,
    filePath: string | null,
  ): OwnedCanvasSession {
    /*
     * EditorSession structurally implements EditorDocumentPort without
     * editor/core depending on editor/document.
     */
    const editorDocument: EditorDocumentPort =
      editor

    const document =
      createDocumentSession(filePath)

    const owned: OwnedCanvasSession = {
      editor,
      editorDocument,
      document,
      stopObservingDocument: () => {},
      saveOperation: null,
    }

    owned.stopObservingDocument =
      editorDocument.subscribeDocumentEvents(
        (event) => {
          handleEditorDocumentEvent(
            owned,
            event,
          )
        },
      )

    return owned
  }

  function handleEditorDocumentEvent(
    owned: OwnedCanvasSession,
    event: EditorDocumentEvent,
  ): void {
    if (event.kind === 'ready') {
      /*
       * React StrictMode or tab remounting may attach the same session more
       * than once. Only the first explicit ready event establishes the saved
       * baseline.
       */
      if (
        !owned.document.isInitialized()
      ) {
        owned.document.initialize(
          owned.editorDocument.captureDocument(),
        )

        emit()
      }

      return
    }

    if (
      !owned.document.isInitialized()
    ) {
      throw new Error(
        'DOCUMENT_CHANGE_BEFORE_EDITOR_READY',
      )
    }

    owned.document.recordDocumentChange(
      owned.editorDocument.captureDocument(),
    )

    emit()
  }

  function save(
    sessionId: CanvasSessionId,
  ): Promise<void> {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      return owned.saveOperation
    }

    const operation =
      performSave(owned).finally(() => {
        owned.saveOperation = null
      })

    owned.saveOperation = operation

    return operation
  }

  async function performSave(
    owned: OwnedCanvasSession,
  ): Promise<void> {
    if (
      !owned.document.isInitialized()
    ) {
      throw new Error(
        'DOCUMENT_SESSION_NOT_READY',
      )
    }

    const existingPath =
      owned.document.getFilePath()

    const filePath =
      existingPath ??
      (await fileSelection.selectSavePath(
        '未命名画布.draw',
      ))

    if (!filePath) {
      return
    }

    /*
     * Snapshot and save checkpoint are created from the same synchronous
     * capture. Concurrent edits after this point update currentCheckpoint but
     * cannot incorrectly become part of the completed savepoint.
     */
    const snapshot =
      owned.editorDocument.captureDocument()

    let ticket: DocumentSaveTicket | null =
      null

    try {
      ticket =
        owned.document.beginSave(snapshot)

      emit()

      const content =
        serializeDrawDocument(snapshot)

      await persistence.write(
        filePath,
        content,
      )

      owned.document.completeSave(
        ticket,
        filePath,
      )

      emit()
    } catch (error) {
      if (ticket) {
        owned.document.failSave(ticket)
        emit()
      }

      throw error
    }
  }

  function requestClose(
    sessionId: CanvasSessionId,
  ): CanvasCloseDecision {
    const owned = sessions.get(sessionId)

    if (!owned) {
      return {
        kind: 'not-found',
      }
    }

    if (owned.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: owned.saveOperation,
      }
    }

    const persistenceState =
      owned.document.getSnapshot()
        .persistence

    if (
      persistenceState === 'dirty' ||
      persistenceState === 'failed'
    ) {
      return {
        kind: 'confirm-discard',
        persistence: persistenceState,
      }
    }

    closeNow(sessionId, owned)

    return {
      kind: 'close-now',
    }
  }

  function discardAndClose(
    sessionId: CanvasSessionId,
  ): void {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      throw new Error(
        'CANVAS_SESSION_SAVE_IN_PROGRESS',
      )
    }

    closeNow(sessionId, owned)
  }

  function closeNow(
    sessionId: CanvasSessionId,
    owned: OwnedCanvasSession,
  ): void {
    owned.document.beginClosing()
    owned.document.completeClosing()

    release(sessionId, owned)
    emit()
  }

  function release(
    sessionId: CanvasSessionId,
    owned: OwnedCanvasSession,
  ): void {
    owned.stopObservingDocument()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
  }

  function planApplicationClose(): ApplicationClosePlan {
    const operations: Promise<void>[] = []
    const dirtySessionIds:
      CanvasSessionId[] = []

    for (const [
      sessionId,
      owned,
    ] of sessions) {
      if (owned.saveOperation) {
        operations.push(
          owned.saveOperation,
        )

        continue
      }

      const persistenceState =
        owned.document.getSnapshot()
          .persistence

      if (
        persistenceState === 'dirty' ||
        persistenceState === 'failed'
      ) {
        dirtySessionIds.push(sessionId)
      }
    }

    if (operations.length > 0) {
      return {
        kind: 'wait-for-saves',
        operations,
      }
    }

    if (dirtySessionIds.length > 0) {
      return {
        kind: 'confirm-discard',
        sessionIds: dirtySessionIds,
      }
    }

    return {
      kind: 'close-now',
    }
  }

  function requireSession(
    sessionId: CanvasSessionId,
  ): OwnedCanvasSession {
    const owned = sessions.get(sessionId)

    if (!owned) {
      throw new Error(
        'CANVAS_SESSION_NOT_FOUND',
      )
    }

    return owned
  }

  return {
    create,
    open,
    save,
    requestClose,
    discardAndClose,
    planApplicationClose,

    getEditorSession(sessionId) {
      return (
        sessions.get(sessionId)?.editor ??
        null
      )
    },

    getSessionSnapshot(sessionId) {
      const owned = sessions.get(sessionId)

      if (!owned) {
        return null
      }

      return {
        sessionId,
        persistence:
          owned.document.getSnapshot()
            .persistence,
      }
    },

    getVersion() {
      return version
    },

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      for (const [
        sessionId,
        owned,
      ] of sessions) {
        owned.stopObservingDocument()
        editorSessions.close(sessionId)
      }

      sessions.clear()
      listeners.clear()
      editorSessions.dispose()
    },
  }
}

function parseEditorSnapshot(
  json: string,
): TLEditorSnapshot {
  try {
    return parseDrawDocument(json).content
  } catch (containerError) {
    try {
      const parsed: unknown =
        JSON.parse(json)

      if (isEditorSnapshot(parsed)) {
        return parsed
      }
    } catch {
      // Preserve the validated container error as the public failure.
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

function getFileTitle(
  filePath: string,
): string {
  const normalized =
    filePath.replaceAll('\\\\', '/')

  const fileName = normalized.slice(
    normalized.lastIndexOf('/') + 1,
  )

  return fileName
    .toLowerCase()
    .endsWith('.draw')
    ? fileName.slice(0, -5)
    : fileName
}
`,
  )
}

async function writeDocumentPublicApi() {
  await write(
    files.documentPublicApi,
    `export {
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
  createCanvasDocumentService,
  type DrawPersistencePort,
  type OpenedCanvasSession,
} from './application/canvas-document-service'

export {
  checkpointsEqual,
  createDocumentCheckpoint,
  type DocumentCheckpoint,
} from './domain/document-checkpoint'

export {
  createDocumentSession,
  type DocumentPersistenceState,
  type DocumentSaveTicket,
  type DocumentSession,
  type DocumentSessionPhase,
  type DocumentSessionSnapshot,
} from './domain/document-session'

export {
  type EditorDocumentEvent,
  type EditorDocumentPort,
} from './ports/editor-document-port'
`,
  )
}

async function writeDocumentSessionTests() {
  await write(
    files.documentSessionTest,
    `import {
  createDocumentSession,
} from '@hybrid-canvas/document'
import type { TLEditorSnapshot } from 'tldraw'
import {
  describe,
  expect,
  it,
} from 'vitest'

function snapshot(
  documentValue: unknown,
): TLEditorSnapshot {
  return {
    document: documentValue,
    session: {},
  } as unknown as TLEditorSnapshot
}

describe('DocumentSession', () => {
  it('initializes a new document as clean', () => {
    const session =
      createDocumentSession(null)

    session.initialize(
      snapshot({
        records: {
          page: {
            id: 'page:1',
          },
        },
      }),
    )

    expect(session.getSnapshot()).toEqual({
      phase: 'ready',
      persistence: 'clean',
      filePath: null,
    })
  })

  it('becomes dirty after a document change', () => {
    const session =
      createDocumentSession(null)

    session.initialize(
      snapshot({
        shapes: [],
      }),
    )

    session.recordDocumentChange(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    expect(session.isDirty()).toBe(true)

    expect(
      session.getSnapshot().persistence,
    ).toBe('dirty')
  })

  it('returns to clean when undo restores the saved checkpoint', () => {
    const session =
      createDocumentSession(null)

    const baseline = snapshot({
      shapes: [],
    })

    session.initialize(baseline)

    session.recordDocumentChange(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    expect(session.isDirty()).toBe(true)

    session.recordDocumentChange(
      baseline,
    )

    expect(session.isDirty()).toBe(false)

    expect(
      session.getSnapshot().persistence,
    ).toBe('clean')
  })

  it('ignores object key insertion order', () => {
    const session =
      createDocumentSession(null)

    session.initialize(
      snapshot({
        alpha: 1,
        beta: 2,
      }),
    )

    session.recordDocumentChange(
      snapshot({
        beta: 2,
        alpha: 1,
      }),
    )

    expect(session.isDirty()).toBe(false)
  })

  it('stays dirty when editing continues during save', () => {
    const session =
      createDocumentSession(null)

    session.initialize(
      snapshot({
        shapes: [],
      }),
    )

    const ticket = session.beginSave(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    session.recordDocumentChange(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
          {
            id: 'shape:2',
          },
        ],
      }),
    )

    session.completeSave(
      ticket,
      'drawing.draw',
    )

    expect(session.isDirty()).toBe(true)

    expect(session.getSnapshot()).toEqual({
      phase: 'ready',
      persistence: 'dirty',
      filePath: 'drawing.draw',
    })
  })

  it('becomes clean after saving the current document', () => {
    const session =
      createDocumentSession(null)

    session.initialize(
      snapshot({
        shapes: [],
      }),
    )

    const current = snapshot({
      shapes: [
        {
          id: 'shape:1',
        },
      ],
    })

    session.recordDocumentChange(current)

    const ticket =
      session.beginSave(current)

    session.completeSave(
      ticket,
      'drawing.draw',
    )

    expect(session.isDirty()).toBe(false)

    expect(session.getSnapshot()).toEqual({
      phase: 'ready',
      persistence: 'clean',
      filePath: 'drawing.draw',
    })
  })

  it('enters failed state after a save failure', () => {
    const session =
      createDocumentSession(null)

    const current = snapshot({
      shapes: [],
    })

    session.initialize(current)

    const ticket =
      session.beginSave(current)

    session.failSave(ticket)

    expect(session.getSnapshot()).toEqual({
      phase: 'save-failed',
      persistence: 'failed',
      filePath: null,
    })
  })
})
`,
  )
}

async function writeDocumentServiceTests() {
  await write(
    files.documentServiceTest,
    `import type {
  EditorDocumentEvent,
  EditorSession,
} from '@hybrid-canvas/canvas/application'
import {
  createCanvasDocumentService,
} from '@hybrid-canvas/document'
import type { TLEditorSnapshot } from 'tldraw'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

function snapshot(
  documentValue: unknown,
): TLEditorSnapshot {
  return {
    document: documentValue,
    session: {},
  } as unknown as TLEditorSnapshot
}

function createHarness() {
  let currentSnapshot = snapshot({
    shapes: [],
  })

  const documentListeners =
    new Set<
      (
        event: EditorDocumentEvent,
      ) => void
    >()

  const closeEditorSession = vi.fn()

  const editor = {
    sessionId: 'editor-session',
    documentId: 'document',
    captureDocument() {
      return currentSnapshot
    },
    getSnapshot() {
      return currentSnapshot
    },
    subscribeDocumentEvents(listener) {
      documentListeners.add(listener)

      return () => {
        documentListeners.delete(listener)
      }
    },
  } as unknown as EditorSession

  const service =
    createCanvasDocumentService({
      editorSessions: {
        create: () => editor,
        close: closeEditorSession,
        dispose: vi.fn(),
      },
      persistence: {
        read: vi.fn(),
        write: vi.fn(),
      },
      fileSelection: {
        selectOpenPath: vi.fn(),
        selectSavePath: vi.fn(),
      },
      extensions: [],
    })

  function emit(
    event: EditorDocumentEvent,
  ): void {
    for (const listener of documentListeners) {
      listener(event)
    }
  }

  return {
    service,
    closeEditorSession,

    ready() {
      emit({
        kind: 'ready',
      })
    },

    change(
      nextSnapshot: TLEditorSnapshot,
    ) {
      currentSnapshot = nextSnapshot

      emit({
        kind: 'changed',
      })
    },
  }
}

describe('CanvasDocumentService lifecycle contract', () => {
  it('closes a newly initialized blank canvas without confirmation', () => {
    const harness = createHarness()

    const opened =
      harness.service.create(
        '未命名画布',
      )

    harness.ready()

    expect(
      harness.service.getSessionSnapshot(
        opened.sessionId,
      ),
    ).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })

    expect(
      harness.service.requestClose(
        opened.sessionId,
      ),
    ).toEqual({
      kind: 'close-now',
    })

    expect(
      harness.closeEditorSession,
    ).toHaveBeenCalledWith(
      opened.sessionId,
    )
  })

  it('requires confirmation after a real document change', () => {
    const harness = createHarness()

    const opened =
      harness.service.create(
        '未命名画布',
      )

    harness.ready()

    harness.change(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    expect(
      harness.service.getSessionSnapshot(
        opened.sessionId,
      )?.persistence,
    ).toBe('dirty')

    expect(
      harness.service.requestClose(
        opened.sessionId,
      ),
    ).toEqual({
      kind: 'confirm-discard',
      persistence: 'dirty',
    })
  })

  it('does not reset the savepoint when the editor attaches again', () => {
    const harness = createHarness()

    const opened =
      harness.service.create(
        '未命名画布',
      )

    harness.ready()

    harness.change(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    /*
     * Simulates React StrictMode or tab remounting.
     */
    harness.ready()

    expect(
      harness.service.getSessionSnapshot(
        opened.sessionId,
      )?.persistence,
    ).toBe('dirty')
  })

  it('returns to clean when undo restores the initial checkpoint', () => {
    const harness = createHarness()

    const opened =
      harness.service.create(
        '未命名画布',
      )

    harness.ready()

    harness.change(
      snapshot({
        shapes: [
          {
            id: 'shape:1',
          },
        ],
      }),
    )

    expect(
      harness.service.getSessionSnapshot(
        opened.sessionId,
      )?.persistence,
    ).toBe('dirty')

    harness.change(
      snapshot({
        shapes: [],
      }),
    )

    expect(
      harness.service.getSessionSnapshot(
        opened.sessionId,
      )?.persistence,
    ).toBe('clean')
  })
})
`,
  )
}

async function removeMisplacedTests() {
  if (
    await exists(files.misplacedDocumentTest)
  ) {
    await rm(
      absolute(files.misplacedDocumentTest),
      {
        force: true,
      },
    )

    console.log(
      `删除错误位置测试：${files.misplacedDocumentTest}`,
    )
  }
}

async function validateMigration() {
  const requiredFiles = [
    files.documentCheckpoint,
    files.documentSession,
    files.editorDocumentPort,
    files.documentService,
    files.documentSessionTest,
    files.documentServiceTest,
    files.testPackage,
  ]

  for (const required of requiredFiles) {
    if (!(await exists(required))) {
      fail(`迁移后缺少文件：${required}`)
    }
  }

  if (
    await exists(files.misplacedDocumentTest)
  ) {
    fail(
      `业务源码目录中仍存在测试：${files.misplacedDocumentTest}`,
    )
  }

  const editorSource = await readFile(
    absolute(files.coreEditorSession),
    'utf8',
  )

  const documentSource = await readFile(
    absolute(files.documentService),
    'utf8',
  )

  const forbidden = [
    'bootstrapPending',
    'queueMicrotask',
    'isInitialDocumentBootstrapChange',
    'onUserDocumentChange',
    'savedRevision',
    'session.revision',
  ]

  for (const token of forbidden) {
    if (
      editorSource.includes(token) ||
      documentSource.includes(token)
    ) {
      fail(`仍存在旧逻辑：${token}`)
    }
  }

  const requiredEditorTokens = [
    "kind: 'ready'",
    "kind: 'changed'",
    "source: 'user'",
    'captureDocument',
    'subscribeDocumentEvents',
  ]

  for (const token of requiredEditorTokens) {
    if (!editorSource.includes(token)) {
      fail(
        `Editor adapter 缺少：${token}`,
      )
    }
  }

  const requiredDocumentTokens = [
    'createDocumentSession',
    'beginSave',
    'completeSave',
    'recordDocumentChange',
    'isInitialized',
  ]

  for (const token of requiredDocumentTokens) {
    if (!documentSource.includes(token)) {
      fail(
        `Document service 缺少：${token}`,
      )
    }
  }

  console.log('架构迁移结构检查通过。')
}

function runPnpm(args) {
  console.log(`\n> pnpm ${args.join(' ')}`)

  const options = {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  }

  const result =
    process.platform === 'win32'
      ? spawnSync(
          process.env.ComSpec ?? 'cmd.exe',
          [
            '/d',
            '/s',
            '/c',
            `pnpm ${args.join(' ')}`,
          ],
          options,
        )
      : spawnSync(
          'pnpm',
          args,
          options,
        )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    fail(
      `pnpm ${args.join(
        ' ',
      )} 执行失败，退出码：${String(
        result.status,
      )}`,
    )
  }
}

function verify() {
  const formattedFiles = [
    files.workspace,
    files.coreEditorSession,
    files.coreApplicationPublicApi,
    files.documentPackage,
    files.documentPublicApi,
    files.documentCheckpoint,
    files.documentSession,
    files.editorDocumentPort,
    files.documentService,
    files.testPackage,
    files.testTsconfig,
    files.documentSessionTest,
    files.documentServiceTest,
  ]

  runPnpm(['install'])

  runPnpm([
    'exec',
    'biome',
    'format',
    '--write',
    ...formattedFiles,
  ])

  runPnpm([
    '--filter',
    '@hybrid-canvas/canvas',
    'typecheck',
  ])

  runPnpm([
    '--filter',
    '@hybrid-canvas/document',
    'typecheck',
  ])

  runPnpm([
    '--filter',
    '@hybrid-canvas/test-cross-domain-contract',
    'typecheck',
  ])

  runPnpm([
    '--filter',
    '@hybrid-canvas/test-cross-domain-contract',
    'test',
  ])

  runPnpm(['test:architecture'])
}

async function main() {
  await assertRepository()

  if (!shouldApply) {
    console.log(`
Document lifecycle architecture migration

This script will replace the old dirty-state implementation with:

- EditorDocumentPort
- DocumentCheckpoint
- DocumentSession aggregate
- Explicit editor ready/change events
- Save-ticket concurrency semantics
- Derived clean/dirty state
- Dedicated cross-domain test package

Tests will be located only under:

tests/cross-domain-contract/document-lifecycle

Run:

node tooling/script/refactor.mjs --apply
`)
    return
  }

  console.log(
    '开始迁移 Document lifecycle 架构……\n',
  )

  await updateWorkspaceConfiguration()
  await updateDocumentPackage()
  await createDedicatedTestPackage()

  await writeDocumentCheckpoint()
  await writeEditorDocumentPort()
  await writeDocumentSession()

  await writeEditorSession()
  await writeCorePublicApi()

  await writeDocumentService()
  await writeDocumentPublicApi()

  await writeDocumentSessionTests()
  await writeDocumentServiceTests()
  await removeMisplacedTests()

  await validateMigration()

  console.log(
    '\n架构文件迁移完成，开始安装依赖和验证。',
  )

  verify()

  console.log(`
Document lifecycle 重构完成。

业务代码：
- editor/core/src/runtime/editor-session.ts
- editor/document/src/domain/document-checkpoint.ts
- editor/document/src/domain/document-session.ts
- editor/document/src/ports/editor-document-port.ts
- editor/document/src/application/canvas-document-service.ts

测试代码：
- tests/cross-domain-contract/document-lifecycle/document-session.test.ts
- tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

旧的源码目录测试文件已删除。
`)
}

main().catch((error) => {
  console.error('\nDocument lifecycle 重构失败：')
  console.error(error)
  process.exitCode = 1
})