import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from 'tldraw'

import type { ExtensionRegistration } from '../contracts/public-api'

export type { ExtensionRegistration } from '../contracts/public-api'

interface EditorContextValue {
  readonly editor: Editor | null
  readonly registration: ExtensionRegistration | null
}

interface EditorBindingContextValue extends EditorContextValue {
  readonly bindSession: (
    owner: symbol,
    editor: Editor | null,
    registration: ExtensionRegistration | null,
  ) => void
  readonly unbindSession: (owner: symbol) => void
}

const EditorCtx = createContext<EditorBindingContextValue | null>(null)

export function EditorProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<{
    readonly editor: Editor | null
    readonly registration: ExtensionRegistration | null
  }>({ editor: null, registration: null })
  const activeOwner = useRef<symbol | null>(null)
  const bindSession = useCallback(
    (nextOwner: symbol, editor: Editor | null, registration: ExtensionRegistration | null) => {
      activeOwner.current = nextOwner
      setSession({ editor, registration })
    },
    [],
  )
  const unbindSession = useCallback((releasingOwner: symbol) => {
    if (activeOwner.current !== releasingOwner) {
      return
    }
    activeOwner.current = null
    setSession({ editor: null, registration: null })
  }, [])
  const value = useMemo<EditorBindingContextValue>(
    () => ({
      ...session,
      bindSession,
      unbindSession,
    }),
    [session, bindSession, unbindSession],
  )

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
  const owner = useRef(Symbol('editor-session-owner'))

  useEffect(() => {
    if (!ctx) {
      return
    }
    const currentOwner = owner.current
    ctx.bindSession(currentOwner, editor, registration)
    return () => ctx.unbindSession(currentOwner)
  }, [editor, registration, ctx])
}
