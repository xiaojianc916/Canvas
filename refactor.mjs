#!/usr/bin/env node
/**
 * tools/refactor-desktop-runtime-public-api.mjs
 *
 * 删除旧 DrawFileCommands / createDrawFileCommands 公共 API。
 * 仅导出新的 DocumentFileCommands / createDocumentFileCommands。
 *
 * 用法：
 *   node tools/refactor-desktop-runtime-public-api.mjs
 *   node tools/refactor-desktop-runtime-public-api.mjs --check
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const checkOnly = process.argv.includes('--check')

const target = resolve('platforms/desktop-runtime/src/public-api.ts')

const replacement = `export type { SettingsStore } from '@hybrid-canvas/settings'

export { createDesktopAssetStore } from './adapters/asset/asset-store'

export { createClipboard } from './adapters/clipboard/clipboard'

export type { FileDialog } from './adapters/dialog/file-dialog'
export { createFileDialog } from './adapters/dialog/file-dialog'

export type {
  DocumentFileCommands,
  DocumentId,
  OpenedDocument,
} from './adapters/file/file-system'
export { createDocumentFileCommands } from './adapters/file/file-system'

export type { NativeRuntimeInfo } from './adapters/native-runtime-info'

export {
  createMainWindowController,
  type MainWindowController,
} from './adapters/native-window'

export type { ExternalOpener } from './adapters/opener/external-opener'
export { createExternalOpener } from './adapters/opener/external-opener'

export { createDesktopPluginVerifier } from './adapters/plugin/plugin-verifier'

export { createDesktopSettingsStore } from './adapters/settings/settings-store'

export type { SystemTheme } from './adapters/theme/system-theme'
export { createSystemTheme } from './adapters/theme/system-theme'
`

const source = await readFile(target, 'utf8')

if (checkOnly) {
  if (source === replacement) {
    console.log('OK: desktop-runtime 公共文件 API 已迁移到 DocumentFileCommands。')
    process.exit(0)
  }

  console.error(
    'ERROR: desktop-runtime public-api.ts 仍包含旧 DrawFileCommands 导出或内容不一致。',
  )
  process.exit(1)
}

await writeFile(target, replacement, 'utf8')

console.log(`已全量替换：${target}`)
console.log('')
console.log('旧导出已删除：')
console.log('- DrawFileCommands')
console.log('- createDrawFileCommands')
console.log('')
console.log('新导出：')
console.log('- DocumentId')
console.log('- OpenedDocument')
console.log('- DocumentFileCommands')
console.log('- createDocumentFileCommands')
console.log('')
console.log('接着执行：')
console.log('  pnpm typecheck')
console.log('')
console.log('将所有报错调用点统一迁移：')
console.log('  createDrawFileCommands()')
console.log('  -> createDocumentFileCommands()')
console.log('')
console.log('  saveDraw(path, content)')
console.log('  -> save(documentId, content)')
console.log('')
console.log('  readDraw(path)')
console.log('  -> open()')
console.log('')
console.log('  createDraw(path, content)')
console.log('  -> saveAs(content, { suggestedName })')