import { invoke } from '@hybrid-canvas/desktop-ipc'
import type { PluginVerifier } from '@hybrid-canvas/domain-plugin'

export function createDesktopPluginVerifier(): PluginVerifier {
  return {
    verify: (packagePath) => invoke('plugin_verify', { packagePath }),
  }
}
