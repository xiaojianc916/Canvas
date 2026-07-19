import { createTLStore, getSnapshot } from '@tldraw/editor'
import type { Editor, TLEditorSnapshot } from 'tldraw'

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
  readonly store: ReturnType<typeof createTLStore>
  readonly registration: ExtensionRegistration
  readonly getEditor: () => Editor | null
  readonly attachEditor: (editor: Editor) => () => void
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
  let editor: Editor | null = null
  let disposed = false

  function ensureActive(): void {
    if (disposed) {
      throw new Error('EDITOR_SESSION_DISPOSED')
    }
  }

  return {
    sessionId: options.sessionId,
    documentId: options.documentId,
    store,
    registration,
    getEditor() {
      return editor
    },
    attachEditor(nextEditor) {
      ensureActive()
      if (editor && editor !== nextEditor) {
        throw new Error('EDITOR_SESSION_ALREADY_ATTACHED')
      }
      editor = nextEditor
      return () => {
        if (editor === nextEditor) {
          editor = null
        }
      }
    },
    getSnapshot() {
      ensureActive()
      return editor?.getSnapshot() ?? getSnapshot(store)
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      editor = null
    },
  }
}
