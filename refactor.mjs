#!/usr/bin/env node
/**
 * 当前仓库状态的原子回滚脚本。
 *
 * 当前断裂提交链：
 *
 * b4fa25d  <- 最后一个前后端文件协议一致的提交
 *   |
 * 0bde319  <- 开始 document IPC 重构，但未迁移 bootstrap/document service
 *   |
 * 24d4702  <- 删除旧 public API，导致 createDrawFileCommands 导入错误
 *
 * 本脚本严格按逆序回滚：
 *   1. revert 24d4702
 *   2. revert 0bde319
 *
 * 回滚结果：恢复到 b4fa25d 的一致运行状态。
 *
 * 用法：
 *   node refactor.mjs --check
 *   node refactor.mjs --write
 */

import { execFileSync } from 'node:child_process'
import process from 'node:process'

const mode = process.argv.includes('--write')
  ? 'write'
  : process.argv.includes('--check')
    ? 'check'
    : null

const latestBrokenCommit = '24d4702426cbe725ad14f758f72a4f0dfb064cf1'
const incompleteRefactorCommit = '0bde319bb2c9aefbe9c9edc2c02daca8af24a472'
const expectedStableCommit = 'b4fa25d12e188edae4c0f6e5cee21b7960d476a8'

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim()
}

function gitStatus(args) {
  try {
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: 'ignore',
    })

    return true
  } catch {
    return false
  }
}

function ensureCleanWorkingTree() {
  const status = git(['status', '--porcelain'])

  if (status.length > 0) {
    fail(
      [
        '工作区不干净，拒绝创建回滚提交。',
        '请先提交、暂存或丢弃本地修改后重试。',
        '',
        status,
      ].join('\n'),
    )
  }
}

function ensureExpectedHistory() {
  const head = git(['rev-parse', 'HEAD'])

  if (head !== latestBrokenCommit) {
    fail(
      [
        '当前 HEAD 不是预期的第二个断裂提交。',
        `预期: ${latestBrokenCommit}`,
        `实际: ${head}`,
        '脚本拒绝回滚，避免误撤销后续提交。',
      ].join('\n'),
    )
  }

  const parent = git(['rev-parse', 'HEAD^'])

  if (parent !== incompleteRefactorCommit) {
    fail(
      [
        '当前 HEAD 的父提交不是预期的不完整 document IPC 重构提交。',
        `预期父提交: ${incompleteRefactorCommit}`,
        `实际父提交: ${parent}`,
        '脚本拒绝回滚。',
      ].join('\n'),
    )
  }

  const grandparent = git(['rev-parse', 'HEAD^^'])

  if (grandparent !== expectedStableCommit) {
    fail(
      [
        '提交链基线不符合预期。',
        `预期稳定基线: ${expectedStableCommit}`,
        `实际基线: ${grandparent}`,
        '脚本拒绝回滚。',
      ].join('\n'),
    )
  }

  if (!gitStatus(['merge-base', '--is-ancestor', incompleteRefactorCommit, 'HEAD'])) {
    fail('不完整重构提交不属于当前 HEAD 历史，拒绝回滚。')
  }
}

function ensureBrokenTopology() {
  const publicApi = git([
    'show',
    'HEAD:platforms/desktop-runtime/src/public-api.ts',
  ])

  const bootstrap = git([
    'show',
    'HEAD:apps/desktop/src/bootstrap/application.ts',
  ])

  const runtimeAdapter = git([
    'show',
    'HEAD:platforms/desktop-runtime/src/adapters/file/file-system.ts',
  ])

  const hasOldBootstrap = bootstrap.includes('createDrawFileCommands')
  const hasNewAdapter =
    runtimeAdapter.includes('createDocumentFileCommands') &&
    !runtimeAdapter.includes('createDrawFileCommands')
  const removedOldExport =
    !publicApi.includes('createDrawFileCommands') &&
    publicApi.includes('createDocumentFileCommands')

  if (!hasOldBootstrap || !hasNewAdapter || !removedOldExport) {
    fail(
      [
        '当前代码不符合预期断裂拓扑。',
        '需要同时满足：旧 bootstrap、 新 adapter、删除旧 public export。',
        '脚本拒绝执行，避免覆盖已完成的手工迁移。',
      ].join('\n'),
    )
  }
}

function revert(commit) {
  console.log(`正在回滚 ${commit} ...`)

  execFileSync('git', ['revert', '--no-edit', commit], {
    stdio: 'inherit',
  })
}

if (!mode) {
  fail('请使用 node refactor.mjs --check 或 node refactor.mjs --write')
}

ensureCleanWorkingTree()
ensureExpectedHistory()
ensureBrokenTopology()

if (mode === 'check') {
  console.error('ERROR: 检测到未完成的 document IPC 跨层重构。')
  console.error('')
  console.error(`将按逆序回滚：`)
  console.error(`1. ${latestBrokenCommit}`)
  console.error(`2. ${incompleteRefactorCommit}`)
  console.error('')
  console.error(`回滚后基线：${expectedStableCommit}`)
  process.exit(1)
}

try {
  revert(latestBrokenCommit)
  revert(incompleteRefactorCommit)
} catch {
  fail(
    [
      '回滚发生冲突。',
      '',
      '请不要添加 createDrawFileCommands 兼容别名。',
      '应解决冲突并继续完成整个回滚：',
      '  git status',
      '  <解决冲突>',
      '  git add <已解决文件>',
      '  git revert --continue',
      '',
      '若第二次 revert 尚未开始，继续执行：',
      `  git revert --no-edit ${incompleteRefactorCommit}`,
    ].join('\n'),
  )
}

const finalHead = git(['rev-parse', 'HEAD^^'])

console.log('')
console.log('已完成两次逆序回滚。')
console.log(`稳定基线应为：${expectedStableCommit}`)
console.log(`当前回滚提交之前的基线：${finalHead}`)
console.log('')
console.log('现在执行：')
console.log('  pnpm typecheck')
console.log('  pnpm test')
console.log('  cargo test --workspace --all-features')
console.log('  pnpm dev')