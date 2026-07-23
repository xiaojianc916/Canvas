#!/usr/bin/env node
/**
 * refactor.mjs — 续跑已推送版本的安全加固
 *
 * 用法：
 *   node refactor.mjs          # 仅预览，不写入
 *   node refactor.mjs --write  # 执行修改
 *
 * 当前脚本只处理上次失败后尚未完成的两项：
 * 1. Windows 原子覆盖写入：先改为 fail-closed，禁止旧的“原文件 -> 固定 backup
 *    -> 新文件”两阶段覆盖流程造成数据丢失。
 * 2. GitHub Actions：加入 JavaScript dependency audit。
 *
 * 设计原则：
 * - 先读取并生成全部变更；任一步不满足预期则不写任何文件。
 * - 写入失败时自动回滚本次已写文件。
 * - 保留 CRLF / LF。
 * - 不修改已经推送成功的 package.json、Cargo.toml、app.rs、opener.rs。
 *
 * 说明：
 * 这个版本不会假装实现 Windows 的原子覆盖替换。
 * 在引入 ReplaceFileW / MoveFileExW 的经过测试的平台后端前，
 * 已存在目标文件的 Windows 保存会明确失败，而不是冒险损坏用户文件。
 */

import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const writeMode = process.argv.includes('--write')
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const backupRoot = join(root, '.hardening-backup', `resume-${timestamp}`)

const TARGETS = {
  atomicWrite: 'editor/persistence/native/src/atomic_write.rs',
  qualityWorkflow: '.github/workflows/quality.yml',
}

function fail(message) {
  throw new Error(message)
}

function normalizeNewlines(content) {
  return content.replaceAll('\r\n', '\n')
}

function detectEol(content) {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

function withOriginalEol(content, eol) {
  return content.replaceAll('\n', eol)
}

function countOccurrences(content, value) {
  return content.split(value).length - 1
}

function assertOnce(content, value, description) {
  const count = countOccurrences(content, value)

  if (count !== 1) {
    fail(`${description}：预期匹配 1 次，实际匹配 ${count} 次。未写入任何文件。`)
  }
}

async function fileExists(relativePath) {
  try {
    await stat(join(root, relativePath))
    return true
  } catch {
    return false
  }
}

async function load(relativePath) {
  const absolutePath = join(root, relativePath)

  if (!(await fileExists(relativePath))) {
    fail(`找不到文件：${relativePath}`)
  }

  return readFile(absolutePath, 'utf8')
}

function patchAtomicWrite(original) {
  const eol = detectEol(original)
  let content = normalizeNewlines(original)

  const unsafeWindowsImplementation = `#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    let backup = backup_path(destination);
    if destination.exists() {
        std::fs::rename(destination, &backup)?;
    }
    match std::fs::rename(source, destination) {
        Ok(()) => {
            let _ = std::fs::remove_file(backup);
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::rename(backup, destination);
            Err(error.into())
        }
    }
}

#[cfg(windows)]
fn backup_path(destination: &Path) -> PathBuf {
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("canvas.draw");
    destination.with_file_name(format!(".{name}.backup"))
}
`

  const safeWindowsImplementation = `#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    // 禁止旧流程：
    //   destination -> 固定 backup -> source -> destination
    //
    // 旧流程不是原子替换：进程崩溃、目标文件锁定、磁盘错误或并发保存时，
    // destination 可能已经消失，而固定 backup 文件名还会发生冲突。
    //
    // std::fs 没有提供 Windows 的安全“覆盖替换”API。接入并测试
    // ReplaceFileW / MoveFileExW 平台后端前，宁可拒绝覆盖已有文件，
    // 也不允许保存操作破坏用户的旧文档。
    if destination.exists() {
        return Err(Error::Persistence(
            "Windows overwrite is disabled until an atomic replacement backend is configured"
                .into(),
        ));
    }

    std::fs::rename(source, destination)?;
    Ok(())
}
`

  if (content.includes(safeWindowsImplementation.trimEnd())) {
    console.log('跳过：Windows fail-closed 保存保护已存在')
    return original
  }

  assertOnce(content, unsafeWindowsImplementation, 'Windows replace_file 旧实现')

  content = content.replace(unsafeWindowsImplementation, safeWindowsImplementation)

  const pathImport = 'use std::path::{Path, PathBuf};'
  if (content.includes(pathImport)) {
    assertOnce(content, pathImport, 'Path / PathBuf import')
    content = content.replace(pathImport, 'use std::path::Path;')
  }

  return withOriginalEol(content, eol)
}

function patchQualityWorkflow(original) {
  const eol = detectEol(original)
  let content = normalizeNewlines(original)

  const auditStep = `      - name: JavaScript dependency audit
        run: pnpm audit --audit-level high
`

  if (content.includes('- name: JavaScript dependency audit')) {
    console.log('跳过：JavaScript dependency audit 已存在')
    return original
  }

  const installStep = `      - name: Install dependencies
        run: pnpm install --frozen-lockfile
`

  assertOnce(content, installStep, 'CI dependency installation step')

  content = content.replace(installStep, `${installStep}\n${auditStep}`)

  return withOriginalEol(content, eol)
}

async function buildPlan() {
  const atomicOriginal = await load(TARGETS.atomicWrite)
  const workflowOriginal = await load(TARGETS.qualityWorkflow)

  const plan = [
    {
      path: TARGETS.atomicWrite,
      before: atomicOriginal,
      after: patchAtomicWrite(atomicOriginal),
    },
    {
      path: TARGETS.qualityWorkflow,
      before: workflowOriginal,
      after: patchQualityWorkflow(workflowOriginal),
    },
  ].filter((entry) => entry.before !== entry.after)

  if (plan.length === 0) {
    console.log('\n没有需要修改的文件。')
  }

  return plan
}

async function backupAll(plan) {
  for (const entry of plan) {
    const sourcePath = join(root, entry.path)
    const backupPath = join(backupRoot, entry.path)

    await mkdir(dirname(backupPath), { recursive: true })
    await copyFile(sourcePath, backupPath)
  }
}

async function writeOne(entry) {
  const targetPath = join(root, entry.path)
  const temporaryPath = `${targetPath}.refactor-${process.pid}.tmp`

  await writeFile(temporaryPath, entry.after, 'utf8')
  await rename(temporaryPath, targetPath)
}

async function restoreAll(plan) {
  for (const entry of plan) {
    const backupPath = join(backupRoot, entry.path)
    const targetPath = join(root, entry.path)

    if (await fileExists(relative(backupRoot, backupPath))) {
      await copyFile(backupPath, targetPath)
    }
  }
}

async function applyPlan(plan) {
  await backupAll(plan)

  const written = []

  try {
    for (const entry of plan) {
      await writeOne(entry)
      written.push(entry)

      console.log(`已修改：${entry.path}`)
    }
  } catch (error) {
    console.error('\n写入失败，正在回滚本次变更……')

    for (const entry of written.reverse()) {
      const backupPath = join(backupRoot, entry.path)
      const targetPath = join(root, entry.path)
      await copyFile(backupPath, targetPath)
    }

    throw error
  }
}

async function main() {
  console.log(`仓库根目录：${root}`)
  console.log(`模式：${writeMode ? '写入' : '预览（不会修改文件）'}`)

  const plan = await buildPlan()

  if (plan.length === 0) {
    return
  }

  console.log('\n计划修改：')
  for (const entry of plan) {
    console.log(`  - ${entry.path}`)
  }

  if (!writeMode) {
    console.log('\n预览结束。确认后执行：node refactor.mjs --write')
    return
  }

  console.log(`\n备份目录：${backupRoot}`)
  await applyPlan(plan)

  console.log('\n完成。必须继续执行：')
  console.log('  pnpm format:check')
  console.log('  pnpm lint')
  console.log('  pnpm test:architecture')
  console.log('  pnpm verify:release')
  console.log('  cargo test --workspace --all-features')
  console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')
  console.log('\n注意：Windows 已存在文件的覆盖保存现在会安全失败。')
  console.log('在实现并测试 ReplaceFileW / MoveFileExW 后端前，不应恢复 Windows 覆盖保存。')
}

main().catch((error) => {
  console.error(`\n脚本失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})