import { createTLStore, getSnapshot as getStoreEditorSnapshot, loadSnapshot } from '@tldraw/editor'
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

export interface CreateEditorSessionOptions {
  readonly sessionId: string
  readonly documentId: string
  readonly initialSnapshot?: TLEditorSnapshot
  readonly extensions?: readonly HybridCanvasExtension[]
}

export type EditorSessionState = 'created' | 'attached' | 'detached' | 'disposed'

export interface CanvasPageSnapshot {
  readonly id: string
  readonly title: string
  readonly isActive: boolean
}

export interface EditorSessionSnapshot {
  readonly pages: readonly CanvasPageSnapshot[]
}

/**
 * A document change is classified at the editor boundary.
 *
 * "baseline-established" is emitted only while tldraw creates the initial
 * document/page records for a new empty store. It establishes the canonical
 * clean savepoint and must never be presented as a user edit.
 *
 * "content-changed" means persistable TLStore document content may differ
 * from the current savepoint. Consumers must compare fingerprints rather
 * than treating the notification itself as proof that the document is dirty.
 */
export type EditorDocumentChange =
  | {
      readonly kind: 'baseline-established'
      readonly fingerprint: string
    }
  | {
      readonly kind: 'content-changed'
      readonly fingerprint: string
    }

export interface EditorPersistenceCapture {
  readonly snapshot: TLEditorSnapshot
  readonly fingerprint: string
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
  readonly getSessionSnapshot: () => EditorSessionSnapshot
  readonly subscribe: (listener: () => void) => () => void

  /**
   * Observes persistable TLStore document changes.
   *
   * Runtime/session records such as camera, selection and tool state are
   * excluded by the document scope.
   */
  readonly onDocumentChange: (listener: (change: EditorDocumentChange) => void) => () => void

  /**
   * Captures the serialized editor snapshot and its document fingerprint
   * from the same synchronous read boundary.
   */
  readonly capturePersistenceSnapshot: () => EditorPersistenceCapture

  readonly getDocumentFingerprint: () => string
  readonly createPage: (title: string) => void
  readonly activatePage: (pageId: string) => void
  readonly dispose: () => void
}

export function createEditorSession(options: CreateEditorSessionOptions): EditorSession {
  const registration = buildExtensionRegistration(options.extensions)
  const store = createTLStore({
    shapeUtils: [
      ...defaultShapeUtils,
      ...registration.shapeUtils,
    ] as unknown as readonly TLAnyShapeUtilConstructor[],
    bindingUtils: [...defaultBindingUtils, ...registration.bindingUtils],
  })

  if (options.initialSnapshot) {
    loadSnapshot(store, options.initialSnapshot)
  }

  /*
   * Establish the canonical tldraw document baseline before any
   * persistence observer is registered.
   *
   * Otherwise tldraw may create the default document/page records
   * during editor mounting and those bootstrap records can be
   * misclassified as user edits.
   */

  /*
   * Establish the canonical tldraw document baseline before
   * persistence observers are registered.
   *
   * Without this step, tldraw may create the initial document,
   * page, instance, camera and page-state records during editor
   * mounting. Those bootstrap records can then be misclassified
   * as user edits.
   */
  establishStoreBaseline(store)

  let attachedEditor: Editor | null = null
  let state: EditorSessionState = 'created'

  /*
   * A store without an initial snapshot is completed by tldraw during its
   * first mount. Until both the document and first page exist, document/page
   * bootstrap writes establish the clean baseline rather than dirtying it.
   */
  let bootstrapPending = options.initialSnapshot === undefined

  const listeners = new Set<() => void>()

  let sessionSnapshot: EditorSessionSnapshot = {
    pages: [],
  }

  function createSessionSnapshot(): EditorSessionSnapshot {
    const editor = attachedEditor

    if (!editor) {
      return {
        pages: [],
      }
    }

    const activePageId = editor.getCurrentPageId()

    return {
      pages: editor.getPages().map((page) => ({
        id: page.id,
        title: page.name,
        isActive: page.id === activePageId,
      })),
    }
  }

  function publishSessionSnapshot(): void {
    sessionSnapshot = createSessionSnapshot()

    for (const listener of listeners) {
      listener()
    }
  }

  const stopObserving = store.listen(publishSessionSnapshot, { scope: 'document' })

  function assertActive(): void {
    if (state === 'disposed') {
      throw new Error('EDITOR_SESSION_DISPOSED')
    }
  }

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
      publishSessionSnapshot()
    },
    detachEditor(editor) {
      if (attachedEditor === editor) {
        attachedEditor = null
        state = 'detached'
        publishSessionSnapshot()
      }
    },
    getSnapshot() {
      assertActive()
      return attachedEditor?.getSnapshot() ?? getStoreEditorSnapshot(store)
    },
    getSessionSnapshot() {
      return sessionSnapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onDocumentChange(listener) {
      assertActive()

      return store.listen(
        (entry) => {
          const fingerprint = createDocumentFingerprint(
            attachedEditor?.getSnapshot() ?? getStoreEditorSnapshot(store),
          )

          if (bootstrapPending && isInitialDocumentBootstrapChange(entry)) {
            listener({
              kind: 'baseline-established',
              fingerprint,
            })

            if (hasInitialDocumentAndPage(store)) {
              bootstrapPending = false
            }

            return
          }

          /*
           * If the first observed batch already contains real content, it is
           * a genuine edit even when tldraw included bootstrap records in the
           * same transaction.
           */
          bootstrapPending = false

          listener({
            kind: 'content-changed',
            fingerprint,
          })
        },
        {
          scope: 'document',
        },
      )
    },
    capturePersistenceSnapshot() {
      assertActive()

      const snapshot = attachedEditor?.getSnapshot() ?? getStoreEditorSnapshot(store)

      return {
        snapshot,
        fingerprint: createDocumentFingerprint(snapshot),
      }
    },
    getDocumentFingerprint() {
      assertActive()

      return createDocumentFingerprint(
        attachedEditor?.getSnapshot() ?? getStoreEditorSnapshot(store),
      )
    },
    createPage(title) {
      assertActive()
      attachedEditor?.createPage({ name: title })
    },
    activatePage(pageId) {
      assertActive()
      const page = attachedEditor?.getPages().find((candidate) => candidate.id === pageId)
      if (attachedEditor && page) {
        attachedEditor.setCurrentPage(page)
      }
    },
    dispose() {
      stopObserving()
      listeners.clear()
      attachedEditor = null
      state = 'disposed'
    },
  }
}

/**
 * Returns true only for tldraw's initial document/page construction.
 *
 * A batch containing a shape, binding, asset or any removal is never treated
 * as bootstrap work. This avoids timing-based setTimeout/requestAnimationFrame
 * heuristics and keeps fast real user edits observable.
 */
function isInitialDocumentBootstrapChange(entry: unknown): boolean {
  if (!isRecord(entry)) {
    return false
  }

  const changes = entry['changes']

  if (!isRecord(changes)) {
    return false
  }

  const removedValue = changes['removed']
  const removed = isRecord(removedValue)
    ? Object.values(removedValue)
    : []

  if (removed.length > 0) {
    return false
  }

  const addedValue = changes['added']
  const added = isRecord(addedValue)
    ? Object.values(addedValue)
    : []

  const updatedValue = changes['updated']
  const updatedValues = isRecord(updatedValue)
    ? Object.values(updatedValue)
    : []

  const updated = updatedValues.flatMap((value) =>
    Array.isArray(value) ? value : [value],
  )

  const affectedRecords = [...added, ...updated].filter(isRecord)

  if (affectedRecords.length === 0) {
    return false
  }

  return affectedRecords.every((record) => {
    const typeName = record['typeName']

    return typeName === 'document' || typeName === 'page'
  })
}

function hasInitialDocumentAndPage(store: TLStore): boolean {
  let hasDocument = false
  let hasPage = false

  for (const record of store.allRecords()) {
    if (record['typeName'] === 'document') {
      hasDocument = true
    } else if (record['typeName'] === 'page') {
      hasPage = true
    }

    if (hasDocument && hasPage) {
      return true
    }
  }

  return false
}

/**
 * Dirty state is based only on the canonical persistable document snapshot.
 *
 * Session state such as camera, selection, active tool and viewport is not
 * included, so ordinary navigation cannot trigger an unsaved-changes prompt.
 */
function createDocumentFingerprint(snapshot: TLEditorSnapshot): string {
  return stableStringify(snapshot.document)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(null)
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableStringify(item)).join(',') + ']'
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))

    return (
      '{' +
      entries.map(([key, item]) => JSON.stringify(key) + ':' + stableStringify(item)).join(',') +
      '}'
    )
  }

  return JSON.stringify(null)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

/*
 * tldraw does not expose this integrity operation through the
 * public TLStore TypeScript surface, although it exists on the
 * version-locked runtime Store implementation.
 *
 * Keep this compatibility boundary local and fail explicitly if
 * a future tldraw version removes the runtime capability.
 */
type IntegrityCapableTLStore = TLStore & {
  ensureStoreIsUsable?: () => void
}

function establishStoreBaseline(store: TLStore): void {
  const integrityCapableStore = store as IntegrityCapableTLStore

  if (typeof integrityCapableStore.ensureStoreIsUsable !== 'function') {
    throw new Error('TLDRAW_STORE_INTEGRITY_API_UNAVAILABLE')
  }

  integrityCapableStore.ensureStoreIsUsable()
}
