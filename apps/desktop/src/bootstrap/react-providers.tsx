import { createContext, type ReactNode, useContext } from 'react'

import type { ApplicationRuntime } from './application'

const ApplicationRuntimeContext = createContext<ApplicationRuntime | null>(null)

export interface ApplicationRuntimeProviderProps {
  readonly runtime: ApplicationRuntime
  readonly children: ReactNode
}

export function ApplicationRuntimeProvider({ runtime, children }: ApplicationRuntimeProviderProps) {
  return (
    <ApplicationRuntimeContext.Provider value={runtime}>
      {children}
    </ApplicationRuntimeContext.Provider>
  )
}

export function useApplicationRuntime(): ApplicationRuntime {
  const runtime = useContext(ApplicationRuntimeContext)
  if (!runtime) {
    throw new Error('ApplicationRuntimeProvider is missing from the React tree.')
  }
  return runtime
}
