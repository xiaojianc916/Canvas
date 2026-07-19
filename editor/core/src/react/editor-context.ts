import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from 'tldraw'

interface EditorContextValue {
  readonly editor: Editor | null
  readonly setEditor: (editor: Editor | null) => void
}

const EditorCtx = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { readonly children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  return <EditorCtx.Provider value={{ editor, setEditor }}>{children}</EditorCtx.Provider>
}

export function useEditor(): Editor | null {
  const ctx = useContext(EditorCtx)
  if (!ctx) return null
  return ctx.editor
}

export function useBindEditor(editor: Editor | null): void {
  const ctx = useContext(EditorCtx)
  const prevRef = useRef<Editor | null>(null)

  useEffect(() => {
    if (!ctx || prevRef.current === editor) return
    prevRef.current = editor
    ctx.setEditor(editor)
    return () => {
      if (ctx.editor === editor) {
        ctx.setEditor(null)
      }
    }
  }, [editor, ctx])
}
