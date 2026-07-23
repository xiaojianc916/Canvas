#!/usr/bin/env node
/**
 * refactor.mjs
 *
 * 将前端 document service 从旧的 path-based 文件协议迁移到当前已存在的
 * DocumentFileCommands / document_open / document_save_as / document_save /
 * document_close 协议。
 *
 * 不回滚。
 * 不增加 createDrawFileCommands 兼容别名。
 * 不保留 path-based DrawPersistencePort。
 * 不保留前端 FileDialog 文件选择流程。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const files = {
  documentSession: resolve('editor/document/src/domain/document-session.ts'),
  documentService: resolve(
    'editor/document/src/application/canvas-document-service.ts',
  ),
  documentPublicApi: resolve('editor/document/src/public-api.ts'),
  desktopApplication: resolve('apps/desktop/src/bootstrap/application.ts'),
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

const documentSession = `import type { TLEditorSnapshot } from 'tldraw'

import {
  checkpointsEqual,
  createDocumentCheckpoint,
  type DocumentCheckpoint,
} from './document-checkpoint'

export type DocumentSessionPhase =
  | 'initializing'
  | 'ready'
  | 'saving'
  | 'save-failed'
  | 'closing'
  | 'closed'

export type DocumentPersistenceState = 'clean' | 'dirty' | 'saving' | 'failed'

export interface DocumentSaveTicket {
  readonly id: number
  readonly checkpoint: DocumentCheckpoint
}

export interface DocumentSessionSnapshot {
  readonly phase: DocumentSessionPhase
  readonly persistence: DocumentPersistenceState
  readonly documentId: string | null
}

export interface DocumentSession {
  readonly initialize: (snapshot: TLEditorSnapshot) => void
  readonly recordDocumentChange: (snapshot: TLEditorSnapshot) => void
  readonly beginSave: (snapshot: TLEditorSnapshot) => DocumentSaveTicket
  readonly completeSave: (
    ticket: DocumentSaveTicket,
    documentId: string,
  ) => void
  readonly failSave: (ticket: DocumentSaveTicket) => void
  readonly beginClosing: () => void
  readonly completeClosing: () => void
  readonly isInitialized: () => boolean
  readonly isDirty: () => boolean
  readonly getPhase: () => DocumentSessionPhase
  readonly getDocumentId: () => string | null
  readonly getSnapshot: () => DocumentSessionSnapshot
}

export function createDocumentSession(
  initialDocumentId: string | null,
): DocumentSession {
  let phase: DocumentSessionPhase = 'initializing'
  let currentCheckpoint: DocumentCheckpoint | null = null
  let savedCheckpoint: DocumentCheckpoint | null = null
  let documentId = initialDocumentId
  let activeSave: DocumentSaveTicket | null = null
  let nextSaveId = 1

  function assertNotClosed() {
    if (phase === 'closing' || phase === 'closed') {
      throw new Error('DOCUMENT_SESSION_NOT_ACTIVE')
    }
  }

  function requireInitialized() {
    if (!currentCheckpoint || !savedCheckpoint) {
      throw new Error('DOCUMENT_SESSION_NOT_INITIALIZED')
    }
  }

  function requireActiveTicket(ticket: DocumentSaveTicket) {
    if (!activeSave || activeSave.id !== ticket.id) {
      throw new Error('DOCUMENT_SESSION_STALE_SAVE_TICKET')
    }
  }

  function isDirty() {
    return (
      currentCheckpoint !== null &&
      savedCheckpoint !== null &&
      !checkpointsEqual(currentCheckpoint, savedCheckpoint)
    )
  }

  function persistence(): DocumentPersistenceState {
    if (phase === 'saving') return 'saving'
    if (phase === 'save-failed') return 'failed'
    return isDirty() ? 'dirty' : 'clean'
  }

  return {
    initialize(snapshot) {
      assertNotClosed()

      if (phase !== 'initializing') {
        throw new Error('DOCUMENT_SESSION_ALREADY_INITIALIZED')
      }

      const checkpoint = createDocumentCheckpoint(snapshot)
      currentCheckpoint = checkpoint
      savedCheckpoint = checkpoint
      phase = 'ready'
    },

    recordDocumentChange(snapshot) {
      assertNotClosed()
      requireInitialized()

      currentCheckpoint = createDocumentCheckpoint(snapshot)

      if (phase === 'save-failed') {
        phase = 'ready'
      }
    },

    beginSave(snapshot) {
      assertNotClosed()
      requireInitialized()

      if (phase === 'saving') {
        throw new Error('DOCUMENT_SESSION_SAVE_ALREADY_ACTIVE')
      }

      currentCheckpoint = createDocumentCheckpoint(snapshot)

      const ticket: DocumentSaveTicket = {
        id: nextSaveId,
        checkpoint: currentCheckpoint,
      }

      nextSaveId += 1
      activeSave = ticket
      phase = 'saving'

      return ticket
    },

    completeSave(ticket, nextDocumentId) {
      assertNotClosed()
      requireActiveTicket(ticket)

      savedCheckpoint = ticket.checkpoint
      documentId = nextDocumentId
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
        throw new Error('DOCUMENT_SESSION_SAVE_IN_PROGRESS')
      }

      phase = 'closing'
    },

    completeClosing() {
      if (phase !== 'closing') {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phase = 'closed'
    },

    isInitialized() {
      return currentCheckpoint !== null && savedCheckpoint !== null
    },

    isDirty,

    getPhase() {
      return phase
    },

    getDocumentId() {
      return documentId
    },

    getSnapshot() {
      return {
        phase,
        persistence: persistence(),
        documentId,
      }
    },
  }
}
`

const documentService = `import type {
  EditorSession,
  EditorSessionRegistry,
} from '@hybrid-canvas/canvas/application'
import type { HybridCanvasExtension } from '@hybrid-canvas/canvas/extensions'
import { parseDrawDocument, serializeDrawDocument } from '@hybrid-canvas/file'
import type { TLEditorSnapshot } from 'tldraw'

import {
  createDocumentSession,
  type DocumentPersistenceState,
  type DocumentSaveTicket,
  type DocumentSession,
} from '../domain/document-session'
import type {
  EditorDocumentEvent,
  EditorDocumentPort,
} from '../ports/editor-document-port'

export type CanvasId = string
export type CanvasSessionId = string
export type CanvasPersistenceState = DocumentPersistenceState

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
  readonly requestClose: (sessionId: CanvasSessionId) => CanvasCloseDecision
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly planApplicationClose: () => ApplicationClosePlan
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void
}

export interface CanvasEditorSessionRegistryPort {
  readonly create: EditorSessionRegistry['create']
  readonly close: EditorSessionRegistry['close']
  readonly dispose: EditorSessionRegistry['dispose']
}

export interface OpenedNativeDocument {
  readonly id: string
  readonly displayName: string
  readonly content: string
}

export interface SavedNativeDocument {
  readonly id: string
  readonly displayName: string
}

export interface DocumentPersistencePort {
  readonly open: () => Promise<OpenedNativeDocument | null>
  readonly save: (documentId: string, content: string) => Promise<void>
  readonly saveAs: (
    content: string,
    options: {
      readonly documentId?: string
      readonly suggestedName?: string
    },
  ) => Promise<SavedNativeDocument | null>
  readonly close: (documentId: string) => Promise<void>
}

export interface CreateCanvasDocumentServiceDependencies {
  readonly editorSessions: CanvasEditorSessionRegistryPort
  readonly persistence: DocumentPersistencePort
  readonly extensions: readonly HybridCanvasExtension[]
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
  extensions,
}: CreateCanvasDocumentServiceDependencies): CanvasDocumentService {
  const sessions = new Map<CanvasSessionId, OwnedCanvasSession>()
  const listeners = new Set<() => void>()
  let version = 0

  function emit() {
    version += 1

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

    sessions.set(sessionId, createOwnedSession(editor, null))

    return { canvasId, sessionId, title }
  }

  async function open(): Promise<OpenedCanvasSession | null> {
    const opened = await persistence.open()

    if (!opened) {
      return null
    }

    const canvasId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const initialSnapshot = parseEditorSnapshot(opened.content)

    const editor = editorSessions.create({
      documentId: canvasId,
      sessionId,
      initialSnapshot,
      extensions,
    })

    sessions.set(sessionId, createOwnedSession(editor, opened.id))

    return {
      canvasId,
      sessionId,
      title: opened.displayName,
    }
  }

  function createOwnedSession(
    editor: EditorSession,
    documentId: string | null,
  ): OwnedCanvasSession {
    const editorDocument: EditorDocumentPort = editor
    const document = createDocumentSession(documentId)

    const owned: OwnedCanvasSession = {
      editor,
      editorDocument,
      document,
      stopObservingDocument: () => {},
      saveOperation: null,
    }

    owned.stopObservingDocument = editorDocument.subscribeDocumentEvents(
      (event) => {
        if (event.kind === 'ready') {
          if (!document.isInitialized()) {
            document.initialize(editorDocument.captureDocument())
            emit()
          }

          return
        }

        if (!document.isInitialized()) {
          throw new Error('DOCUMENT_CHANGE_BEFORE_EDITOR_READY')
        }

        document.recordDocumentChange(editorDocument.captureDocument())
        emit()
      },
    )

    return owned
  }

  function save(sessionId: CanvasSessionId): Promise<void> {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      return owned.saveOperation
    }

    owned.saveOperation = performSave(owned).finally(() => {
      owned.saveOperation = null
    })

    return owned.saveOperation
  }

  async function performSave(owned: OwnedCanvasSession): Promise<void> {
    if (!owned.document.isInitialized()) {
      throw new Error('DOCUMENT_SESSION_NOT_READY')
    }

    const snapshot = owned.editorDocument.captureDocument()
    const ticket = owned.document.beginSave(snapshot)

    emit()

    try {
      const content = serializeDrawDocument(snapshot)
      const currentDocumentId = owned.document.getDocumentId()

      const saved = currentDocumentId
        ? await saveExistingDocument(currentDocumentId, content)
        : await persistence.saveAs(content, {
            suggestedName: '未命名画布.draw',
          })

      if (!saved) {
        owned.document.failSave(ticket)
        emit()
        return
      }

      owned.document.completeSave(ticket, saved.id)
      emit()
    } catch (error) {
      owned.document.failSave(ticket)
      emit()
      throw error
    }
  }

  async function saveExistingDocument(
    documentId: string,
    content: string,
  ): Promise<SavedNativeDocument> {
    await persistence.save(documentId, content)

    return {
      id: documentId,
      displayName: '',
    }
  }

  function requestClose(sessionId: CanvasSessionId): CanvasCloseDecision {
    const owned = sessions.get(sessionId)

    if (!owned) {
      return { kind: 'not-found' }
    }

    if (owned.saveOperation) {
      return {
        kind: 'wait-for-save',
        operation: owned.saveOperation,
      }
    }

    const state = owned.document.getSnapshot().persistence

    if (state === 'dirty' || state === 'failed') {
      return {
        kind: 'confirm-discard',
        persistence: state,
      }
    }

    closeNow(sessionId, owned)

    return { kind: 'close-now' }
  }

  function discardAndClose(sessionId: CanvasSessionId) {
    const owned = requireSession(sessionId)

    if (owned.saveOperation) {
      throw new Error('CANVAS_SESSION_SAVE_IN_PROGRESS')
    }

    closeNow(sessionId, owned)
  }

  function closeNow(sessionId: CanvasSessionId, owned: OwnedCanvasSession) {
    owned.document.beginClosing()
    owned.document.completeClosing()

    const documentId = owned.document.getDocumentId()

    if (documentId) {
      void persistence.close(documentId)
    }

    owned.stopObservingDocument()
    sessions.delete(sessionId)
    editorSessions.close(sessionId)
    emit()
  }

  function planApplicationClose(): ApplicationClosePlan {
    const operations: Promise<void>[] = []
    const dirtySessionIds: CanvasSessionId[] = []

    for (const [sessionId, owned] of sessions) {
      if (owned.saveOperation) {
        operations.push(owned.saveOperation)
        continue
      }

      const state = owned.document.getSnapshot().persistence

      if (state === 'dirty' || state === 'failed') {
        dirtySessionIds.push(sessionId)
      }
    }

    if (operations.length > 0) {
      return { kind: 'wait-for-saves', operations }
    }

    if (dirtySessionIds.length > 0) {
      return { kind: 'confirm-discard', sessionIds: dirtySessionIds }
    }

    return { kind: 'close-now' }
  }

  function requireSession(sessionId: CanvasSessionId) {
    const owned = sessions.get(sessionId)

    if (!owned) {
      throw new Error('CANVAS_SESSION_NOT_FOUND')
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
      return sessions.get(sessionId)?.editor ?? null
    },

    getSessionSnapshot(sessionId) {
      const owned = sessions.get(sessionId)

      return owned
        ? {
            sessionId,
            persistence: owned.document.getSnapshot().persistence,
          }
        : null
    },

    getVersion() {
      return version
    },

    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },

    dispose() {
      for (const [sessionId, owned] of sessions) {
        const documentId = owned.document.getDocumentId()

        if (documentId) {
          void persistence.close(documentId)
        }

        owned.stopObservingDocument()
        editorSessions.close(sessionId)
      }

      sessions.clear()
      listeners.clear()
      editorSessions.dispose()
    },
  }
}

function parseEditorSnapshot(json: string): TLEditorSnapshot {
  try {
    return parseDrawDocument(json).content
  } catch (containerError) {
    try {
      const parsed: unknown = JSON.parse(json)

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'document' in parsed &&
        'session' in parsed
      ) {
        return parsed as TLEditorSnapshot
      }
    } catch {
      // Preserve the validated container error.
    }

    throw containerError
  }
}
`

const documentPublicApi = `export {
  type ApplicationClosePlan,
  type CanvasCloseDecision,
  type CanvasDocumentService,
  type CanvasEditorSessionRegistryPort,
  type CanvasId,
  type CanvasPersistenceState,
  type CanvasSessionId,
  type CanvasSessionSnapshot,
  type CreateCanvasDocumentServiceDependencies,
  createCanvasDocumentService,
  type DocumentPersistencePort,
  type OpenedCanvasSession,
  type OpenedNativeDocument,
  type SavedNativeDocument,
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

export type {
  EditorDocumentEvent,
  EditorDocumentPort,
} from './ports/editor-document-port'
`

const desktopApplication = `import { createEditorSessionRegistry } from '@hybrid-canvas/canvas/application'
import { createCanvasDocumentService } from '@hybrid-canvas/document'
import { flowchartExtension } from '@hybrid-canvas/flowchart'
import { freehandExtension } from '@hybrid-canvas/freehand'
import {
  createDesktopSettingsStore,
  createDocumentFileCommands,
  createMainWindowController,
  type MainWindowController,
  type SettingsStore,
} from '@hybrid-canvas/platforms-desktop-runtime'
import { scientificPlotExtension } from '@hybrid-canvas/scientific-plot'
import {
  type CommandRegistry,
  createCommandRegistry,
  createWorkbenchSessionController,
} from '@hybrid-canvas/workspace/application'
import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'
import {
  type CanvasWorkflow,
  createCanvasWorkflow,
} from '../application/canvas/canvas-workflow'
import {
  type ApplicationTerminationCoordinator,
  createApplicationTerminationCoordinator,
} from '../application/termination/application-termination-coordinator'

export interface CreateApplicationRuntimeOptions {
  readonly tldrawLicenseKey: string
}

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore
  readonly commands: CommandRegistry
  readonly canvases: CanvasWorkflow
  readonly termination: ApplicationTerminationCoordinator
  readonly mainWindow: MainWindowController
  readonly settings: SettingsStore
  readonly tldrawLicenseKey: string
  readonly dispose: () => void
}

export function createApplicationRuntime({
  tldrawLicenseKey,
}: CreateApplicationRuntimeOptions): ApplicationRuntime {
  const workspace = createWorkbenchSessionController()
  const commands = createCommandRegistry()
  const documentsGateway = createDocumentFileCommands()
  const mainWindow = createMainWindowController()
  const settings = createDesktopSettingsStore()
  const editorSessions = createEditorSessionRegistry()

  const documents = createCanvasDocumentService({
    editorSessions,
    persistence: documentsGateway,
    extensions: [
      flowchartExtension,
      freehandExtension,
      scientificPlotExtension,
    ],
  })

  const canvases = createCanvasWorkflow(documents, workspace)

  const termination = createApplicationTerminationCoordinator(canvases, {
    terminate: () => mainWindow.forceClose(),
  })

  return {
    workspace,
    commands,
    canvases,
    termination,
    mainWindow,
    settings,
    tldrawLicenseKey,

    dispose() {
      termination.dispose()
      canvases.dispose()
    },
  }
}
`

await Promise.all([
  write(files.documentSession, documentSession),
  write(files.documentService, documentService),
  write(files.documentPublicApi, documentPublicApi),
  write(files.desktopApplication, desktopApplication),
])

console.log('Document IPC 重构已写入：')
console.log('- editor/document/src/domain/document-session.ts')
console.log('- editor/document/src/application/canvas-document-service.ts')
console.log('- editor/document/src/public-api.ts')
console.log('- apps/desktop/src/bootstrap/application.ts')
console.log('')
console.log('执行：')
console.log('  pnpm format')
console.log('  pnpm typecheck')
console.log('  pnpm test')
console.log('  pnpm dev')