#!/usr/bin/env node
/**
 * scripts/harden-tauri-release.mjs
 *
 * 用法：
 *   node scripts/harden-tauri-release.mjs
 *
 * 作用：
 * - 禁用发布版本的 Tauri DevTools feature
 * - 从 IPC 注册表移除通用窗口创建/销毁/DevTools/系统 opener 命令
 * - 让原 opener command 即使被意外重新注册，也默认拒绝执行
 * - 将 pnpm audit 与 cargo deny 纳入 release script 与 GitHub Actions
 * - 为 Windows 原子覆盖写入插入“禁止不安全覆盖”的保护门
 *
 * 注意：
 * Windows 安全覆盖写入需要后续用 ReplaceFileW / 平台专用实现完成。
 * 本脚本的策略是宁可让覆盖保存失败，也不允许旧文件先被移走导致丢失。
 */

import { readFile, writeFile, mkdir, rename, copyFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const backupRoot = join(root, '.hardening-backup', timestamp)

const files = {
  rootPackage: 'package.json',
  workflow: '.github/workflows/quality.yml',
  workspaceCargo: 'Cargo.toml',
  tauriApp: 'apps/desktop/src-tauri/src/bootstrap/app.rs',
  opener: 'apps/desktop/src-tauri/src/commands/opener.rs',
  atomicWrite: 'editor/persistence/native/src/atomic_write.rs',
}

async function assertFile(relativePath) {
  const absolutePath = join(root, relativePath)

  try {
    await stat(absolutePath)
  } catch {
    throw new Error(`找不到预期文件：${relativePath}`)
  }

  return absolutePath
}

async function load(relativePath) {
  return readFile(await assertFile(relativePath), 'utf8')
}

async function save(relativePath, content) {
  const sourcePath = await assertFile(relativePath)
  const backupPath = join(backupRoot, relativePath)

  await mkdir(dirname(backupPath), { recursive: true })
  await copyFile(sourcePath, backupPath)

  const temporaryPath = `${sourcePath}.hardening-${process.pid}.tmp`
  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, sourcePath)

  console.log(`已修改：${relative(root, sourcePath)}`)
}

function replaceExactly(content, oldText, newText, description) {
  const count = content.split(oldText).length - 1

  if (count !== 1) {
    throw new Error(
      `${description}：预期匹配 1 次，实际匹配 ${count} 次。仓库版本可能已变化，请人工合并。`,
    )
  }

  return content.replace(oldText, newText)
}

function appendUnique(content, marker, text, description) {
  if (content.includes(marker)) {
    console.log(`跳过：${description} 已存在`)
    return content
  }

  return `${content.trimEnd()}\n${text}\n`
}

async function hardenRootPackage() {
  const path = files.rootPackage
  const packageJson = JSON.parse(await load(path))

  const releaseCommand = packageJson.scripts?.['verify:release']
  if (!releaseCommand) {
    throw new Error('package.json 缺少 scripts.verify:release')
  }

  const requiredChecks = ['pnpm audit --audit-level high', 'pnpm audit:rust']
  const missingChecks = requiredChecks.filter((check) => !releaseCommand.includes(check))

  if (missingChecks.length > 0) {
    packageJson.scripts['verify:release'] = `${releaseCommand} && ${missingChecks.join(' && ')}`
  }

  await save(path, `${JSON.stringify(packageJson, null, 2)}\n`)
}

async function hardenCargoWorkspace() {
  const path = files.workspaceCargo
  let content = await load(path)

  content = replaceExactly(
    content,
    'tauri = { version = "2.5.1", features = ["devtools"] }',
    'tauri = { version = "2.5.1", features = [] }',
    '移除 Tauri devtools feature',
  )

  await save(path, content)
}

async function hardenCommandRegistration() {
  const path = files.tauriApp
  let content = await load(path)

  const commandsToRemove = [
    '            commands::window::window_create,\n',
    '            commands::window::window_destroy,\n',
    '            commands::window::window_open_devtools,\n',
    '            commands::opener::opener_show_in_folder,\n',
    '            commands::opener::opener_open_external,\n',
  ]

  for (const command of commandsToRemove) {
    if (content.includes(command)) {
      content = content.replace(command, '')
    }
  }

  const marker = '.invoke_handler(tauri::generate_handler!['
  if (!content.includes(marker)) {
    throw new Error('未找到 Tauri invoke_handler 注册表')
  }

  await save(path, content)
}

async function disableUnsafeOpenerCommands() {
  const path = files.opener

  const replacement = `use crate::error::Result;
use serde::Deserialize;
use specta::Type;
use tauri::command;

#[derive(Debug, Deserialize, Type)]
pub struct ShowInFolderOptions {
    pub path: String,
}

#[derive(Debug, Deserialize, Type)]
pub struct OpenExternalOptions {
    pub url: String,
}

/// 此 command 不应在生产版本注册。
///
/// 原实现把 renderer 可控字符串传入 \`cmd /C start\`、\`open\` 或
/// \`xdg-open\`，其中 Windows 的 cmd.exe 会重新解释元字符，形成命令注入面。
///
/// 若未来需要恢复此能力：
/// 1. 不得通过 shell / command interpreter 启动；
/// 2. 使用官方 tauri-plugin-opener 的受限 API；
/// 3. 用结构化 URL parser 做精确 scheme allowlist；
/// 4. 将 command 限制到特定 capability/window。
#[command]
pub async fn opener_show_in_folder(_options: ShowInFolderOptions) -> Result<()> {
    Err(crate::Error::PermissionDenied(
        "opening arbitrary filesystem paths is disabled in this build".into(),
    ))
}

#[command]
pub async fn opener_open_external(_options: OpenExternalOptions) -> Result<()> {
    Err(crate::Error::PermissionDenied(
        "opening external URLs is disabled in this build".into(),
    ))
}
`

  await save(path, replacement)
}

async function hardenWindowsAtomicWrite() {
  const path = files.atomicWrite
  let content = await load(path)

  const oldImplementation = `#[cfg(windows)]
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

  const safeTemporaryImplementation = `#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    // 禁止旧实现：
    //   destination -> 固定 backup -> source -> destination
    //
    // 该流程在两次 rename 之间可能让正式文件消失；固定 backup 名还会造成
    // 多窗口/多进程冲突。std::fs 当前没有提供 Windows 的安全覆盖替换 API。
    //
    // 在接入 ReplaceFileW / MoveFileExW（带 WRITE_THROUGH）或经过验证的跨平台
    // 原子写库之前，宁可拒绝覆盖已有文件，也不能以数据损坏为代价“看似保存成功”。
    if destination.exists() {
        return Err(Error::Persistence(
            "refusing unsafe Windows overwrite: atomic replacement backend is not configured"
                .into(),
        ));
    }

    std::fs::rename(source, destination)?;
    Ok(())
}
`

  if (!content.includes(oldImplementation)) {
    throw new Error(
      '未找到预期的 Windows replace_file 实现；请不要自动改写 atomic_write.rs。',
    )
  }

  content = content.replace(oldImplementation, safeTemporaryImplementation)
  content = content.replace('use std::path::{Path, PathBuf};', 'use std::path::Path;')

  await save(path, content)
}

async function hardenWorkflow() {
  const path = files.workflow
  let content = await load(path)

  const jsAuditStep = `
      - name: JavaScript dependency audit
        run: pnpm audit --audit-level high
`

  const releaseSecurityNote = `
# Security policy:
# - JavaScript audit runs in CI and release verification.
# - Rust advisories, licenses, bans and sources run via cargo-deny.
# - Pin third-party GitHub Actions to immutable commit SHAs before protected-branch release.
`

  content = appendUnique(
    content,
    '- name: JavaScript dependency audit',
    jsAuditStep,
    'JavaScript dependency audit',
  )

  content = appendUnique(
    content,
    '# Security policy:',
    releaseSecurityNote,
    '安全策略说明',
  )

  await save(path, content)
}

async function main() {
  console.log(`仓库根目录：${root}`)
  console.log(`原始文件备份目录：${backupRoot}`)

  await hardenRootPackage()
  await hardenCargoWorkspace()
  await hardenCommandRegistration()
  await disableUnsafeOpenerCommands()
  await hardenWindowsAtomicWrite()
  await hardenWorkflow()

  console.log('\n已完成机械化安全加固。接下来必须运行：')
  console.log('  pnpm install --frozen-lockfile')
  console.log('  pnpm verify:release')
  console.log('  cargo test --workspace --all-features')
  console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')
  console.log('\nWindows 原子覆盖保存目前会安全拒绝已有文件覆盖。')
  console.log('在实现 ReplaceFileW / MoveFileExW 的平台后端并补足崩溃测试前，不应发布 Windows 覆盖保存功能。')
}

main().catch((error) => {
  console.error(`\n加固脚本失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})