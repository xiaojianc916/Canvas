import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { AppShell } from '../presentation/AppShell'
import { ApplicationErrorBoundary } from './ApplicationErrorBoundary'
import { createApplicationRuntime } from './application'

export interface MountedReactApplication {
  readonly runtime: ReturnType<typeof createApplicationRuntime>
  readonly unmount: () => void
}

export function mountReactApplication(container: HTMLElement): MountedReactApplication {
  const runtime = createApplicationRuntime()
  const root: Root = createRoot(container)

  root.render(
    <ApplicationErrorBoundary>
      <AppShell runtime={runtime} />
    </ApplicationErrorBoundary>,
  )

  return {
    runtime,
    unmount() {
      root.unmount()
      runtime.dispose()
    },
  }
}
