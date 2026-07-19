import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from 'tldraw'

import type { ExtensionRegistration } from './extension-registry'

interface EditorContextValue {
  readonly editor: Editor | null
  readonly registration: ExtensionRegistration | null
  readonly bindSession: (
    editor: Editor | null,
    registration: ExtensionRegistration | null,
  ) => void
}

const EditorCtx = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<{
    readonly editor: Editor | null
    readonly registration: ExtensionRegistration | null
  }>({ editor: null, registration: null })
  const bindSession = useCallback((
    editor: Editor | null,
    registration: ExtensionRegistration | null,
  ) => {
    setSession({ editor, registration })
  }, [])
  const value = useMemo<EditorContextValue>(() => ({
    ...session,
    bindSession,
  }), [session, bindSession])

  return <EditorCtx.Provider value={value}>{children}</EditorCtx.Provider>
}

export function useEditor(): Editor | null {
  return useContext(EditorCtx)?.editor ?? null
}

export function useExtensionRegistration(): ExtensionRegistration | null {
  return useContext(EditorCtx)?.registration ?? null
}

export function useBindEditorSession(
  editor: Editor | null,
  registration: ExtensionRegistration | null,
): void {
  const ctx = useContext(EditorCtx)

  useEffect(() => {
    if (!ctx) return
    ctx.bindSession(editor, registration)
    return () => ctx.bindSession(null, null)
  }, [editor, registration, ctx])
}
