#!/usr/bin/env node

import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  resolve,
} from 'node:path'
import process from 'node:process'

const root = process.cwd()

const chromePath = resolve(
  root,
  'features/workspace/src/presentation/shell/WorkspaceChrome.tsx',
)

const publicApiPath = resolve(
  root,
  'features/workspace/src/presentation/public-api.ts',
)

const workspaceContainerPath = resolve(
  root,
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)

const backupRoot = resolve(
  root,
  '.refactor-backup',
  new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-'),
)

async function main() {
  const [
    chromeContent,
    publicApiContent,
    workspaceContainerContent,
  ] = await Promise.all([
    readFile(chromePath, 'utf8'),
    readFile(publicApiPath, 'utf8'),
    readFile(
      workspaceContainerPath,
      'utf8',
    ),
  ])

  assertMigrationState(
    chromeContent,
    publicApiContent,
    workspaceContainerContent,
  )

  await Promise.all([
    backup(chromePath),
    backup(publicApiPath),
  ])

  const exportLine =
    `export { CanvasChrome, type CanvasChromeProps } from './shell/WorkspaceChrome'\n`

  const nextPublicApiContent =
    publicApiContent.replace(
      exportLine,
      '',
    )

  if (
    nextPublicApiContent ===
    publicApiContent
  ) {
    throw new Error(
      '未能从 Workspace public API 中删除 CanvasChrome 导出。',
    )
  }

  await writeFile(
    publicApiPath,
    nextPublicApiContent,
    'utf8',
  )

  await rm(chromePath)

  console.log('')
  console.log('已完成：')
  console.log(
    '- 删除废弃的 WorkspaceChrome.tsx',
  )
  console.log(
    '- 删除 CanvasChrome public API 导出',
  )
  console.log(
    '- 保留 DesktopTitleBar 在 desktop composition layer',
  )
  console.log(
    '- WorkspaceShell 继续通过 renderChrome 接收平台 UI',
  )
  console.log('')
  console.log('接下来执行：')
  console.log('')
  console.log('  pnpm format')
  console.log('  pnpm test:architecture')
  console.log('  pnpm typecheck')
  console.log('  pnpm tauri dev')
  console.log('')
}

function assertMigrationState(
  chromeContent,
  publicApiContent,
  workspaceContainerContent,
) {
  if (
    !chromeContent.includes(
      `from './DesktopTitleBar'`,
    )
  ) {
    throw new Error(
      [
        'WorkspaceChrome.tsx 内容与预期不同。',
        '为避免删除有效实现，脚本已停止。',
      ].join('\n'),
    )
  }

  if (
    !publicApiContent.includes(
      `from './shell/WorkspaceChrome'`,
    )
  ) {
    throw new Error(
      'Workspace public API 已经没有 WorkspaceChrome 导出。',
    )
  }

  if (
    !workspaceContainerContent.includes(
      `import { DesktopTitleBar } from '../chrome/DesktopTitleBar'`,
    )
  ) {
    throw new Error(
      [
        'DesktopTitleBar 尚未在 WorkspaceContainer 中正确接线。',
        '不能安全删除旧 WorkspaceChrome。',
      ].join('\n'),
    )
  }

  if (
    !workspaceContainerContent.includes(
      'renderChrome={({',
    )
  ) {
    throw new Error(
      'WorkspaceContainer 尚未通过 renderChrome 注入平台 Chrome。',
    )
  }
}

async function backup(sourcePath) {
  const relativePath =
    sourcePath.slice(root.length + 1)

  const targetPath = resolve(
    backupRoot,
    relativePath,
  )

  await mkdir(
    dirname(targetPath),
    {
      recursive: true,
    },
  )

  await cp(sourcePath, targetPath)
}

main().catch((error) => {
  console.error('')
  console.error(
    '清理旧 WorkspaceChrome 失败：',
  )
  console.error(error)
  process.exitCode = 1
})