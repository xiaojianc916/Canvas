import { createTLStore } from '@tldraw/editor'
import type { Editor, TLStore, TLEditorSnapshot } from 'tldraw'

import {
  buildExtensionRegistration,
  type ExtensionRegistration,
  type HybridCanvasExtension,
} from '../react/extension-registry'

export interface CreateEditorSessionOptions {
  readonly sessionId: string
  readonly documentId: string
  readonly initialSnapshot?: TLEditorSnapshot
  readonly extensions?: readonly HybridCanvasExtension[]
}

export interface EditorSession {
  readonly sessionId: string
  readonly documentId: string
  readonly store: TLStore
  readonly registration: ExtensionRegistration
  readonly editor: Editor | null
  readonly attachEditor: (editor: Editor) => void
  readonly detachEditor: (editor: Editor) => void
  readonly getSnapshot: () => TLEditorSnapshot
  readonly dispose: () => void
}

export function createEditorSession(options: CreateEditorSessionOptions): EditorSession {
  const registration = buildExtensionRegistration(options.extensions)
  const store = createTLStore({
    ...(registration.shapeUtils.length > 0 ? { shapeUtils: registration.shapeUtils } : {}),
    ...(registration.bindingUtils.length > 0 ? { bindingUtils: registration.bindingUtils } : {}),
    ...(options.initialSnapshot ? { snapshot: options.initialSnapshot } : {}),
  })
  let attachedEditor: Editor | null = null
  let disposed = false

  function assertActive(): void {
    if (disposed) {
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
    attachEditor(editor) {
      assertActive()
      if (attachedEditor && attachedEditor !== editor) {
        throw new Error('EDITOR_SESSION_ALREADY_ATTACHED')
      }
      attachedEditor = editor
    },
    detachEditor(editor) {
      if (attachedEditor === editor) {
        attachedEditor = null
      }
    },
    getSnapshot() {
      assertActive()
      return attachedEditor?.getSnapshot() ?? store.getStoreSnapshot()
    },
    dispose() {
      attachedEditor = null
      disposed = true
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
