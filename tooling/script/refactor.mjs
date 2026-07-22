#!/usr/bin/env node

/**
 * Canvas 左侧侧边栏 Motion 覆盖式动画修改脚本
 *
 * 将此文件保存到仓库根目录，例如：
 *   scripts/add-sidebar-motion.mjs
 *
 * 在仓库根目录运行：
 *   node scripts/add-sidebar-motion.mjs
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

function findRepositoryRoot(startDirectory) {
  let directory = startDirectory

  while (true) {
    const packagePath = path.join(directory, 'package.json')
    const workspacePath = path.join(directory, 'pnpm-workspace.yaml')

    if (fs.existsSync(packagePath) && fs.existsSync(workspacePath)) {
      return directory
    }

    const parent = path.dirname(directory)

    if (parent === directory) {
      throw new Error('找不到仓库根目录，请将脚本放入 Canvas 仓库后再运行。')
    }

    directory = parent
  }
}

const ROOT = findRepositoryRoot(SCRIPT_DIR)

const WORKSPACE_PACKAGE = path.join(ROOT, 'features/workspace/package.json')
const WORKSPACE_FRAME = path.join(
  ROOT,
  'features/workspace/src/presentation/shell/WorkspaceFrame.tsx',
)
const WORKSPACE_SHELL = path.join(
  ROOT,
  'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
)

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在：${path.relative(ROOT, filePath)}`)
  }

  return fs.readFileSync(filePath, 'utf8')
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8')
  console.log(`已修改：${path.relative(ROOT, filePath)}`)
}

function replaceOnce(content, before, after, filePath) {
  if (content.includes(after)) {
    return content
  }

  if (!content.includes(before)) {
    throw new Error(
      [
        `无法修改 ${path.relative(ROOT, filePath)}`,
        '目标代码与脚本预期不一致，仓库代码可能已经发生变化。',
        '',
        '未找到内容：',
        before,
      ].join('\n'),
    )
  }

  return content.replace(before, after)
}

function updatePackageJson() {
  const packageJson = JSON.parse(read(WORKSPACE_PACKAGE))

  packageJson.dependencies ??= {}

  if (packageJson.dependencies.motion !== 'catalog:') {
    packageJson.dependencies.motion = 'catalog:'
  }

  write(WORKSPACE_PACKAGE, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function updateWorkspaceFrame() {
  let content = read(WORKSPACE_FRAME)

  content = replaceOnce(
    content,
    `import type { ReactNode, Ref } from 'react'`,
    `import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode, Ref } from 'react'`,
    WORKSPACE_FRAME,
  )

  content = replaceOnce(
    content,
    `  readonly gridTemplateColumns: string
  readonly gridTemplateRows: string`,
    `  readonly gridTemplateColumns: string
  readonly gridTemplateRows: string
  readonly disableLayoutAnimation?: boolean`,
    WORKSPACE_FRAME,
  )

  content = replaceOnce(
    content,
    `  gridTemplateColumns,
  gridTemplateRows,
}: WorkspaceFrameProps) {
  return (`,
    `  gridTemplateColumns,
  gridTemplateRows,
  disableLayoutAnimation = false,
}: WorkspaceFrameProps) {
  const shouldReduceMotion = useReducedMotion()

  const transition =
    disableLayoutAnimation || shouldReduceMotion
      ? { duration: 0 }
      : {
          type: 'spring' as const,
          stiffness: 420,
          damping: 38,
          mass: 0.8,
        }

  return (`,
    WORKSPACE_FRAME,
  )

  content = replaceOnce(
    content,
    `    <div
      className="workspace-shell relative grid h-dvh w-full min-h-0 overflow-hidden bg-background text-foreground"
      ref={rootRef}
      style={{ gridTemplateColumns, gridTemplateRows }}
    >`,
    `    <motion.div
      animate={{ gridTemplateColumns }}
      className="workspace-shell relative grid h-dvh w-full min-h-0 overflow-hidden bg-background text-foreground"
      initial={false}
      ref={rootRef}
      style={{
        gridTemplateRows,
        willChange: disableLayoutAnimation ? 'auto' : 'grid-template-columns',
      }}
      transition={transition}
    >`,
    WORKSPACE_FRAME,
  )

  content = replaceOnce(
    content,
    `    </div>
  )
}`,
    `    </motion.div>
  )
}`,
    WORKSPACE_FRAME,
  )

  write(WORKSPACE_FRAME, content)
}

function updateWorkspaceShell() {
  let content = read(WORKSPACE_SHELL)

  content = replaceOnce(
    content,
    `      <div
        className="relative row-[2/-1] min-h-0 min-w-0 border-r border-divider bg-sidebar"
        style={{ gridColumn: 2 }}
      >
        {dockSidebar ? sidebarContent : null}

        {dockSidebar ? (`,
    `      <div
        aria-hidden={!dockSidebar}
        className="relative row-[2/-1] min-h-0 min-w-0 overflow-visible border-r border-divider bg-sidebar"
        style={{
          gridColumn: 2,
          pointerEvents: dockSidebar ? 'auto' : 'none',
        }}
      >
        {mode !== 'narrow' ? (
          <div
            className="h-full min-h-0 overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            {sidebarContent}
          </div>
        ) : null}

        {dockSidebar ? (`,
    WORKSPACE_SHELL,
  )

  content = replaceOnce(
    content,
    `      className="row-2 min-h-0 min-w-0 overflow-hidden"
      style={{ gridColumn: 3 }}`,
    `      className="relative z-10 row-2 min-h-0 min-w-0 overflow-hidden border-l border-divider bg-background shadow-[-12px_0_28px_-22px_rgba(0,0,0,0.45)]"
      style={{ gridColumn: 3 }}`,
    WORKSPACE_SHELL,
  )

  content = replaceOnce(
    content,
    `    <div className="min-w-0" style={{ gridColumn: 3, gridRow: 3 }}>`,
    `    <div
      className="relative z-10 min-w-0 border-l border-divider bg-background"
      style={{ gridColumn: 3, gridRow: 3 }}
    >`,
    WORKSPACE_SHELL,
  )

  content = replaceOnce(
    content,
    `        canvas={canvas}
        chrome={chrome}
        gridTemplateColumns={columns}`,
    `        canvas={canvas}
        chrome={chrome}
        disableLayoutAnimation={isResizing}
        gridTemplateColumns={columns}`,
    WORKSPACE_SHELL,
  )

  write(WORKSPACE_SHELL, content)
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

  const executable =
    process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command

  const result = spawnSync(executable, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`命令执行失败：${command} ${args.join(' ')}`)
  }
}

function main() {
  console.log(`仓库目录：${ROOT}\n`)

  updatePackageJson()
  updateWorkspaceFrame()
  updateWorkspaceShell()

  run('pnpm', ['install'])
  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    'features/workspace/package.json',
    'features/workspace/src/presentation/shell/WorkspaceFrame.tsx',
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ])
  run('pnpm', ['--filter', '@hybrid-canvas/workspace', 'typecheck'])

  console.log('\n完成：侧边栏现在会由右侧主界面左滑覆盖，并支持弹簧动画与减少动态效果设置。')
}

try {
  main()
} catch (error) {
  console.error('\n修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}