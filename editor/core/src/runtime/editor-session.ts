import { createTLStore, getSnapshot as getStoreEditorSnapshot } from '@tldraw/editor'
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

export type EditorSessionState = 'created' | 'attached' | 'detached' | 'disposed'

/**
 * Stable application-level error for a persisted snapshot that tldraw cannot
 * migrate, validate or load using the complete extension-aware store schema.
 *
 * The original error intentionally remains private: it can contain tldraw
 * implementation details and record content that must not become a UI/API
 * contract.
 */
export class PersistedSnapshotLoadError extends Error {
  readonly code = 'DRAW_INVALID_SNAPSHOT'

  constructor() {
    super('DRAW_INVALID_SNAPSHOT')
    this.name = 'PersistedSnapshotLoadError'
  }
}

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

  readonly attachEditor: (editor: Editor) => void

  readonly detachEditor: (editor: Editor) => void

  readonly getSnapshot: () => TLEditorSnapshot

  /**
   * Explicit document persistence adapter consumed structurally by
   * editor/document's EditorDocumentPort.
   */
  readonly captureDocument: () => TLEditorSnapshot

  readonly subscribeDocumentEvents: (listener: (event: EditorDocumentEvent) => void) => () => void

  readonly getSessionSnapshot: () => EditorSessionSnapshot
  readonly subscribe: (listener: () => void) => () => void

  readonly createPage: (title: string) => void

  readonly activatePage: (pageId: string) => void

  readonly dispose: () => void
}

export function createEditorSession(options: CreateEditorSessionOptions): EditorSession {
  const registration = buildExtensionRegistration(options.extensions)

  /*
   * Persisted documents enter through tldraw's canonical store-construction
   * pipeline. The factory builds the complete schema from default and extension
   * utilities, then migrates and loads the snapshot before a session exists.
   *
   * Do not reintroduce a post-construction loadSnapshot call here. That creates
   * a second initialization path with subtly different migration and session
   * state semantics.
   */
  const store = createValidatedEditorStore(
    registration,
    options.initialSnapshot,
  )

  let attachedEditor: Editor | null = null
  let state: EditorSessionState = 'created'
  let documentReady = false

  const sessionListeners = new Set<() => void>()

  const documentListeners = new Set<(event: EditorDocumentEvent) => void>()

  let sessionSnapshot: EditorSessionSnapshot = {
    pages: [],
  }

  function assertActive(): void {
    if (state === 'disposed') {
      throw new Error('EDITOR_SESSION_DISPOSED')
    }
  }

  function requireAttachedEditor(): Editor {
    assertActive()

    if (state !== 'attached' || !attachedEditor) {
      throw new Error('EDITOR_SESSION_NOT_ATTACHED')
    }

    return attachedEditor
  }

  function captureDocument(): TLEditorSnapshot {
    assertActive()

    return attachedEditor?.getSnapshot() ?? getStoreEditorSnapshot(store)
  }

  function createSessionSnapshot(): EditorSessionSnapshot {
    if (!attachedEditor) {
      return {
        pages: [],
      }
    }

    const activePageId = attachedEditor.getCurrentPageId()

    return {
      pages: attachedEditor.getPages().map((page) => ({
        id: page.id,
        title: page.name,
        isActive: page.id === activePageId,
      })),
    }
  }

  function publishSessionSnapshot(): void {
    sessionSnapshot = createSessionSnapshot()

    for (const listener of sessionListeners) {
      listener()
    }
  }

  function publishDocumentEvent(event: EditorDocumentEvent): void {
    for (const listener of documentListeners) {
      listener(event)
    }
  }

  const stopObservingSession = store.listen(publishSessionSnapshot, {
    scope: 'document',
  })

  /*
   * Persistable change observation is armed only after attachEditor declares
   * the mounted tldraw Editor ready. No timer, microtask or record-type
   * heuristic is used.
   */
  const stopObservingDocument = store.listen(
    () => {
      if (state !== 'attached' || !documentReady) {
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

      if (attachedEditor && attachedEditor !== editor) {
        throw new Error('EDITOR_SESSION_ALREADY_ATTACHED')
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
      const normalizedTitle = title.trim()

      if (!normalizedTitle) {
        throw new Error('EDITOR_PAGE_TITLE_REQUIRED')
      }

      const editor = requireAttachedEditor()

      editor.createPage({
        name: normalizedTitle,
      })
    },

    activatePage(pageId) {
      const editor = requireAttachedEditor()
      const page = editor.getPages().find((candidate) => candidate.id === pageId)

      if (!page) {
        throw new Error('EDITOR_PAGE_NOT_FOUND')
      }

      editor.setCurrentPage(page)
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

function createValidatedEditorStore(
  registration: ExtensionRegistration,
  initialSnapshot: TLEditorSnapshot | undefined,
): TLStore {
  try {
    return createTLStore({
      shapeUtils: [
        ...defaultShapeUtils,
        ...registration.shapeUtils,
      ] as unknown as readonly TLAnyShapeUtilConstructor[],
      bindingUtils: [...defaultBindingUtils, ...registration.bindingUtils],
      ...(initialSnapshot
        ? { snapshot: initialSnapshot }
        : {}),
    })
  } catch {
    /*
     * tldraw performs schema migration, record validation and store integrity
     * checks here. A failed load must never expose a partially created store or
     * leak library-specific error text across the application boundary.
     */
    throw new PersistedSnapshotLoadError()
  }
}

export interface EditorSessionRegistry {
  readonly create: (options: CreateEditorSessionOptions) => EditorSession

  readonly get: (sessionId: string) => EditorSession | null

  readonly require: (sessionId: string) => EditorSession

  readonly close: (sessionId: string) => void

  readonly dispose: () => void
}

export function createEditorSessionRegistry(): EditorSessionRegistry {
  const sessions = new Map<string, EditorSession>()

  return {
    create(options) {
      if (sessions.has(options.sessionId)) {
        throw new Error('EDITOR_SESSION_DUPLICATE_ID')
      }

      const session = createEditorSession(options)

      sessions.set(options.sessionId, session)

      return session
    },

    get(sessionId) {
      return sessions.get(sessionId) ?? null
    },

    require(sessionId) {
      const session = sessions.get(sessionId)

      if (!session) {
        throw new Error('EDITOR_SESSION_NOT_FOUND')
      }

      return session
    },

    close(sessionId) {
      const session = sessions.get(sessionId)

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
