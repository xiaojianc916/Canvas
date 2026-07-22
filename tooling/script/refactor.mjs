#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: This CLI reports migration results. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const APPLY = process.argv.includes('--apply')

const SNAPSHOT_FILE = 'editor/persistence/src/application/snapshot-service.ts'

const CLI_ROOTS = ['tests', 'tooling']

const NO_CONSOLE_SUPPRESSION =
  '/* biome-ignore-all lint/suspicious/noConsole: CLI scripts intentionally write command output. */'

function absolute(relativePath) {
  return path.join(ROOT, relativePath)
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

function walk(directory) {
  if (!fs.existsSync(directory)) {
    return []
  }

  return fs
    .readdirSync(directory, {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        return walk(entryPath)
      }

      return entry.isFile() ? [entryPath] : []
    })
}

function fixSnapshotService(
  content,
) {
  const suppression =
    '/* biome-ignore-all lint/complexity/useLiteralKeys: Parsed snapshot data uses index signatures until runtime validation completes. */'

  let next = content
    .replaceAll(
      'parsed.header',
      "parsed['header']",
    )
    .replaceAll(
      'header.format',
      "header['format']",
    )
    .replaceAll(
      'header.version',
      "header['version']",
    )
    .replaceAll(
      'header.createdAt',
      "header['createdAt']",
    )

  if (
    !next.includes(
      'biome-ignore-all lint/complexity/useLiteralKeys',
    )
  ) {
    next = [
      suppression,
      next,
    ].join('\n')
  }

  return next
}

function addNoConsoleSuppression(content) {
  if (
    !content.includes('console.') ||
    content.includes('biome-ignore-all lint/suspicious/noConsole')
  ) {
    return content
  }

  if (content.startsWith('#!')) {
    const newlineIndex = content.indexOf('\n')

    if (newlineIndex === -1) {
      return [content, NO_CONSOLE_SUPPRESSION, ''].join('\n')
    }

    return [
      content.slice(0, newlineIndex),
      NO_CONSOLE_SUPPRESSION,
      content.slice(newlineIndex + 1),
    ].join('\n')
  }

  return [NO_CONSOLE_SUPPRESSION, content].join('\n')
}

function buildChanges() {
  const changes = []

  const snapshotPath = absolute(SNAPSHOT_FILE)

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`缺少文件：${SNAPSHOT_FILE}`)
  }

  const snapshotCurrent = fs.readFileSync(snapshotPath, 'utf8')

  const snapshotNext = fixSnapshotService(snapshotCurrent)

  if (snapshotCurrent !== snapshotNext) {
    changes.push({
      relativePath: SNAPSHOT_FILE,

      nextContent: snapshotNext,
    })
  }

  for (const sourceRoot of CLI_ROOTS) {
    const sourceRootPath = absolute(sourceRoot)

    for (const filePath of walk(sourceRootPath)) {
      if (!filePath.endsWith('.mjs')) {
        continue
      }

      const currentContent = fs.readFileSync(filePath, 'utf8')

      const nextContent = addNoConsoleSuppression(currentContent)

      if (currentContent === nextContent) {
        continue
      }

      changes.push({
        relativePath: path.relative(ROOT, filePath).split(path.sep).join('/'),

        nextContent,
      })
    }
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

    console.log('node tooling/script/fix-biome-diagnostics.mjs --apply')

    return
  }

  applyChanges(changes)

  console.log('')
  console.log('定向修复已应用。')

  console.log('')
  console.log('接下来执行：')

  console.log('pnpm exec biome check --write . --max-diagnostics=300')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)

  process.exitCode = 1
}
