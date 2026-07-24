import { type ReactNode, useSyncExternalStore } from 'react'
import { fatalIncidentController } from './fatal-runtime'
import { FatalErrorBoundary } from './FatalErrorBoundary'
import { FatalErrorScreen } from './FatalErrorScreen'

export interface FatalErrorHostProps {
  readonly children: ReactNode
}

export function FatalErrorHost({ children }: FatalErrorHostProps) {
  const snapshot = useSyncExternalStore(
    fatalIncidentController.subscribe,
    fatalIncidentController.getSnapshot,
    fatalIncidentController.getSnapshot,
  )

  if (snapshot.status === 'fatal') {
    return (
      <FatalErrorScreen
        additionalIncidentCount={snapshot.additionalIncidentCount}
        incident={snapshot.incident}
      />
    )
  }

  return <FatalErrorBoundary>{children}</FatalErrorBoundary>
}
