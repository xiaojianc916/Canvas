#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const path = resolve('refactor.mjs')
let source = readFileSync(path, 'utf8')

/**
 * 1) main() 里的前置检查改成：
 *    assertRepository()
 *    assertTargetFilesClean()
 *
 * 不再依赖 assertCleanWorktree / assertPreviousMigrationCompleted。
 */
source = replaceMainPreflight(source)

/**
 * 2) 用新的目标文件检查函数，整体替换掉：
 *    function assertCleanWorktree() { ... }
 *    function assertPreviousMigrationCompleted() { ... }（如果有）
 *
 * 替换范围：从 assertCleanWorktree 起，到 replaceEditorCanvas 前。
 */
source = replacePreflightFunctions(source)

/**
 * 3) 去掉 shell: true，避免 DEP0190
 */
source = source.replaceAll(
  "shell: process.platform === 'win32',",
  'shell: false,',
)

/**
 * 4) 所有 execFileSync(command, ...) 改成 execFileSync(resolveExecutable(command), ...)
 */
source = source.replaceAll(
  'execFileSync(command, arguments_, {',
  'execFileSync(resolveExecutable(command), arguments_, {',
)

/**
 * 5) 如果还没有 resolveExecutable，就插到 fail 前面
 */
if (!source.includes('function resolveExecutable(command) {')) {
  const failMarker = 'function fail(message) {'
  const failIndex = source.indexOf(failMarker)

  if (failIndex < 0) {
    throw new Error('找不到 fail 函数，无法插入 resolveExecutable。')
  }

  source =
    source.slice(0, failIndex) +
    `${resolveExecutable.toString()}\n\n` +
    source.slice(failIndex)
}

writeFileSync(path, source, 'utf8')

console.log('已修复 refactor.mjs：')
console.log('- 删除 FlowNode / scientific 的错误前置依赖')
console.log('- 只检查本次要改的两个目标文件')
console.log('- shell 改为 false，消除 DEP0190')
console.log('- Windows 下 pnpm 自动解析为 pnpm.cmd')
console.log('')
console.log('下一步执行：')
console.log('  node --check refactor.mjs')
console.log('  node refactor.mjs')

function replaceMainPreflight(input) {
  const mainPattern =
    /assertRepository\(\)\s*[\r\n]+\s*assertCleanWorktree\(\)\s*[\r\n]+\s*assertPreviousMigrationCompleted\(\)/

  if (mainPattern.test(input)) {
    return input.replace(
      mainPattern,
      ['assertRepository()', '  assertTargetFilesClean()'].join('\n'),
    )
  }

  const fallbackPattern =
    /assertRepository\(\)\s*[\r\n]+\s*assertCleanWorktree\(\)/

  if (fallbackPattern.test(input)) {
    return input.replace(
      fallbackPattern,
      ['assertRepository()', '  assertTargetFilesClean()'].join('\n'),
    )
  }

  throw new Error(
    '找不到 main() 内的旧前置检查调用，无法自动修复。',
  )
}

function replacePreflightFunctions(input) {
  const start = input.indexOf('function assertCleanWorktree() {')
  const end = input.indexOf('function replaceEditorCanvas() {')

  if (start < 0) {
    throw new Error('找不到 assertCleanWorktree 函数。')
  }

  if (end < 0) {
    throw new Error('找不到 replaceEditorCanvas 函数。')
  }

  if (end <= start) {
    throw new Error('前置检查函数边界异常。')
  }

  const replacement = [
    assertTargetFilesClean.toString(),
    '',
    assertGitCommandSucceeds.toString(),
    '',
  ].join('\n')

  return input.slice(0, start) + replacement + input.slice(end)
}

function assertTargetFilesClean() {
  const targets = [
    'editor/core/src/react/EditorCanvas.tsx',
    'editor/core/src/react/CanvasToolbar.tsx',
  ]

  for (const target of targets) {
    assertGitCommandSucceeds(
      ['ls-files', '--error-unmatch', '--', target],
      `目标文件未被 Git 跟踪：${target}`,
    )

    assertGitCommandSucceeds(
      ['diff', '--quiet', '--', target],
      [
        `目标文件存在未提交修改：${target}`,
        '请先提交或恢复该文件，避免覆盖人工改动。',
      ].join('\n'),
    )

    assertGitCommandSucceeds(
      ['diff', '--cached', '--quiet', '--', target],
      [
        `目标文件存在已暂存但未提交的修改：${target}`,
        '请先提交或取消暂存。',
      ].join('\n'),
    )
  }
}

function assertGitCommandSucceeds(arguments_, message) {
  try {
    execFileSync('git', arguments_, {
      cwd: root,
      env: process.env,
      stdio: 'ignore',
      shell: false,
    })
  } catch {
    fail(message)
  }
}

function resolveExecutable(command) {
  if (process.platform === 'win32' && command === 'pnpm') {
    return 'pnpm.cmd'
  }

  return command
}