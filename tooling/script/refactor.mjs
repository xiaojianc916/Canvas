/**
 * scripts/apply-vite-diagnostic-bridge.mjs
 *
 * 第二阶段：
 * 1. 捕获 Vite 服务端发送的 import/transform/HMR 错误。
 * 2. 转换成 Hybrid Canvas 自定义诊断事件。
 * 3. 在 bootstrap-fallback.ts 中显示完整 Vite 错误。
 * 4. Vite 原始 Overlay 继续保持关闭。
 *
 * 前置条件：
 *   已执行 apply-custom-error-ui.mjs
 *
 * 使用：
 *   node scripts/apply-vite-diagnostic-bridge.mjs
 */

import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot =
  path.basename(scriptDirectory) === 'scripts'
    ? path.dirname(scriptDirectory)
    : process.cwd()

const paths = {
  viteConfig: path.join(repositoryRoot, 'apps/desktop/vite.config.ts'),
  vitePlugin: path.join(
    repositoryRoot,
    'apps/desktop/vite-plugins/custom-error-diagnostics.ts',
  ),
  bootstrapFallback: path.join(
    repositoryRoot,
    'apps/desktop/src/bootstrap/bootstrap-fallback.ts',
  ),
}

async function assertFileExists(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`找不到文件：${path.relative(repositoryRoot, filePath)}`)
  }
}

async function readUtf8(filePath) {
  return (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '')
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })

  const temporaryPath = `${filePath}.${process.pid}.tmp`
  const normalizedContent = `${content.replace(/\r\n/g, '\n').trimEnd()}\n`

  await writeFile(temporaryPath, normalizedContent, 'utf8')
  await rename(temporaryPath, filePath)

  console.log(`已修改：${path.relative(repositoryRoot, filePath)}`)
}

function updateViteConfig(source) {
  let next = source

  const pluginImport =
    "import { customErrorDiagnosticsPlugin } from './vite-plugins/custom-error-diagnostics'"

  if (!next.includes(pluginImport)) {
    const viteImport = "import { defineConfig } from 'vite'"

    if (!next.includes(viteImport)) {
      throw new Error('无法定位 vite.config.ts 中的 Vite import。')
    }

    next = next.replace(
      viteImport,
      `${viteImport}
${pluginImport}`,
    )
  }

  if (!next.includes('customErrorDiagnosticsPlugin()')) {
    const pluginsPattern =
      /plugins:\s*\[\s*react\(\),\s*tailwindcss\(\)\s*\],/

    if (!pluginsPattern.test(next)) {
      throw new Error(
        '无法定位 vite.config.ts 中的 plugins 配置，请检查文件是否已经改变。',
      )
    }

    next = next.replace(
      pluginsPattern,
      `plugins: [
    // 必须最先注册，确保捕获后续插件及 import-analysis 错误。
    customErrorDiagnosticsPlugin(),
    react(),
    tailwindcss(),
  ],`,
    )
  }

  if (!/hmr\s*:\s*\{[\s\S]*?overlay\s*:\s*false/.test(next)) {
    const strictPortPattern = /(\s+strictPort:\s*true,\s*\n)/

    if (!strictPortPattern.test(next)) {
      throw new Error(
        '无法定位 server.strictPort，不能安全添加 hmr.overlay 配置。',
      )
    }

    next = next.replace(
      strictPortPattern,
      `$1    hmr: {
      overlay: false,
    },
`,
    )
  }

  return next
}

const vitePluginSource = `
import type { Plugin } from 'vite'

interface UnknownRecord {
  readonly [key: string]: unknown
}

interface SerializableLocation {
  readonly file?: string
  readonly line?: number
  readonly column?: number
}

interface SerializableViteError {
  readonly name: string
  readonly message: string
  readonly stack?: string
  readonly plugin?: string
  readonly id?: string
  readonly frame?: string
  readonly pluginCode?: string
  readonly location?: SerializableLocation
}

interface ViteDiagnosticEvent {
  readonly source: 'vite'
  readonly occurredAt: string
  readonly error: SerializableViteError
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function getString(
  record: UnknownRecord,
  property: string,
): string | undefined {
  const value = record[property]
  return typeof value === 'string' ? value : undefined
}

function getNumber(
  record: UnknownRecord,
  property: string,
): number | undefined {
  const value = record[property]
  return typeof value === 'number' ? value : undefined
}

function serializeLocation(value: unknown): SerializableLocation | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const file =
    getString(value, 'file') ??
    getString(value, 'id')

  const line =
    getNumber(value, 'line') ??
    getNumber(value, 'lineNumber')

  const column =
    getNumber(value, 'column') ??
    getNumber(value, 'columnNumber')

  if (
    file === undefined &&
    line === undefined &&
    column === undefined
  ) {
    return undefined
  }

  return {
    file,
    line,
    column,
  }
}

function serializeViteError(value: unknown): SerializableViteError {
  if (value instanceof Error) {
    const errorRecord = value as Error & UnknownRecord

    return {
      name: value.name || 'Error',
      message: value.message || '未知 Vite 错误',
      stack: value.stack,
      plugin: getString(errorRecord, 'plugin'),
      id: getString(errorRecord, 'id'),
      frame: getString(errorRecord, 'frame'),
      pluginCode: getString(errorRecord, 'pluginCode'),
      location: serializeLocation(errorRecord.loc),
    }
  }

  if (!isRecord(value)) {
    return {
      name: 'ViteError',
      message:
        typeof value === 'string'
          ? value
          : String(value ?? '未知 Vite 错误'),
    }
  }

  return {
    name: getString(value, 'name') ?? 'ViteError',
    message:
      getString(value, 'message') ??
      getString(value, 'msg') ??
      '未知 Vite 错误',
    stack: getString(value, 'stack'),
    plugin: getString(value, 'plugin'),
    id: getString(value, 'id'),
    frame: getString(value, 'frame'),
    pluginCode: getString(value, 'pluginCode'),
    location: serializeLocation(value.loc),
  }
}

function isViteErrorPayload(
  payload: unknown,
): payload is UnknownRecord & {
  readonly type: 'error'
  readonly err: unknown
} {
  return (
    isRecord(payload) &&
    payload.type === 'error' &&
    'err' in payload
  )
}

/**
 * Vite 暂时没有公开的自定义 Overlay 替换 API。
 *
 * 这里将兼容逻辑隔离在一个仅开发环境启用的插件中：
 * - 不修改 Vite 客户端源码；
 * - 不查询或删除 vite-error-overlay DOM；
 * - 不进入生产构建；
 * - 原始 Vite 错误仍正常转发给 HMR 客户端和终端；
 * - 额外发送 Hybrid Canvas 自定义诊断事件。
 */
export function customErrorDiagnosticsPlugin(): Plugin {
  return {
    name: 'hybrid-canvas:custom-error-diagnostics',
    apply: 'serve',
    configureServer(server) {
      const originalSend = server.ws.send.bind(server.ws)

      const sendOriginal = originalSend as (
        ...arguments_: readonly unknown[]
      ) => unknown

      server.ws.send = ((...arguments_: readonly unknown[]) => {
        const payload = arguments_[0]

        if (isViteErrorPayload(payload)) {
          const diagnostic: ViteDiagnosticEvent = {
            source: 'vite',
            occurredAt: new Date().toISOString(),
            error: serializeViteError(payload.err),
          }

          sendOriginal({
            type: 'custom',
            event: 'hybrid-canvas:diagnostic',
            data: diagnostic,
          })
        }

        return sendOriginal(...arguments_)
      }) as typeof server.ws.send
    },
  }
}
`

const diagnosticBridgeMarker =
  '// HYBRID_CANVAS_VITE_DIAGNOSTIC_BRIDGE'

const diagnosticBridgeSource = `

// HYBRID_CANVAS_VITE_DIAGNOSTIC_BRIDGE

interface ViteDiagnosticLocation {
  readonly file?: string
  readonly line?: number
  readonly column?: number
}

interface ViteDiagnosticError {
  readonly name?: string
  readonly message?: string
  readonly stack?: string
  readonly plugin?: string
  readonly id?: string
  readonly frame?: string
  readonly pluginCode?: string
  readonly location?: ViteDiagnosticLocation
}

interface ViteDiagnosticPayload {
  readonly source?: string
  readonly occurredAt?: string
  readonly error?: ViteDiagnosticError
}

interface HybridCanvasHotContext {
  readonly on: (
    event: string,
    listener: (payload: unknown) => void,
  ) => void
}

function isUnknownRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readOptionalString(
  value: Record<string, unknown>,
  property: string,
): string | undefined {
  const candidate = value[property]
  return typeof candidate === 'string' ? candidate : undefined
}

function readOptionalNumber(
  value: Record<string, unknown>,
  property: string,
): number | undefined {
  const candidate = value[property]
  return typeof candidate === 'number' ? candidate : undefined
}

function parseViteDiagnosticPayload(
  value: unknown,
): ViteDiagnosticPayload {
  if (!isUnknownRecord(value)) {
    return {
      source: 'vite',
      occurredAt: new Date().toISOString(),
      error: {
        name: 'ViteError',
        message: String(value),
      },
    }
  }

  const rawError = isUnknownRecord(value.error)
    ? value.error
    : {}

  const rawLocation = isUnknownRecord(rawError.location)
    ? rawError.location
    : undefined

  return {
    source: readOptionalString(value, 'source') ?? 'vite',
    occurredAt:
      readOptionalString(value, 'occurredAt') ??
      new Date().toISOString(),
    error: {
      name:
        readOptionalString(rawError, 'name') ??
        'ViteError',
      message:
        readOptionalString(rawError, 'message') ??
        '未知 Vite 开发服务器错误',
      stack: readOptionalString(rawError, 'stack'),
      plugin: readOptionalString(rawError, 'plugin'),
      id: readOptionalString(rawError, 'id'),
      frame: readOptionalString(rawError, 'frame'),
      pluginCode: readOptionalString(
        rawError,
        'pluginCode',
      ),
      location: rawLocation
        ? {
            file: readOptionalString(rawLocation, 'file'),
            line: readOptionalNumber(rawLocation, 'line'),
            column: readOptionalNumber(
              rawLocation,
              'column',
            ),
          }
        : undefined,
    },
  }
}

function formatViteDiagnostic(
  payload: ViteDiagnosticPayload,
): string {
  const error = payload.error ?? {}
  const location = error.location

  return [
    '错误来源: Vite 开发服务器',
    \`时间: \${
      payload.occurredAt ?? new Date().toISOString()
    }\`,
    \`错误类型: \${error.name ?? 'ViteError'}\`,
    \`错误信息: \${
      error.message ?? '未知 Vite 开发服务器错误'
    }\`,
    error.plugin
      ? \`Vite 插件: \${error.plugin}\`
      : undefined,
    error.id
      ? \`模块 ID: \${error.id}\`
      : undefined,
    location?.file
      ? \`文件: \${location.file}\`
      : undefined,
    typeof location?.line === 'number'
      ? \`行: \${location.line}\`
      : undefined,
    typeof location?.column === 'number'
      ? \`列: \${location.column}\`
      : undefined,
    error.frame
      ? \`\\n代码定位:\\n\${error.frame}\`
      : undefined,
    error.pluginCode
      ? \`\\n插件代码:\\n\${error.pluginCode}\`
      : undefined,
    error.stack
      ? \`\\nStack:\\n\${error.stack}\`
      : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\\n')
}

const hybridCanvasHot = (
  import.meta as ImportMeta & {
    readonly hot?: HybridCanvasHotContext
  }
).hot

hybridCanvasHot?.on(
  'hybrid-canvas:diagnostic',
  (rawPayload: unknown) => {
    const payload = parseViteDiagnosticPayload(rawPayload)
    const diagnostic = formatViteDiagnostic(payload)

    console.error(
      '[Hybrid Canvas Vite Diagnostic]',
      rawPayload,
    )

    showFatalError(diagnostic)
  },
)
`

function updateBootstrapFallback(source) {
  if (source.includes(diagnosticBridgeMarker)) {
    return source
  }

  if (!source.includes('function showFatalError')) {
    throw new Error(
      'bootstrap-fallback.ts 中不存在 showFatalError。请先运行第一阶段脚本。',
    )
  }

  return `${source.trimEnd()}${diagnosticBridgeSource}`
}

async function main() {
  await Promise.all([
    assertFileExists(paths.viteConfig),
    assertFileExists(paths.bootstrapFallback),
  ])

  const [viteConfig, bootstrapFallback] = await Promise.all([
    readUtf8(paths.viteConfig),
    readUtf8(paths.bootstrapFallback),
  ])

  const nextViteConfig = updateViteConfig(viteConfig)
  const nextBootstrapFallback =
    updateBootstrapFallback(bootstrapFallback)

  await Promise.all([
    atomicWrite(paths.viteConfig, nextViteConfig),
    atomicWrite(paths.vitePlugin, vitePluginSource),
    atomicWrite(
      paths.bootstrapFallback,
      nextBootstrapFallback,
    ),
  ])

  console.log('')
  console.log('Vite 开发诊断桥接安装完成。')
  console.log('')
  console.log('请执行：')
  console.log('  pnpm --filter @hybrid-canvas/desktop typecheck')
  console.log('  pnpm --filter @hybrid-canvas/desktop dev')
  console.log('')
  console.log('验证方法：')
  console.log(
    '  临时写入一个不存在的 import，确认只显示 Hybrid Canvas 错误 UI。',
  )
  console.log(
    '  验证结束后删除临时 import，不要提交故意制造的错误。',
  )
}

main().catch((error) => {
  console.error('')
  console.error('安装 Vite 开发诊断桥接失败：')
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})