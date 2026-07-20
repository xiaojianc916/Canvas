import { createRoot } from 'react-dom/client'
import { ApplicationErrorBoundary } from './ApplicationErrorBoundary'
import { createApplicationRuntime } from './application'
import { ApplicationRuntimeProvider } from './react-providers'
const runtime = createApplicationRuntime()

export async function mountReactApplication(container: HTMLElement): Promise<void> {
  const { AppShell } = await import('./app-shell')

  createRoot(container).render(
    <ApplicationErrorBoundary>
      <ApplicationRuntimeProvider runtime={runtime}>
        <AppShell />
      </ApplicationRuntimeProvider>
    </ApplicationErrorBoundary>,
  )
}
