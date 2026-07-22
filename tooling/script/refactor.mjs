#!/usr/bin/env node

/**
 * 修复左侧侧边栏覆盖动画：
 *
 * 1. 删除主界面与左侧侧边栏之间擅自添加的阴影
 * 2. 不再直接动画包含 fr/minmax() 的 gridTemplateColumns
 * 3. 改为动画纯 px CSS 变量，确保真正逐渐覆盖
 * 4. 使用 0.5 秒 ease-in-out，不使用弹簧动画
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
  const content = `import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode, Ref } from 'react'

export interface WorkspaceFrameProps {
  readonly rootRef?: Ref<HTMLDivElement>
  readonly chrome: ReactNode
  readonly rail: ReactNode
  readonly sidebar: ReactNode
  readonly canvas: ReactNode
  readonly inspector: ReactNode
  readonly statusBar: ReactNode
  readonly overlays?: ReactNode
  readonly gridTemplateColumns: string
  readonly gridTemplateRows: string
  readonly sidebarColumnWidth: number
  readonly disableLayoutAnimation?: boolean
}

export function WorkspaceFrame({
  rootRef,
  chrome,
  rail,
  sidebar,
  canvas,
  inspector,
  statusBar,
  overlays,
  gridTemplateColumns,
  gridTemplateRows,
  sidebarColumnWidth,
  disableLayoutAnimation = false,
}: WorkspaceFrameProps) {
  const shouldReduceMotion = useReducedMotion()

  const transition =
    disableLayoutAnimation || shouldReduceMotion
      ? { duration: 0 }
      : {
          type: 'tween' as const,
          duration: 0.5,
          ease: [0.65, 0, 0.35, 1] as const,
        }

  return (
    <motion.div
      animate={{
        '--workspace-sidebar-column-width': sidebarColumnWidth + 'px',
      }}
      className="workspace-shell relative grid h-dvh w-full min-h-0 overflow-hidden bg-background text-foreground"
      initial={false}
      ref={rootRef}
      style={{
        gridTemplateColumns,
        gridTemplateRows,
        willChange: disableLayoutAnimation ? 'auto' : 'grid-template-columns',
      }}
      transition={transition}
    >
      {/* Layout ownership lives here so borders stay single-source and predictable. */}
      {chrome}
      {rail}
      {sidebar}
      {canvas}
      {inspector}
      {statusBar}
      {overlays}
    </motion.div>
  )
}
`

  writeFile(WORKSPACE_FRAME_PATH, content)
}

function updateWorkspaceShell() {
  let content = readFile(WORKSPACE_SHELL_PATH)

  /*
   * 精确删除之前擅自加在主内容区左边界上的阴影。
   */
  content = content.replace(
    /\s+shadow-\[-12px_0_28px_-22px_rgba\(0,0,0,0\.45\)\]/g,
    '',
  )

  /*
   * 防止之前的阴影参数发生格式化差异。
   * 只处理包含“内容区”的 section，不影响其他组件原有样式。
   */
  content = content.replace(
    /(<section[\s\S]*?aria-label="内容区"[\s\S]*?className=")([^"]*)("[\s\S]*?>)/,
    (_, prefix, className, suffix) => {
      const cleanedClassName = className
        .split(/\s+/)
        .filter(Boolean)
        .filter(
          (classToken) =>
            !classToken.startsWith(
              'shadow-[-12px_0_28px_-22px_rgba(0,0,0,0.45)]',
            ),
        )
        .join(' ')

      return prefix + cleanedClassName + suffix
    },
  )

  /*
   * 原实现直接动画整个 gridTemplateColumns：
   *
   * 48px 280px minmax(0, 1fr) 0px
   *
   * 这种复合字符串不能保证连续插值。
   * 现在只动画 --workspace-sidebar-column-width 这个纯 px 变量。
   */
  const columnsPattern =
    /  const columns = useMemo\([\s\S]*?\n\n  const rows =/

  if (!columnsPattern.test(content)) {
    throw new Error(
      '无法找到 WorkspaceShell.tsx 中的 columns 布局计算代码。',
    )
  }

  content = content.replace(
    columnsPattern,
    `  const sidebarColumnWidth = dockSidebar ? sidebarWidth : 0

  const columns = useMemo(
    () =>
      [
        'var(--activity-rail-width)',
        'var(--workspace-sidebar-column-width, 0px)',
        'minmax(0, 1fr)',
        dockInspector ? 'var(--inspector-width)' : '0px',
      ].join(' '),
    [dockInspector],
  )

  const rows =`,
  )

  if (!content.includes('sidebarColumnWidth={sidebarColumnWidth}')) {
    const target = '        gridTemplateRows={rows}'

    if (!content.includes(target)) {
      throw new Error(
        '无法找到 WorkspaceFrame 的 gridTemplateRows 属性。',
      )
    }

    content = content.replace(
      target,
      `${target}
        sidebarColumnWidth={sidebarColumnWidth}`,
    )
  }

  if (
    content.includes(
      'shadow-[-12px_0_28px_-22px_rgba(0,0,0,0.45)]',
    )
  ) {
    throw new Error('主内容区阴影删除失败。')
  }

  writeFile(WORKSPACE_SHELL_PATH, content)
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
  console.log('- 已删除侧边栏与主界面之间添加的阴影')
  console.log('- 已改为真正连续插值的 px 动画')
  console.log('- 动画时长为 0.5 秒')
  console.log('- 使用对称 Ease In Out 缓动')
}

try {
  main()
} catch (error) {
  console.error('\n修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}