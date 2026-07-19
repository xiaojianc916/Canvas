#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const TARGET = '94d118dde8a992e15ebd3a56564cffb8524db912'
const dryRun = process.argv.includes('--dry-run')
const forceDirty = process.argv.includes('--allow-dirty')
const root = resolve(process.cwd())
const backupRoot = join(root, '.refactor-backup', `phase-01-${Date.now()}`)

const expectedBlobs = new Map(Object.entries({
  'platforms/desktop-runtime/src/adapters/dialog/file-dialog.ts': 'd4a2644b46cf9867fbba0ec3c5b4f3b6fae3ab85',
  'platforms/desktop-runtime/src/adapters/file/file-system.ts': 'e11856a6fc5345467276e70f81c8c3313c2bdad7',
  'platforms/desktop-runtime/src/adapters/settings/settings-store.ts': 'cc7fd4e057bb3b9f0bb6a1c5cce2243c36d0fe6e',
  'platforms/desktop-runtime/src/public-api.ts': '69a9b87c4b7e302248cbdbdba2da18b36ac88377',
  'editor/persistence/src/application/snapshot-service.ts': 'd6e8f1e2fcc9a4adc98b6706e8122b037fe797cd',
  'editor/core/src/react/extension-registry.ts': '6782d306f11a2e886a503d908dbbf69ef4618236',
  'editor/core/src/react/EditorCanvas.tsx': 'a74fa5c49b44ade4c7c15b1233ae1c0a81aedfa6',
  'editor/core/src/react/public-api.ts': 'bde1b787f8259aed3c184802306f43b54fc01c4a',
  'editor/core/src/public-api.ts': 'd8f4cbd1459e65da9c19e5974b05ae69c9e8160e',
  'apps/desktop/src/bootstrap/application.ts': '39b88442c177f946b0f9e143d10652dab2b07dbe',
  'apps/desktop/src-tauri/src/bootstrap/app.rs': '4dcbe077e65ba4a65c64b850e21c88dab06a601d',
  'apps/desktop/src-tauri/capabilities/main-window.json': 'eb40d613b5ee6ba6620bcd38d2ccb6d882d0701f',
  'apps/desktop/src-tauri/tauri.conf.json': 'feb5c5c2fa3436ed1ef9508643f8092f9ca66fba',
  'package.json': 'efb61b500710756a0da59da70660ec849fa082a3',
}))

function git(...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() }
function fail(message) { throw new Error(message) }
function assertRepository() {
  if (!existsSync(join(root, '.git'))) fail('请在仓库根目录运行。')
  const head = git('rev-parse', 'HEAD')
  if (head !== TARGET) fail(`提交不匹配：期望 ${TARGET}，实际 ${head}`)
  const dirty = git('status', '--porcelain')
  if (dirty && !forceDirty) fail('工作区不干净；请先提交/暂存，或显式传入 --allow-dirty。')
  for (const [path, sha] of expectedBlobs) {
    const actual = git('rev-parse', `HEAD:${path}`)
    if (actual !== sha) fail(`文件指纹不匹配：${path}\n期望 ${sha}\n实际 ${actual}`)
  }
}
function replaceExact(path, oldText, newText) {
  const full = join(root, path)
  const text = readFileSync(full, 'utf8')
  const count = text.split(oldText).length - 1
  if (count !== 1) fail(`锚点必须唯一：${path}（找到 ${count} 处）`)
  stage(path, text.replace(oldText, newText))
}
function stage(path, content) {
  const full = join(root, path)
  if (dryRun) { console.log(`[dry-run] 修改 ${path}`); return }
  const backup = join(backupRoot, path)
  mkdirSync(dirname(backup), { recursive: true })
  copyFileSync(full, backup)
  const temp = `${full}.refactor-${process.pid}`
  writeFileSync(temp, content, 'utf8')
  renameSync(temp, full)
  console.log(`已修改 ${path}`)
}
function mutateJson(path, mutate) {
  const full = join(root, path)
  const value = JSON.parse(readFileSync(full, 'utf8'))
  mutate(value)
  stage(path, `${JSON.stringify(value, null, 2)}\n`)
}

assertRepository()
console.log(`阶段 01：P0 契约与安全基线${dryRun ? '（dry-run）' : ''}`)

stage('platforms/desktop-runtime/src/adapters/dialog/file-dialog.ts', `import { invoke } from '@hybrid-canvas/desktop-ipc'

interface OpenFileResult { readonly paths: string[]; readonly cancelled: boolean }
interface SaveFileResult { readonly path: string | null; readonly cancelled: boolean }

export interface FileDialog {
  open(options?: { multiple?: boolean; filters?: readonly { name: string; extensions: string[] }[] }): Promise<string[]>
  save(options?: { defaultPath?: string; filters?: readonly { name: string; extensions: string[] }[] }): Promise<string | null>
}

export function createFileDialog(): FileDialog {
  return {
    async open(options) {
      const result = await invoke<OpenFileResult>('file_open', { options })
      return result.cancelled ? [] : result.paths
    },
    async save(options) {
      const normalized = options ? { ...options, default_name: options.defaultPath, defaultPath: undefined } : undefined
      const result = await invoke<SaveFileResult>('file_save', { options: normalized })
      return result.cancelled ? null : result.path
    },
  }
}
`)

replaceExact('platforms/desktop-runtime/src/adapters/settings/settings-store.ts',
  "    set: (key: string, value: any) => invoke('settings_set', { key, value }),\n    reset: () => invoke('settings_clear'),",
  "    set: (key: string, value: unknown) => invoke('settings_set', { key, value }),\n    reset: () => invoke('settings_reset'),")

stage('platforms/desktop-runtime/src/adapters/file/file-system.ts', `import { invoke } from '@hybrid-canvas/desktop-ipc'

interface DrawReadResult { readonly content: string }
export interface DrawFileCommands {
  readonly saveDraw: (path: string, content: string) => Promise<void>
  readonly readDraw: (path: string) => Promise<string>
  readonly createDraw: (path: string, content: string) => Promise<string>
}
export function createDrawFileCommands(): DrawFileCommands {
  return {
    saveDraw: (path, content) => invoke<void>('file_save_draw', { request: { path, content } }),
    readDraw: async (path) => (await invoke<DrawReadResult>('file_read_draw', { path })).content,
    createDraw: async (path, content) => (await invoke<DrawReadResult>('file_create_draw', { path, content })).content,
  }
}
`)
replaceExact('platforms/desktop-runtime/src/public-api.ts',
  "export { createAtomicDocumentStorage, createDrawFileCommands } from './adapters/file/file-system'\nexport type { DrawFileCommands } from './adapters/file/file-system'\nexport type { AtomicDocumentStorage } from '@hybrid-canvas/file'",
  "export { createDrawFileCommands } from './adapters/file/file-system'\nexport type { DrawFileCommands } from './adapters/file/file-system'")

stage('editor/persistence/src/application/snapshot-service.ts', `import type { DrawFileContainer, DrawFileHeader } from '../domain/file'

const CURRENT_FILE_VERSION = 1
const MAX_DRAW_FILE_BYTES = 32 * 1024 * 1024
const MAX_NESTING_DEPTH = 128
const MAX_OBJECT_NODES = 250_000

export function createDrawFileHeader(createdAt?: string): DrawFileHeader {
  return { format: 'hybrid-canvas/draw', version: CURRENT_FILE_VERSION, createdAt: createdAt ?? new Date().toISOString() }
}
export function serializeDrawDocument(content: DrawFileContainer['content']): string {
  return JSON.stringify({ header: createDrawFileHeader(), content } satisfies DrawFileContainer)
}
export function parseDrawDocument(json: string): DrawFileContainer {
  if (new TextEncoder().encode(json).byteLength > MAX_DRAW_FILE_BYTES) throw new Error('DRAW_FILE_TOO_LARGE')
  const parsed: unknown = JSON.parse(json)
  enforceBudget(parsed)
  if (!isRecord(parsed)) throw new Error('DRAW_INVALID_ROOT')
  const header = parsed.header
  if (!isRecord(header) || header.format !== 'hybrid-canvas/draw') throw new Error('DRAW_INVALID_HEADER')
  if (header.version !== CURRENT_FILE_VERSION) throw new Error(header.version > CURRENT_FILE_VERSION ? 'DRAW_FUTURE_VERSION' : 'DRAW_UNSUPPORTED_VERSION')
  if (typeof header.createdAt !== 'string' || Number.isNaN(Date.parse(header.createdAt))) throw new Error('DRAW_INVALID_CREATED_AT')
  if (!isRecord(parsed.content)) throw new Error('DRAW_INVALID_CONTENT')
  return parsed as unknown as DrawFileContainer
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function enforceBudget(root: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  let nodes = 0
  while (stack.length) {
    const item = stack.pop()
    if (!item) break
    if (++nodes > MAX_OBJECT_NODES) throw new Error('DRAW_NODE_BUDGET_EXCEEDED')
    if (item.depth > MAX_NESTING_DEPTH) throw new Error('DRAW_DEPTH_EXCEEDED')
    if (item.value && typeof item.value === 'object') for (const child of Object.values(item.value)) stack.push({ value: child, depth: item.depth + 1 })
  }
}
`)

stage('editor/core/src/react/extension-registry.ts', `import type { TLAnyBindingUtilConstructor, TLAnyShapeUtilConstructor, TLStateNodeConstructor } from 'tldraw'
export const HYBRID_CANVAS_EXTENSION_API_VERSION = '1'
export interface HybridCanvasExtension { readonly id: string; readonly version: string; readonly apiVersion: string; readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]; readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]; readonly tools?: readonly TLStateNodeConstructor[]; readonly shapeLabels?: Readonly<Record<string, string>> }
export interface ExtensionRegistration { readonly extensions: readonly HybridCanvasExtension[]; readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]; readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]; readonly tools: readonly TLStateNodeConstructor[]; readonly shapeLabels: Readonly<Record<string, string>> }
export function buildExtensionRegistration(input: readonly HybridCanvasExtension[] = []): ExtensionRegistration {
  const ids = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = [], bindingUtils: TLAnyBindingUtilConstructor[] = [], tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}
  for (const extension of input) {
    if (!extension.id || ids.has(extension.id)) throw new Error('EXTENSION_DUPLICATE_ID')
    if (extension.apiVersion !== HYBRID_CANVAS_EXTENSION_API_VERSION) throw new Error('EXTENSION_API_VERSION_MISMATCH')
    ids.add(extension.id)
    shapeUtils.push(...(extension.shapeUtils ?? [])); bindingUtils.push(...(extension.bindingUtils ?? [])); tools.push(...(extension.tools ?? [])); Object.assign(shapeLabels, extension.shapeLabels)
  }
  return Object.freeze({ extensions: Object.freeze([...input]), shapeUtils: Object.freeze(shapeUtils), bindingUtils: Object.freeze(bindingUtils), tools: Object.freeze(tools), shapeLabels: Object.freeze(shapeLabels) })
}
`)
replaceExact('editor/core/src/react/EditorCanvas.tsx',
  "import { getExtensionRegistration, type HybridCanvasExtension } from './extension-registry'\nimport { registerExtension } from './extension-registry'",
  "import { buildExtensionRegistration, type HybridCanvasExtension } from './extension-registry'")
replaceExact('editor/core/src/react/EditorCanvas.tsx',
  `  if (extensions) {\n    for (const ext of extensions) {\n      registerExtension(ext)\n    }\n  }\n\n  const registration = getExtensionRegistration()`,
  `  const registration = useMemo(() => buildExtensionRegistration(extensions), [extensions])`)
replaceExact('editor/core/src/react/EditorCanvas.tsx', '  }, [initialSnapshot])', '  }, [initialSnapshot, registration])')
stage('editor/core/src/react/public-api.ts', `export { EditorCanvas, type EditorCanvasProps } from './EditorCanvas'
export { CanvasToolbar, type CanvasToolbarProps } from './CanvasToolbar'
export { EditorProvider, useEditor } from './editor-context'
export {
  buildExtensionRegistration,
  HYBRID_CANVAS_EXTENSION_API_VERSION,
  type HybridCanvasExtension,
  type ExtensionRegistration,
} from './extension-registry'
`)
replaceExact('editor/core/src/public-api.ts',
`  registerExtension,
  getExtensionRegistration,
  clearExtensions,
  type HybridCanvasExtension,
  type CustomRecordContribution,
  type ExtensionRegistration,`,
`  buildExtensionRegistration,
  HYBRID_CANVAS_EXTENSION_API_VERSION,
  type HybridCanvasExtension,
  type ExtensionRegistration,`)
replaceExact('apps/desktop/src/bootstrap/application.ts',
`  createAtomicDocumentStorage,
  createDrawFileCommands,`,
`  createDrawFileCommands,`)
replaceExact('apps/desktop/src/bootstrap/application.ts',
`  type AtomicDocumentStorage,
  type DrawFileCommands,`,
`  type DrawFileCommands,`)
replaceExact('apps/desktop/src/bootstrap/application.ts', '  readonly storage: AtomicDocumentStorage\n', '')
replaceExact('apps/desktop/src/bootstrap/application.ts', '    storage: createAtomicDocumentStorage(),\n', '')

replaceExact('apps/desktop/src-tauri/src/bootstrap/app.rs',
`            commands::plugin::plugin_install,
            commands::plugin::plugin_uninstall,
            commands::plugin::plugin_list,
            commands::plugin::plugin_enable,
            commands::plugin::plugin_disable,
`, '')

mutateJson('apps/desktop/src-tauri/capabilities/main-window.json', value => {
  const denied = new Set(['opener:default', 'fs:default', 'shell:allow-open', 'process:default', 'store:default'])
  value.permissions = value.permissions.filter(permission => !denied.has(permission))
})
mutateJson('apps/desktop/src-tauri/tauri.conf.json', value => {
  value.app.security.csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; connect-src 'self'; frame-ancestors 'none';"
})
mutateJson('package.json', value => {
  value.scripts['test:architecture'] = 'node tests/architecture/check.mjs'
  value.scripts.check = 'pnpm test:architecture && turbo run check && pnpm check:rust'
})

const architectureTest = `#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const violations = []
function walk(dir) { for (const name of readdirSync(dir)) { if (['node_modules','target','dist','.git'].includes(name)) continue; const p=join(dir,name); statSync(p).isDirectory()?walk(p):check(p) } }
function check(path) { if (!/\\.(ts|tsx)$/.test(path)) return; const rel=relative(root,path).replaceAll('\\\\','/'); const text=readFileSync(path,'utf8'); if (rel.startsWith('foundations/') && /from ['\"]@hybrid-canvas\\/(canvas|workspace|flowchart|platforms)/.test(text)) violations.push(rel+': foundations 反向依赖'); if (rel.startsWith('features/') && /@tauri-apps\\//.test(text)) violations.push(rel+': feature 直接依赖 Tauri'); if (!rel.startsWith('editor/core/') && /createTLStore\\s*\\(/.test(text)) violations.push(rel+': 非 editor/core 创建 TLStore'); }
walk(root)
if (violations.length) { console.error(violations.join('\\n')); process.exit(1) }
console.log('Architecture invariants passed')
`
if (dryRun) console.log('[dry-run] 新建 tests/architecture/check.mjs')
else { const path=join(root,'tests/architecture/check.mjs'); mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,architectureTest,'utf8') }

if (!dryRun) {
  console.log(`备份目录：${relative(root, backupRoot)}`)
  console.log('运行最小验证：pnpm format && pnpm typecheck && pnpm test:architecture && cargo fmt --all --check && cargo check --workspace --all-targets --all-features')
  try {
    execFileSync('pnpm', ['format'], { cwd: root, stdio: 'inherit' })
    execFileSync('pnpm', ['typecheck'], { cwd: root, stdio: 'inherit' })
    execFileSync('pnpm', ['test:architecture'], { cwd: root, stdio: 'inherit' })
    execFileSync('cargo', ['fmt', '--all', '--check'], { cwd: root, stdio: 'inherit' })
    execFileSync('cargo', ['check', '--workspace', '--all-targets', '--all-features'], { cwd: root, stdio: 'inherit' })
  } catch (error) {
    console.error('验证失败。修改与备份均已保留，便于诊断。')
    console.error(`回滚：git restore --worktree --staged . && rm -rf ${relative(root, backupRoot)}`)
    process.exitCode = 1
  }
}
