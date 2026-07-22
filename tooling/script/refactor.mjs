#!/usr/bin/env node

/**
 * 修复右侧属性栏关闭按钮被裁剪的问题。
 *
 * 原因：
 * 关闭按钮使用 -left-8 放置在属性栏左边界外，
 * 但父容器被错误设置为 overflow-hidden。
 *
 * 运行：
 * node tooling/script/refactor.mjs --apply
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

function findRepositoryRoot(startDirectory) {
  let currentDirectory = startDirectory

  while (true) {
    if (
      fs.existsSync(path.join(currentDirectory, 'package.json')) &&
      fs.existsSync(path.join(currentDirectory, 'pnpm-workspace.yaml'))
    ) {
      return currentDirectory
    }

    const parentDirectory = path.dirname(currentDirectory)

    if (parentDirectory === currentDirectory) {
      throw new Error('找不到 Canvas 仓库根目录。')
    }

    currentDirectory = parentDirectory
  }
}

const ROOT = findRepositoryRoot(SCRIPT_DIRECTORY)

const WORKSPACE_SHELL_PATH = path.join(
  ROOT,
  'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
)

function updateWorkspaceShell() {
  if (!fs.existsSync(WORKSPACE_SHELL_PATH)) {
    throw new Error(
      `文件不存在：${path.relative(ROOT, WORKSPACE_SHELL_PATH)}`,
    )
  }

  let content = fs.readFileSync(WORKSPACE_SHELL_PATH, 'utf8')

  const incorrectClass =
    'className="absolute inset-y-0 right-0 overflow-hidden"'

  const correctedClass =
    'className="absolute inset-y-0 right-0 overflow-visible"'

  if (content.includes(incorrectClass)) {
    content = content.replace(incorrectClass, correctedClass)
  } else if (!content.includes(correctedClass)) {
    throw new Error(
      '找不到右侧属性栏动画容器，请检查 WorkspaceShell.tsx 当前代码。',
    )
  }

  /*
   * 确认关闭按钮仍然存在，避免只修复裁剪但按钮已经被删掉。
   */
  if (!content.includes('aria-label="收起属性面板"')) {
    throw new Error('右侧属性栏的关闭按钮已经丢失，无法只通过解除裁剪恢复。')
  }

  if (!content.includes('className="absolute -left-8 top-3 z-30')) {
    throw new Error('右侧属性栏关闭按钮的位置代码与预期不一致。')
  }

  fs.writeFileSync(WORKSPACE_SHELL_PATH, content, 'utf8')

  console.log(
    `已修复：${path.relative(ROOT, WORKSPACE_SHELL_PATH)}`,
  )
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
    env: process.env,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `命令执行失败（退出码 ${String(result.status)}）：` +
        `${command} ${args.join(' ')}`,
    )
  }
}

function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('请添加 --apply 参数执行修改。')
  }

  console.log(`仓库目录：${ROOT}\n`)

  updateWorkspaceShell()

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'typecheck',
  ])

  console.log('\n修复完成：')
  console.log('- 右侧属性栏关闭按钮不再被裁剪')
  console.log('- 打开右侧属性栏后可以正常关闭')
  console.log('- 左右侧栏共用的 220ms 动画保持不变')
}

try {
  main()
} catch (error) {
  console.error('\n修复失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}