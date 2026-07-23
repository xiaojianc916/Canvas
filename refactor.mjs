#!/usr/bin/env node
/**
 * refactor.mjs
 *
 * 质量门禁编排重构：
 * - 消除 Turbo 首个失败后终止 Windows 子进程造成的伪 ^C / 伪失败输出
 * - typecheck/test 运行全部任务，并汇总真实退出状态
 * - 前端质量检查失败时，Rust 检查与测试仍会执行
 * - 修复已确认的 TS4111 与 Rust Windows warning
 *
 * 使用：
 *   node refactor.mjs --write
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const rootPackagePath = resolve('package.json')

const workbenchTabsPath = resolve(
  'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
)

const atomicWritePath = resolve(
  'editor/persistence/native/src/atomic_write.rs',
)

const qualityRunnerPath = resolve('scripts/quality/run.mjs')

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

async function rewrite(path, transform) {
  const source = await readFile(path, 'utf8')
  await write(path, transform(source))
}

const qualityRunner = `#!/usr/bin/env node
/**
 * Cross-platform quality command runner.
 *
 * Turbo can terminate concurrent Windows cmd.exe children after a task fails.
 * That termination is rendered as "^C / 终止批处理操作吗" even when the user
 * did not press Ctrl+C. This runner lets all tasks finish and aggregates only
 * their actual exit codes.
 */

import { spawn } from 'node:child_process'
import process from 'node:process'

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: false,
    })

    child.once('error', (error) => {
      console.error(\`无法启动 \${command}: \${error.message}\`)
      resolve(1)
    })

    child.once('exit', (code, signal) => {
      if (signal) {
        console.error(\`\${command} 被信号 \${signal} 终止\`)
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })
}

const mode = process.argv[2]

const commands =
  mode === 'typecheck'
    ? [
        {
          command: pnpm,
          args: ['exec', 'turbo', 'run', 'typecheck', '--continue=always'],
        },
      ]
    : mode === 'test'
      ? [
          {
            command: pnpm,
            args: ['exec', 'turbo', 'run', 'test', '--continue=always'],
          },
          {
            command: cargo,
            args: ['test', '--workspace', '--all-features'],
          },
        ]
      : mode === 'check'
        ? [
            {
              command: pnpm,
              args: ['exec', 'turbo', 'run', 'check', '--continue=always'],
            },
            {
              command: cargo,
              args: ['check', '--workspace', '--all-targets', '--all-features'],
            },
          ]
        : null

if (!commands) {
  console.error('用法: node scripts/quality/run.mjs <typecheck|test|check>')
  process.exitCode = 1
} else {
  let failed = false

  for (const { command, args } of commands) {
    console.log('')
    console.log(\`>>> \${command} \${args.join(' ')}\`)
    console.log('')

    const exitCode = await run(command, args)

    if (exitCode !== 0) {
      failed = true
    }
  }

  process.exitCode = failed ? 1 : 0
}
`

await rewrite(workbenchTabsPath, (source) =>
  source.replaceAll(
    'viewport.dataset.hasActiveTab',
    "viewport.dataset['hasActiveTab']",
  ),
)

await rewrite(atomicWritePath, (source) =>
  source.replace(
    'use std::fs::File;',
    '#[cfg(unix)]\\nuse std::fs::File;',
  ),
)

const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'))

rootPackage.scripts = {
  ...rootPackage.scripts,
  typecheck: 'node scripts/quality/run.mjs typecheck',
  test: 'node scripts/quality/run.mjs test',
  check: 'pnpm test:architecture && node scripts/quality/run.mjs check',
}

await Promise.all([
  write(qualityRunnerPath, qualityRunner),
  write(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\\n`),
])

console.log('已完成质量门禁编排重构：')
console.log('- 修复 WorkbenchTabs.tsx 的 DOMStringMap TS4111')
console.log('- 修复 atomic_write.rs 的 Windows warning')
console.log('- 新增 scripts/quality/run.mjs')
console.log('- 重写根 typecheck / test / check 脚本')
console.log('')
console.log('现在执行：')
console.log('  pnpm typecheck')
console.log('  pnpm test')
console.log('  pnpm check')