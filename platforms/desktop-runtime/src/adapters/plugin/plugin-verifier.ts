import { invoke } from '@hybrid-canvas/desktop-ipc'
import type { PluginVerifier } from '@hybrid-canvas/plugin'

export function createDesktopPluginVerifier(): PluginVerifier {
  return {
    verify: (packagePath: string) => invoke('plugin_verify', { packagePath }),
  }
}
