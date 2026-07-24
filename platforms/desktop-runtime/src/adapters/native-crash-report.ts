import {
  commands,
  type NativeCrashReport,
} from '@hybrid-canvas/desktop-ipc'

export type { NativeCrashReport }

export async function takePreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  if (!isTauriRuntime()) {
    return null
  }

  return commands.diagnosticsTakePreviousCrash()
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  )
}
