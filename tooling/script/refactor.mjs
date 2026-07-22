#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: This migration CLI reports its changes. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()

const APPLY = process.argv.includes('--apply')

const FILES = {
  splitter: 'features/workspace/src/presentation/shell/SidebarSplitter.tsx',

  field: 'foundations/design-system/src/components/ui/field.tsx',

  theme: 'foundations/design-system/src/theme-controller.ts',

  workspacePublicApi: 'features/workspace/src/public-api.ts',
}

function absolute(relativePath) {
  return path.join(ROOT, relativePath)
}

function read(relativePath) {
  const filePath = absolute(relativePath)

  if (!fs.existsSync(filePath)) {
    throw new Error(`缺少文件：${relativePath}`)
  }

  return fs.readFileSync(filePath, 'utf8')
}

function assertRepository() {
  const packageFile = absolute('package.json')

  if (!fs.existsSync(packageFile)) {
    throw new Error('请在仓库根目录运行脚本。')
  }

  const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'))

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error('当前目录不是 hybrid-canvas 仓库。')
  }
}

function replaceRequired(content, search, replacement, label) {
  if (content.includes(replacement)) {
    return content
  }

  const count = content.split(search).length - 1

  if (count !== 1) {
    throw new Error([label, '：预期匹配 1 次，', '实际匹配 ', String(count), ' 次。'].join(''))
  }

  return content.replace(search, replacement)
}

function fixSplitter(content) {
  let next = content

  next = replaceRequired(
    next,
    ['    <div', '      aria-label="调整侧边栏宽度"'].join('\n'),
    ['    <hr', '      aria-label="调整侧边栏宽度"'].join('\n'),
    'SidebarSplitter 语义元素',
  )

  next = next.replace('\n      role="separator"', '')

  return next
}

function fixField(content) {
  let next = content

  const replacements = [
    ['readonly descriptionId?: string', 'readonly descriptionId: string | undefined'],
    ['readonly errorId?: string', 'readonly errorId: string | undefined'],
    ['readonly describedBy?: string', 'readonly describedBy: string | undefined'],
  ]

  for (const [search, replacement] of replacements) {
    next = next.replace(search, replacement)
  }

  return next
}

function fixThemeController(content) {
  return content.replace(
    ['root.dataset.theme = ', "dark ? 'dark' : 'light'"].join(''),
    ['root.setAttribute(', "'data-theme', ", "dark ? 'dark' : 'light'", ')'].join(''),
  )
}

function fixWorkspacePublicApi(content) {
  const suppression =
    '/* biome-ignore-all lint/performance/noReExportAll: The package public API intentionally re-exports its contract entry. */'

  let next = content.replace(/^\uFEFF/, '')

  if (
    next.includes('export * from') &&
    !next.includes('biome-ignore-all lint/performance/noReExportAll')
  ) {
    next = [suppression, next].join('\n')
  }

  return next
}

function buildChanges() {
  const transforms = [
    [FILES.splitter, fixSplitter],
    [FILES.field, fixField],
    [FILES.theme, fixThemeController],
    [FILES.workspacePublicApi, fixWorkspacePublicApi],
  ]

  const changes = []

  for (const [relativePath, transform] of transforms) {
    const currentContent = read(relativePath)

    const nextContent = transform(currentContent)

    if (currentContent === nextContent) {
      continue
    }

    changes.push({
      relativePath,
      nextContent,
    })
  }

  return changes
}

function printPlan(changes) {
  console.log(`将修改 ${changes.length} 个文件：`)

  for (const change of changes) {
    console.log(`- ${change.relativePath}`)
  }
}

function applyChanges(changes) {
  for (const change of changes) {
    fs.writeFileSync(absolute(change.relativePath), change.nextContent, 'utf8')
  }

  execFileSync('git', ['diff', '--check'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
}

function main() {
  assertRepository()

  const changes = buildChanges()

  if (changes.length === 0) {
    console.log('没有需要应用的定向修复。')

    return
  }

  printPlan(changes)

  if (!APPLY) {
    console.log('')
    console.log('当前为预检模式。')

    console.log('应用命令：')

    console.log('node tooling/script/fix-post-refactor.mjs --apply')

    return
  }

  applyChanges(changes)

  console.log('')
  console.log('定向修复已应用。')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)

  process.exitCode = 1
}
