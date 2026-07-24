import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from 'tldraw'

import type { ExtensionRegistration } from '../contracts/public-api'
import { CanvasInspectorPortalProvider } from './canvas-inspector-portal'

export type { ExtensionRegistration } from '../contracts/public-api'

interface EditorContextValue {
  readonly editor: Editor | null
  readonly registration: ExtensionRegistration | null
  readonly licenseKey: string
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

export interface EditorProviderProps {
  readonly children: ReactNode
  readonly licenseKey: string
}

export function EditorProvider({ children, licenseKey }: EditorProviderProps) {
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
      licenseKey,
      bindSession,
      unbindSession,
    }),
    [session, licenseKey, bindSession, unbindSession],
  )

  return (
    <EditorCtx.Provider value={value}>
      <CanvasInspectorPortalProvider>{children}</CanvasInspectorPortalProvider>
    </EditorCtx.Provider>
  )
}

export function useEditor(): Editor | null {
  return useContext(EditorCtx)?.editor ?? null
}

export function useTldrawLicenseKey(): string {
  const licenseKey = useContext(EditorCtx)?.licenseKey

  if (!licenseKey) {
    throw new Error('TLDRAW_LICENSE_KEY_NOT_CONFIGURED')
  }

  return licenseKey
}

export function useExtensionRegistration(): ExtensionRegistration | null {
  return useContext(EditorCtx)?.registration ?? null
}

export function useBindEditorSession(
  editor: Editor | null,
  registration: ExtensionRegistration | null,
): void {
  const ctx = useContext(EditorCtx)
  const bindSession = ctx?.bindSession
  const unbindSession = ctx?.unbindSession
  const owner = useRef(Symbol('editor-session-owner'))

  useEffect(() => {
    if (!bindSession || !unbindSession || !editor || !registration) {
      return
    }

    const currentOwner = owner.current
    bindSession(currentOwner, editor, registration)

    return () => unbindSession(currentOwner)
  }, [editor, registration, bindSession, unbindSession])
}
