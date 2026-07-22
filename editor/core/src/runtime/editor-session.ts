import { createTLStore, getSnapshot as getStoreEditorSnapshot, loadSnapshot } from '@tldraw/editor'
import type { Editor, TLEditorSnapshot, TLStore } from 'tldraw'

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
  readonly onUserDocumentChange: (listener: () => void) => () => void
  readonly createPage: (title: string) => void
  readonly activatePage: (pageId: string) => void
  readonly dispose: () => void
}

export function createEditorSession(options: CreateEditorSessionOptions): EditorSession {
  const registration = buildExtensionRegistration(options.extensions)
  const store = createTLStore({
    shapeUtils: registration.shapeUtils,
    bindingUtils: registration.bindingUtils,
  })
  if (options.initialSnapshot) {
    loadSnapshot(store, options.initialSnapshot)
  }
  let attachedEditor: Editor | null = null
  let state: EditorSessionState = 'created'
  const listeners = new Set<() => void>()
  const stopObserving = store.listen(
    () => {
      for (const listener of listeners) {
        listener()
      }
    },
    { scope: 'document' },
  )

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
    },
    detachEditor(editor) {
      if (attachedEditor === editor) {
        attachedEditor = null
        state = 'detached'
      }
    },
    getSnapshot() {
      assertActive()
      return attachedEditor?.getSnapshot() ?? getStoreEditorSnapshot(store)
    },
    getSessionSnapshot() {
      const editor = attachedEditor
      if (!editor) {
        return { pages: [] }
      }
      const activePageId = editor.getCurrentPageId()
      return {
        pages: editor.getPages().map((page) => ({
          id: page.id,
          title: page.name,
          isActive: page.id === activePageId,
        })),
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onUserDocumentChange(listener) {
      assertActive()
      return store.listen(listener, { scope: 'document', source: 'user' })
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
