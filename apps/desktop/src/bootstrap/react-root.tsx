import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'
import { AppShell } from '../presentation/AppShell'
import { ApplicationErrorBoundary } from './ApplicationErrorBoundary'
import { createApplicationRuntime } from './application'

export interface MountedReactApplication {
  readonly runtime: ReturnType<typeof createApplicationRuntime>
  readonly unmount: () => void
}

export function mountReactApplication(container: HTMLElement): MountedReactApplication {
  const runtime = createApplicationRuntime({
    tldrawLicenseKey: readTldrawLicenseKey(),
  })
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

function readTldrawLicenseKey(): string {
  const licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY?.trim()

  if (!licenseKey) {
    throw new Error('VITE_TLDRAW_LICENSE_KEY_MISSING')
  }

  return licenseKey
}
