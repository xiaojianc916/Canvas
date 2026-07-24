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
      [
        `找不到目标文件：${absolutePath}`,
        '',
        '请确认当前 PowerShell 路径是仓库根目录后重新执行：',
        'node refactor.mjs',
      ].join('\n'),
    )
  }
}

async function replaceExactly(file, replacements) {
  await ensureFileExists(file)

  const absolutePath = path.join(root, file)
  let content = await readFile(absolutePath, 'utf8')
  let changed = false

  for (const { oldText, newText, description } of replacements) {
    if (content.includes(newText)) {
      console.log(`跳过：${file} - ${description}（修改已存在）`)
      continue
    }

    if (!content.includes(oldText)) {
      throw new Error(
        [
          `未在文件中找到预期代码：${file}`,
          `修改项：${description}`,
          '',
          '为避免错误覆盖，脚本已停止。请确认文件内容与当前仓库版本一致。',
        ].join('\n'),
      )
    }

    content = content.replace(oldText, newText)
    changed = true
    console.log(`已应用：${file} - ${description}`)
  }

  if (!changed) {
    return
  }

  await writeFile(absolutePath, content, 'utf8')
  console.log(`已写入：${file}`)
}

async function main() {
  console.log(`仓库根目录：${root}\n`)

  await replaceExactly(files.diagnosticBuffer, [
    {
      description: '修复 exactOptionalPropertyTypes 可选字段赋值',
      oldText: `    const entry: DiagnosticLogEntry = {
      sequence: nextSequence,
      timestamp: normalizeTimestamp(timestamp),
      level,
      message: normalizeText(message, MAX_MESSAGE_LENGTH),
      scope: normalizeOptionalText(context.scope, 256),
      correlationId: normalizeOptionalText(context.correlationId, 256),
      context: sanitizeContext(context),
    }`,
      newText: `    const scope = normalizeOptionalText(context.scope, 256)
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
    },
  ])

  await replaceExactly(files.diagnosticBufferTest, [
    {
      description: '修复 accessToken 索引签名访问',
      oldText: `entry?.context.accessToken`,
      newText: `entry?.context['accessToken']`,
    },
    {
      description: '修复 authorization 索引签名访问',
      oldText: `entry?.context.authorization`,
      newText: `entry?.context['authorization']`,
    },
    {
      description: '修复 endpoint 索引签名访问',
      oldText: `entry?.context.endpoint`,
      newText: `entry?.context['endpoint']`,
    },
    {
      description: '修复 cause 索引签名访问',
      oldText: `entry?.context.cause`,
      newText: `entry?.context['cause']`,
    },
    {
      description: '修复 circular 索引签名访问',
      oldText: `entry?.context.circular`,
      newText: `entry?.context['circular']`,
    },
  ])

  await replaceExactly(files.ipcPublicApi, [
    {
      description: '移除生成 IPC 绑定中不存在的 NativeCrashReport 导出',
      oldText: `export {
  commands,
  type NativeCrashReport,
} from './generated/ipc-bindings'`,
      newText: `export { commands } from './generated/ipc-bindings'`,
    },
  ])

  await replaceExactly(files.nativeCrashReport, [
    {
      description: '禁用尚未注册的 native crash IPC 调用',
      oldText: `import { commands, type NativeCrashReport } from '@hybrid-canvas/desktop-ipc'

export type { NativeCrashReport }

export async function takePreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  if (!isTauriRuntime()) {
    return null
  }

  return commands.diagnosticsTakePreviousCrash()
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}`,
      newText: `/**
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
}`,
    },
  ])

  console.log('\n修改完成。请运行：pnpm typecheck')
}

main().catch((error) => {
  console.error('\n脚本执行失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})