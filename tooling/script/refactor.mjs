#!/usr/bin/env node

/**
 * 修正侧边栏动画：
 * 1. 删除主内容区阴影
 * 2. 将 Spring 改为渐进式 Tween + Ease In Out
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
    const packagePath = path.join(currentDirectory, 'package.json')
    const workspacePath = path.join(currentDirectory, 'pnpm-workspace.yaml')

    if (fs.existsSync(packagePath) && fs.existsSync(workspacePath)) {
      return currentDirectory
    }

    const parentDirectory = path.dirname(currentDirectory)

    if (parentDirectory === currentDirectory) {
      throw new Error('找不到仓库根目录。')
    }

    currentDirectory = parentDirectory
  }
}

const ROOT = findRepositoryRoot(SCRIPT_DIRECTORY)

const WORKSPACE_FRAME_PATH = path.join(
  ROOT,
  'features/workspace/src/presentation/shell/WorkspaceFrame.tsx',
)

const WORKSPACE_SHELL_PATH = path.join(
  ROOT,
  'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
)

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在：${path.relative(ROOT, filePath)}`)
  }

  return fs.readFileSync(filePath, 'utf8')
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8')
  console.log(`已修改：${path.relative(ROOT, filePath)}`)
}

function updateWorkspaceFrame() {
  const originalContent = readFile(WORKSPACE_FRAME_PATH)

  if (!originalContent.includes("from 'motion/react'")) {
    throw new Error(
      'WorkspaceFrame.tsx 尚未接入 Motion，请先运行之前的侧边栏动画脚本。',
    )
  }

  const transitionPattern =
    /  const transition =\s*\n[\s\S]*?\n\s*return \(\s*\n/

  if (!transitionPattern.test(originalContent)) {
    throw new Error('无法找到 WorkspaceFrame.tsx 中的 transition 配置。')
  }

  const transitionCode = `  const transition =
    disableLayoutAnimation || shouldReduceMotion
      ? { duration: 0 }
      : {
          type: 'tween' as const,
          duration: 0.42,
          ease: [0.4, 0, 0.2, 1] as const,
        }

  return (
`

  const nextContent = originalContent.replace(
    transitionPattern,
    transitionCode,
  )

  writeFile(WORKSPACE_FRAME_PATH, nextContent)
}

function updateWorkspaceShell() {
  const originalContent = readFile(WORKSPACE_SHELL_PATH)

  const shadowClass =
    ' shadow-[-12px_0_28px_-22px_rgba(0,0,0,0.45)]'

  const nextContent = originalContent.replaceAll(shadowClass, '')

  if (nextContent === originalContent) {
    console.log(
      `未发现阴影：${path.relative(ROOT, WORKSPACE_SHELL_PATH)}，无需删除。`,
    )
    return
  }

  writeFile(WORKSPACE_SHELL_PATH, nextContent)
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
      `命令执行失败（退出码 ${String(result.status)}）：${command} ${args.join(' ')}`,
    )
  }
}

function main() {
  const shouldApply = process.argv.includes('--apply')

  if (!shouldApply) {
    throw new Error('请添加 --apply 参数执行修改。')
  }

  console.log(`仓库目录：${ROOT}\n`)

  updateWorkspaceFrame()
  updateWorkspaceShell()

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    'features/workspace/src/presentation/shell/WorkspaceFrame.tsx',
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'typecheck',
  ])

  console.log('\n修改完成：')
  console.log('- 已删除主内容区阴影')
  console.log('- 已改为 0.42 秒渐进式 Ease In Out 覆盖动画')
}

try {
  main()
} catch (error) {
  console.error('\n修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}