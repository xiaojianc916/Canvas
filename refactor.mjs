import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cwd } from 'node:process'

const root = cwd()

const files = {
  diagnosticBuffer: 'foundations/observability/src/diagnostic-buffer.ts',
  diagnosticBufferTest: 'foundations/observability/src/diagnostic-buffer.test.ts',
  ipcPublicApi: 'platforms/desktop-ipc/src/public-api.ts',
  nativeCrashReport: 'platforms/desktop-runtime/src/adapters/native-crash-report.ts',
}

async function ensureFileExists(file) {
  const absolutePath = path.join(root, file)

  try {
    await access(absolutePath)
  } catch {
    throw new Error(
      `找不到目标文件：${absolutePath}\n请在仓库根目录执行：node refactor.mjs`,
    )
  }
}

async function readTarget(file) {
  await ensureFileExists(file)
  return readFile(path.join(root, file), 'utf8')
}

async function writeTarget(file, content) {
  await writeFile(path.join(root, file), content, 'utf8')
}

function replaceOnce(content, oldText, newText, label) {
  if (content.includes(newText)) {
    console.log(`跳过：${label}（修改已存在）`)
    return content
  }

  if (!content.includes(oldText)) {
    throw new Error(`未找到预期代码：${label}`)
  }

  console.log(`已应用：${label}`)
  return content.replace(oldText, newText)
}

async function fixDiagnosticBuffer() {
  const file = files.diagnosticBuffer
  let content = await readTarget(file)

  content = replaceOnce(
    content,
    `    const entry: DiagnosticLogEntry = {
      sequence: nextSequence,
      timestamp: normalizeTimestamp(timestamp),
      level,
      message: normalizeText(message, MAX_MESSAGE_LENGTH),
      scope: normalizeOptionalText(context.scope, 256),
      correlationId: normalizeOptionalText(context.correlationId, 256),
      context: sanitizeContext(context),
    }`,
    `    const scope = normalizeOptionalText(context.scope, 256)
    const correlationId = normalizeOptionalText(context.correlationId, 256)

    const entry: DiagnosticLogEntry = {
      sequence: nextSequence,
      timestamp: normalizeTimestamp(timestamp),
      level,
      message: normalizeText(message, MAX_MESSAGE_LENGTH),
      ...(scope === undefined ? {} : { scope }),
      ...(correlationId === undefined ? {} : { correlationId }),
      context: sanitizeContext(context),
    }`,
    `${file}：修复 exactOptionalPropertyTypes`,
  )

  await writeTarget(file, content)
}

async function fixDiagnosticBufferTest() {
  const file = files.diagnosticBufferTest
  let content = await readTarget(file)

  const replacements = [
    ['entry?.context.accessToken', `entry?.context['accessToken']`],
    ['entry?.context.authorization', `entry?.context['authorization']`],
    ['entry?.context.endpoint', `entry?.context['endpoint']`],
    ['entry?.context.cause', `entry?.context['cause']`],
    ['entry?.context.circular', `entry?.context['circular']`],
  ]

  for (const [oldText, newText] of replacements) {
    content = replaceOnce(
      content,
      oldText,
      newText,
      `${file}：修复 ${oldText}`,
    )
  }

  await writeTarget(file, content)
}

async function fixIpcPublicApi() {
  const file = files.ipcPublicApi
  let content = await readTarget(file)

  content = replaceOnce(
    content,
    `export {
  commands,
  type NativeCrashReport,
} from './generated/ipc-bindings'`,
    `export { commands } from './generated/ipc-bindings'`,
    `${file}：移除失效的生成类型导出`,
  )

  await writeTarget(file, content)
}

async function fixNativeCrashReportAdapter() {
  const file = files.nativeCrashReport
  let content = await readTarget(file)

  const originalImplementation = `import { commands, type NativeCrashReport } from '@hybrid-canvas/desktop-ipc'

export type { NativeCrashReport }

export async function takePreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  if (!isTauriRuntime()) {
    return null
  }

  return commands.diagnosticsTakePreviousCrash()
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}`

  const incompletePlaceholder = `/**
 * 原生诊断崩溃报告尚未注册为 Tauri IPC 命令。
 *
 * 待 native 端实现 diagnostics_take_previous_crash 并重新生成
 * desktop-ipc/src/generated/ipc-bindings.ts 后，再以生成类型替换此占位类型。
 */
export interface NativeCrashReport {
  readonly message: string
  readonly timestamp: string
  readonly stack?: string
}

export async function takePreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  return null
}`

  const completeImplementation = `/**
 * 原生诊断崩溃报告尚未注册为 Tauri IPC 命令。
 *
 * 保留与桌面端消费逻辑一致的数据模型；在 native 端实现
 * diagnostics_take_previous_crash 并重新生成 IPC 绑定前，此函数稳定返回 null。
 */
export interface NativeCrashReport {
  readonly incidentId: string
  readonly occurredAt: string
  readonly message: string
  readonly backtrace: string
  readonly location: string | null
  readonly process: string
  readonly thread: string
  readonly appVersion: string
  readonly targetOs: string
  readonly targetArch: string
}

export async function takePreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  return null
}`

  if (content.includes(completeImplementation)) {
    console.log(`跳过：${file}：完整 NativeCrashReport 类型已存在`)
  } else if (content.includes(incompletePlaceholder)) {
    content = content.replace(incompletePlaceholder, completeImplementation)
    console.log(`已应用：${file}：补全 NativeCrashReport 类型字段`)
  } else if (content.includes(originalImplementation)) {
    content = content.replace(originalImplementation, completeImplementation)
    console.log(`已应用：${file}：替换失效的 crash IPC 调用`)
  } else {
    throw new Error(
      `未识别 ${file} 的当前内容；为避免覆盖已有修改，脚本已停止。`,
    )
  }

  await writeTarget(file, content)
}

async function main() {
  console.log(`仓库根目录：${root}\n`)

  await fixDiagnosticBuffer()
  await fixDiagnosticBufferTest()
  await fixIpcPublicApi()
  await fixNativeCrashReportAdapter()

  console.log('\n修改完成。现在请运行：pnpm typecheck')
}

main().catch((error) => {
  console.error('\n脚本执行失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})