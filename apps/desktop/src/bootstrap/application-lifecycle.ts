import { error as reportError } from '@hybrid-canvas/foundations-observability'
import type { ApplicationRuntime } from './application'
import type { MountedReactApplication } from './react-root'

export interface ApplicationLifecycle {
  readonly dispose: () => void
}

export function installApplicationLifecycle(
  runtime: ApplicationRuntime,
  mounted: MountedReactApplication,
): ApplicationLifecycle {
  let disposed = false

  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    window.removeEventListener('pagehide', dispose)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    mounted.unmount()
  }

  const handleBeforeUnload = () => {
    void runtime.mainWindow.saveState().catch((cause: unknown) => {
      reportError('main window state save failed during unload', {
        scope: 'application-lifecycle',
        operation: 'save-window-state',
        cause,
      })
    })
  }

  window.addEventListener('pagehide', dispose, { once: true })
  window.addEventListener('beforeunload', handleBeforeUnload)

  return { dispose }
}
