#!/usr/bin/env node

/**
 * 修复顶部栏侧边栏分割线：
 *
 * - 左侧侧边栏关闭：隐藏竖向分割线
 * - 左侧侧边栏打开：显示竖向分割线
 * - 不影响顶部标签栏与侧边栏的同步动画
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

const DESKTOP_TITLE_BAR_PATH = path.join(
  ROOT,
  'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx',
)

function updateDesktopTitleBar() {
  if (!fs.existsSync(DESKTOP_TITLE_BAR_PATH)) {
    throw new Error(
      `文件不存在：${path.relative(ROOT, DESKTOP_TITLE_BAR_PATH)}`,
    )
  }

  let content = fs.readFileSync(DESKTOP_TITLE_BAR_PATH, 'utf8')

  const oldElementPattern =
    /<div\s+className="shrink-0 border-b border-r border-divider"\s+style=\{\{\s*width:\s*'var\(--workspace-sidebar-column-width, 0px\)',?\s*\}\}\s*\/>/

  const newElement = `<div
          className="shrink-0 border-b border-divider"
          style={{
            borderRightStyle: 'solid',
            borderRightWidth: isSidebarOpen ? 1 : 0,
            width: 'var(--workspace-sidebar-column-width, 0px)',
          }}
        />`

  if (oldElementPattern.test(content)) {
    content = content.replace(oldElementPattern, newElement)
  } else if (
    !content.includes(
      'borderRightWidth: isSidebarOpen ? 1 : 0',
    )
  ) {
    throw new Error(
      [
        '找不到顶部栏中的侧边栏宽度占位元素。',
        '请检查 DesktopTitleBar.tsx 当前代码。',
      ].join('\n'),
    )
  }

  fs.writeFileSync(DESKTOP_TITLE_BAR_PATH, content, 'utf8')

  console.log(
    `已修改：${path.relative(ROOT, DESKTOP_TITLE_BAR_PATH)}`,
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

  updateDesktopTitleBar()

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/desktop',
    'typecheck',
  ])

  console.log('\n修改完成：')
  console.log('- 侧边栏关闭时顶部竖向分割线隐藏')
  console.log('- 侧边栏打开时顶部竖向分割线显示')
  console.log('- 顶部标签栏继续复用侧边栏宽度动画')
}

try {
  main()
} catch (error) {
  console.error('\n修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}