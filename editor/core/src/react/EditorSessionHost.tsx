import type { EditorSession } from '../runtime/editor-session'
import { EditorCanvas } from './EditorCanvas'

export interface EditorSessionHostEntry {
  readonly sessionId: string
  readonly session: EditorSession
}

export interface EditorSessionHostProps {
  readonly activeSessionId: string | null
  readonly sessions: readonly EditorSessionHostEntry[]
  readonly onSave?: (sessionId: string) => void
}

export function EditorSessionHost({ activeSessionId, sessions, onSave }: EditorSessionHostProps) {
  if (sessions.length === 0) {
    return null
  }

  return (
    <div className="relative size-full overflow-hidden">
      {sessions.map(({ sessionId, session }) => {
        const isActive = sessionId === activeSessionId
        return (
          <div
            key={sessionId}
            aria-hidden={!isActive}
            className={
              isActive
                ? 'absolute inset-0 z-10'
                : 'pointer-events-none absolute inset-0 invisible z-0'
            }
            data-session-id={sessionId}
          >
            <EditorCanvas
              isActive={isActive}
              session={session}
              {...(onSave ? { onSave: () => onSave(sessionId) } : {})}
            />
          </div>
        )
      })}
    </div>
  )
}
