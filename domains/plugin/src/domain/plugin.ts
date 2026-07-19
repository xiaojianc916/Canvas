export type PluginId = string & { readonly __brand: 'PluginId' }

export type PluginTrustLevel = 'built-in' | 'declarative' | 'sandboxed'

export interface PluginCapability {
  readonly id: string
  readonly description: string
}

export interface PluginManifest {
  readonly id: PluginId
  readonly name: string
  readonly version: string
  readonly publisher: string
  readonly trust: PluginTrustLevel
  readonly capabilities: readonly PluginCapability[]
  readonly entry: string
}

export type PluginLifecycleStatus = 'installed' | 'enabled' | 'disabled' | 'error'

export interface PluginCompatibility {
  readonly manifest: PluginManifest
  readonly compatible: boolean
  readonly reason?: string
}
