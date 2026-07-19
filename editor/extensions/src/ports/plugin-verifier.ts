import type { PluginManifest } from '../domain/plugin'

export interface PluginVerifier {
  verify(
    packagePath: string,
  ): Promise<{ valid: boolean; manifest?: PluginManifest; error?: string }>
}
