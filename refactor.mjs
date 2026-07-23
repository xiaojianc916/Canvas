#!/usr/bin/env node

/**
 * 修复已经完成 Myna UI 迁移后产生的 import 语句粘连问题。
 *
 * 当前问题示例：
 *
 * import { X } from '@mynaui/icons-react'
import { useState } from 'react'
 *
 * 修复为：
 *
 * import { X } from '@mynaui/icons-react'
 * import { useState } from 'react'
 *
 * 正式执行：
 *   node refactor.mjs --apply
 *
 * 跳过后续完整验证：
 *   node refactor.mjs --apply --skip-checks
 *
 * 仅预览：
 *   node refactor.mjs
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.cwd()
const CURRENT_SCRIPT = resolve(fileURLToPath(import.meta.url))

const APPLY = process.argv.includes('--apply')
const SKIP_CHECKS = process.argv.includes('--skip-checks')

const LEGACY_PACKAGE = 'lucide-react'
const TARGET_PACKAGE = '@mynaui/icons-react'

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'target',
])

const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx'])

const changedFiles = new Set()

main().catch((error) => {
  console.error('\n修复失败：')

  if (error instanceof Error) {
    console.error(error.stack ?? error.message)
  } else {
    console.error(String(error))
  }

  process.exitCode = 1
})

function main() {
  assertRepositoryRoot()

  console.log('修复 Myna UI import 语句粘连问题')

  if (!APPLY) {
    console.log('\n当前为预览模式，不会写入文件。')
    console.log('正式执行：')
    console.log('\n  node refactor.mjs --apply\n')
  }

  repairConcatenatedMynaImports()
  assertNoMalformedMynaImports()

  if (!APPLY) {
    console.log('\n预览完成。')
    printChangedFiles()
    return
  }

  formatRepairedFiles()

  assertNoMalformedMynaImports()
  assertNoLegacySourceImports()
  assertNoLegacyDirectDependencies()
  assertMynaDirectDependencies()

  if (!SKIP_CHECKS) {
    runChecks()
  }

  console.log('\n修复完成。')
  printChangedFiles()
}

function assertRepositoryRoot() {
  const requiredFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']

  for (const file of requiredFiles) {
    if (!existsSync(join(ROOT, file))) {
      throw new Error(`请在仓库根目录运行脚本，缺少：${file}`)
    }
  }
}

function repairConcatenatedMynaImports() {
  const sourceFiles = findSourceFiles()

  /**
   * 只处理 Myna UI 静态 import。
   *
   * 捕获：
   *   from '@mynaui/icons-react'
   *
   * 当结束引号后直接跟着标识符时插入换行。
   *
   * 可修复：
   *   ...icons-react'import
   *   ...icons-react'export
   *   ...icons-react'const
   *   ...icons-react'interface
   *   ...icons-react'type
   */
  const concatenatedPattern = /(from\s+['"]@mynaui\/icons-react['"];?)(?=[A-Za-z_$])/g

  for (const file of sourceFiles) {
    const content = readText(file)

    if (!content.includes(TARGET_PACKAGE)) {
      continue
    }

    const repaired = content.replace(concatenatedPattern, '$1\n')

    writeTextIfChanged(file, repaired)
  }
}

function assertNoMalformedMynaImports() {
  const violations = []

  const malformedPattern = /from\s+['"]@mynaui\/icons-react['"];?(?=[A-Za-z_$])/g

  for (const file of findSourceFiles()) {
    const content = readTextForCurrentMode(file)

    malformedPattern.lastIndex = 0

    for (
      let match = malformedPattern.exec(content);
      match;
      match = malformedPattern.exec(content)
    ) {
      violations.push({
        file: relative(ROOT, file),
        line: lineNumberAt(content, match.index),
        snippet: getLineAt(content, match.index),
      })
    }
  }

  if (violations.length === 0) {
    return
  }

  const lines = ['仍然存在 Myna UI import 粘连：', '']

  for (const violation of violations) {
    lines.push(`- ${violation.file}:${violation.line}`, `  ${violation.snippet.trim()}`)
  }

  throw new Error(lines.join('\n'))
}

function assertNoLegacySourceImports() {
  const violations = []

  const legacyPatterns = [
    new RegExp(`\\bfrom\\s+['"]${escapeRegExp(LEGACY_PACKAGE)}['"]`, 'g'),

    new RegExp(`\\bimport\\s+['"]${escapeRegExp(LEGACY_PACKAGE)}['"]`, 'g'),

    new RegExp(`\\bimport\\s*\\(\\s*['"]${escapeRegExp(LEGACY_PACKAGE)}['"]\\s*\\)`, 'g'),

    new RegExp(`\\brequire\\s*\\(\\s*['"]${escapeRegExp(LEGACY_PACKAGE)}['"]\\s*\\)`, 'g'),
  ]

  for (const file of findSourceFiles()) {
    if (resolve(file) === CURRENT_SCRIPT) {
      continue
    }

    const content = readTextForCurrentMode(file)

    for (const pattern of legacyPatterns) {
      pattern.lastIndex = 0

      for (let match = pattern.exec(content); match; match = pattern.exec(content)) {
        violations.push({
          file: relative(ROOT, file),
          line: lineNumberAt(content, match.index),
        })
      }
    }
  }

  if (violations.length === 0) {
    return
  }

  throw new Error(
    [
      `仍然存在 ${LEGACY_PACKAGE} import：`,
      '',
      ...violations.map((violation) => `- ${violation.file}:${violation.line}`),
    ].join('\n'),
  )
}

function assertNoLegacyDirectDependencies() {
  const violations = []

  for (const file of findPackageJsonFiles()) {
    const json = readJson(file)

    for (const sectionName of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      const section = json[sectionName]

      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        continue
      }

      if (LEGACY_PACKAGE in section) {
        violations.push(`${relative(ROOT, file)} -> ${sectionName}`)
      }
    }
  }

  if (violations.length === 0) {
    return
  }

  throw new Error(
    [
      `仍然存在 ${LEGACY_PACKAGE} 直接依赖：`,
      '',
      ...violations.map((violation) => `- ${violation}`),
    ].join('\n'),
  )
}

function assertMynaDirectDependencies() {
  const packagesUsingMyna = new Set()

  for (const file of findSourceFiles()) {
    if (resolve(file) === CURRENT_SCRIPT) {
      continue
    }

    const content = readTextForCurrentMode(file)

    if (!content.includes(TARGET_PACKAGE)) {
      continue
    }

    const packageJsonFile = findNearestPackageJson(file)

    if (!packageJsonFile) {
      throw new Error(`无法为源码找到所属 package.json：${relative(ROOT, file)}`)
    }

    packagesUsingMyna.add(packageJsonFile)
  }

  const violations = []

  for (const packageJsonFile of packagesUsingMyna) {
    const json = readJson(packageJsonFile)

    const hasDependency =
      json.dependencies?.[TARGET_PACKAGE] !== undefined ||
      json.devDependencies?.[TARGET_PACKAGE] !== undefined ||
      json.optionalDependencies?.[TARGET_PACKAGE] !== undefined ||
      json.peerDependencies?.[TARGET_PACKAGE] !== undefined

    if (!hasDependency) {
      violations.push(relative(ROOT, packageJsonFile))
    }
  }

  if (violations.length === 0) {
    return
  }

  throw new Error(
    [
      `以下包使用了 ${TARGET_PACKAGE}，但没有声明依赖：`,
      '',
      ...violations.map((violation) => `- ${violation}`),
    ].join('\n'),
  )
}

function findNearestPackageJson(sourceFile) {
  let currentDirectory = resolve(sourceFile, '..')

  while (currentDirectory.startsWith(ROOT) && currentDirectory !== ROOT) {
    const candidate = join(currentDirectory, 'package.json')

    if (existsSync(candidate)) {
      return candidate
    }

    const parent = resolve(currentDirectory, '..')

    if (parent === currentDirectory) {
      break
    }

    currentDirectory = parent
  }

  const rootPackageJson = join(ROOT, 'package.json')

  return existsSync(rootPackageJson) ? rootPackageJson : null
}

function formatRepairedFiles() {
  const files = new Set([CURRENT_SCRIPT, ...changedFiles])

  const formattableFiles = [...files].filter(
    (file) =>
      existsSync(file) && (SOURCE_EXTENSIONS.has(extname(file)) || extname(file) === '.json'),
  )

  if (formattableFiles.length === 0) {
    return
  }

  console.log('\n格式化修复后的文件...')

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    '--max-diagnostics=200',
    ...formattableFiles.map((file) => relative(ROOT, file)),
  ])
}

function runChecks() {
  console.log('\n检查残留的 Lucide 引用...')

  assertNoLegacySourceImports()
  assertNoLegacyDirectDependencies()

  console.log('\n运行图标库架构检查...')

  run('node', ['tests/architecture/check-icon-library.mjs'])

  console.log('\n运行格式检查...')

  run('pnpm', ['format:check'])

  console.log('\n运行 lint...')

  run('pnpm', ['lint'])

  console.log('\n运行 TypeScript 类型检查...')

  run('pnpm', ['typecheck'])

  console.log('\n运行架构测试...')

  run('pnpm', ['test:architecture'])

  console.log('\n运行测试...')

  run('pnpm', ['test'])

  console.log('\n构建桌面应用...')

  run('pnpm', ['build:desktop'])

  console.log('\n检查 Bundle Budget...')

  run('pnpm', ['analyze:bundle:check'])
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

  const options = {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  }

  if (process.platform === 'win32') {
    const commandLine = [
      quoteWindowsCommandArgument(command),
      ...args.map(quoteWindowsCommandArgument),
    ].join(' ')

    execFileSync(
      process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', commandLine],
      options,
    )

    return
  }

  execFileSync(command, args, options)
}

function quoteWindowsCommandArgument(value) {
  const stringValue = String(value)

  if (stringValue.length === 0) {
    return '""'
  }

  if (!/[\s"&|<>^()]/.test(stringValue)) {
    return stringValue
  }

  return `"${stringValue.replace(/"/g, '""').replace(/%/g, '%%')}"`
}

function findSourceFiles() {
  return findFiles(ROOT, (file) => SOURCE_EXTENSIONS.has(extname(file)))
}

function findPackageJsonFiles() {
  return findFiles(ROOT, (file) => file.endsWith('package.json'))
}

function findFiles(directory, predicate) {
  const files = []

  walk(directory)

  return files

  function walk(currentDirectory) {
    for (const entry of readdirSync(currentDirectory)) {
      if (IGNORED_DIRECTORIES.has(entry)) {
        continue
      }

      const absolutePath = join(currentDirectory, entry)

      const stats = statSync(absolutePath)

      if (stats.isDirectory()) {
        walk(absolutePath)
        continue
      }

      if (predicate(absolutePath)) {
        files.push(absolutePath)
      }
    }
  }
}

function readText(file) {
  const content = readFileSync(file, 'utf8')

  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
}

function readTextForCurrentMode(file) {
  return readText(file)
}

function readJson(file) {
  const content = readText(file)

  try {
    return JSON.parse(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    throw new SyntaxError(`无法解析 JSON 文件：${relative(ROOT, file)}` + `\n${message}`, {
      cause: error,
    })
  }
}

function writeTextIfChanged(file, content) {
  const absolutePath = resolve(file)
  const previous = readText(absolutePath)

  if (previous === content) {
    return
  }

  changedFiles.add(absolutePath)

  if (!APPLY) {
    console.log(`[预览] 修复 ${relative(ROOT, absolutePath)}`)

    return
  }

  writeFileSync(absolutePath, content, 'utf8')

  console.log(`修复 ${relative(ROOT, absolutePath)}`)
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length
}

function getLineAt(content, index) {
  const lineStart = content.lastIndexOf('\n', index - 1) + 1

  const nextLineBreak = content.indexOf('\n', index)

  const lineEnd = nextLineBreak === -1 ? content.length : nextLineBreak

  return content.slice(lineStart, lineEnd)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function printChangedFiles() {
  if (changedFiles.size === 0) {
    console.log('没有需要修复的文件。')
    return
  }

  console.log('\n修复文件：')

  for (const file of [...changedFiles].sort()) {
    console.log(`- ${relative(ROOT, file)}`)
  }
}
