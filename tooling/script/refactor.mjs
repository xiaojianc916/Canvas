#!/usr/bin/env node

/**
 * Canvas 工程审查修复脚本
 *
 * 用法：
 *   node tooling/script/apply-engineering-review-fixes.mjs
 *   node tooling/script/apply-engineering-review-fixes.mjs --check
 *
 * 自动修改：
 *   1. 完成 pnpm 11 allowBuilds 审批
 *   2. 固定 CI Rust 版本为 1.88.0
 *   3. 删除 Tauri capability 重复权限
 *   4. 修复 Import 错误文案
 *   5. 不再吞掉 Tauri Store 初始化错误
 *   6. 不再静默吞掉设置反序列化错误
 *   7. 不再静默吞掉最近文件反序列化错误
 *   8. 统一 DRAW 文件大小校验和错误分类
 *
 * 脚本采用“先验证全部修改、再统一写入”的方式，任意断言失败时不会写文件。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const checkOnly = process.argv.includes('--check')

const files = new Map()
const changes = []

function filePath(relativePath) {
  return resolve(root, relativePath)
}

async function load(relativePath) {
  if (!files.has(relativePath)) {
    files.set(relativePath, await readFile(filePath(relativePath), 'utf8'))
  }

  return files.get(relativePath)
}

function stage(relativePath, content, description) {
  files.set(relativePath, content)
  changes.push({ relativePath, description })
}

function countOccurrences(content, search) {
  if (search.length === 0) {
    throw new Error('不能统计空字符串')
  }

  let count = 0
  let offset = 0

  while (true) {
    const index = content.indexOf(search, offset)
    if (index === -1) {
      return count
    }

    count += 1
    offset = index + search.length
  }
}

function replaceExact(content, search, replacement, options = {}) {
  const { expected = 1, label = search.slice(0, 80) } = options
  const actual = countOccurrences(content, search)

  if (actual !== expected) {
    throw new Error(
      `修改断言失败：${label}\n预期匹配 ${expected} 次，实际匹配 ${actual} 次。`,
    )
  }

  return content.replace(search, replacement)
}

function replaceAllExact(content, search, replacement, options = {}) {
  const { expected, label = search.slice(0, 80) } = options
  const actual = countOccurrences(content, search)

  if (expected !== undefined && actual !== expected) {
    throw new Error(
      `修改断言失败：${label}\n预期匹配 ${expected} 次，实际匹配 ${actual} 次。`,
    )
  }

  if (actual === 0) {
    throw new Error(`修改断言失败：${label}\n没有找到待替换内容。`)
  }

  return content.replaceAll(search, replacement)
}

async function assertRepository() {
  const packageJson = JSON.parse(await load('package.json'))

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `请在 Canvas 仓库根目录执行脚本；当前 package.json.name 为 ${String(
        packageJson.name,
      )}`,
    )
  }
}

async function fixPnpmAllowBuilds() {
  const relativePath = 'pnpm-workspace.yaml'
  let content = await load(relativePath)

  content = replaceExact(
    content,
    `allowBuilds:
  "@parcel/watcher": true
  blake3: set this to true or false
  core-js: set this to true or false
  esbuild: true
  leveldown: set this to true or false`,
    `allowBuilds:
  "@parcel/watcher": true
  blake3: true
  core-js: false
  esbuild: true
  leveldown: true`,
    { label: 'pnpm allowBuilds 审批配置' },
  )

  stage(relativePath, content, '完成 pnpm 11 构建脚本审批')
}

async function pinRustToolchainInCi() {
  const relativePath = '.github/workflows/quality.yml'
  let content = await load(relativePath)

  content = replaceExact(
    content,
    'uses: dtolnay/rust-toolchain@stable',
    'uses: dtolnay/rust-toolchain@1.88.0',
    { label: 'GitHub Actions Rust 工具链' },
  )

  stage(relativePath, content, '将 CI Rust 工具链固定为 1.88.0')
}

async function removeRedundantTauriPermissions() {
  const relativePath = 'apps/desktop/src-tauri/capabilities/main-window.json'
  const original = await load(relativePath)
  const capability = JSON.parse(original)

  if (!Array.isArray(capability.permissions)) {
    throw new Error(`${relativePath} 中缺少 permissions 数组`)
  }

  const redundantPermissions = [
    'core:window:default',
    'core:event:default',
  ]

  for (const permission of redundantPermissions) {
    const count = capability.permissions.filter(
      (value) => value === permission,
    ).length

    if (count !== 1) {
      throw new Error(
        `${relativePath} 中权限 ${permission} 预期出现 1 次，实际出现 ${count} 次`,
      )
    }
  }

  capability.permissions = capability.permissions.filter(
    (permission) => !redundantPermissions.includes(permission),
  )

  stage(
    relativePath,
    `${JSON.stringify(capability, null, 2)}\n`,
    '删除 core:default 已包含的重复 Tauri 权限',
  )
}

async function fixRustErrorMessage() {
  const relativePath = 'apps/desktop/src-tauri/src/error.rs'
  let content = await load(relativePath)

  content = replaceExact(
    content,
    'Error::Import(e) => write!(f, "Export error: {}", e),',
    'Error::Import(e) => write!(f, "Import error: {}", e),',
    { label: 'Import 错误显示文案' },
  )

  stage(relativePath, content, '修复 Import 错误被显示为 Export 的问题')
}

async function stopIgnoringStoreInitializationFailure() {
  const relativePath = 'apps/desktop/src-tauri/src/bootstrap/app.rs'
  let content = await load(relativePath)

  content = replaceExact(
    content,
    `.setup(|app| {
            let _ = app.store("settings.json");
            Ok(())
        })`,
    `.setup(|app| {
            app.store("settings.json")?;
            Ok(())
        })`,
    { label: 'Tauri Store 初始化错误处理' },
  )

  stage(relativePath, content, '不再忽略 settings store 初始化失败')
}

async function fixSettingsDeserialization() {
  const relativePath = 'apps/desktop/src-tauri/src/commands/settings.rs'
  let content = await load(relativePath)

  content = replaceExact(
    content,
    'use crate::error::Result;',
    'use crate::error::{Error, Result};',
    { label: 'settings.rs Error import' },
  )

  content = replaceExact(
    content,
    `#[command]
pub async fn settings_get(app: AppHandle) -> Result<AppSettings> {
    let store = app.store("settings.json")?;
    let settings: AppSettings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(settings)
}`,
    `#[command]
pub async fn settings_get(app: AppHandle) -> Result<AppSettings> {
    let store = app.store("settings.json")?;

    match store.get("settings") {
        None => Ok(AppSettings::default()),
        Some(value) => serde_json::from_value(value)
            .map_err(|error| Error::Validation(format!("invalid settings: {error}"))),
    }
}`,
    { label: 'settings_get 静默降级逻辑' },
  )

  stage(relativePath, content, '区分设置不存在和设置数据损坏')
}

async function fixFileCommandErrorHandling() {
  const relativePath = 'apps/desktop/src-tauri/src/commands/file.rs'
  let content = await load(relativePath)

  content = replaceExact(
    content,
    'use crate::error::Result;',
    'use crate::error::{Error, Result};',
    { label: 'file.rs Error import' },
  )

  content = replaceExact(
    content,
    `#[command]
pub async fn file_recent_list(app: AppHandle) -> Result<Vec<RecentFile>> {
    let store = app.store("recent-files.json")?;
    let files: Vec<RecentFile> = store
        .get("files")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(files)
}`,
    `#[command]
pub async fn file_recent_list(app: AppHandle) -> Result<Vec<RecentFile>> {
    let store = app.store("recent-files.json")?;

    match store.get("files") {
        None => Ok(Vec::new()),
        Some(value) => serde_json::from_value(value)
            .map_err(|error| Error::Validation(format!("invalid recent files: {error}"))),
    }
}`,
    { label: 'file_recent_list 静默降级逻辑' },
  )

  content = replaceExact(
    content,
    `    if request.content.len() as u64 > MAX_DRAW_FILE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "DRAW_FILE_TOO_LARGE",
        )
        .into());
    }

    let path = registry.require(Path::new(&request.path))?;`,
    `    ensure_draw_size(request.content.len() as u64)?;

    let path = registry.require(Path::new(&request.path))?;`,
    { label: 'file_save_draw 文件大小校验' },
  )

  content = replaceExact(
    content,
    `    if metadata.len() > MAX_DRAW_FILE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "DRAW_FILE_TOO_LARGE",
        )
        .into());
    }

    let content = std::fs::read_to_string(&path)?;`,
    `    ensure_draw_size(metadata.len())?;

    let content = std::fs::read_to_string(&path)?;`,
    { label: 'file_read_draw 文件大小校验' },
  )

  content = replaceExact(
    content,
    `    if content.len() as u64 > MAX_DRAW_FILE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "DRAW_FILE_TOO_LARGE",
        )
        .into());
    }

    let file_path = registry.require(Path::new(&path))?;`,
    `    ensure_draw_size(content.len() as u64)?;

    let file_path = registry.require(Path::new(&path))?;`,
    { label: 'file_create_draw 文件大小校验' },
  )

  content = replaceExact(
    content,
    `

fn ensure_draw_path(path: &Path) -> Result<()> {`,
    `

fn ensure_draw_size(size: u64) -> Result<()> {
    if size <= MAX_DRAW_FILE_BYTES {
        return Ok(());
    }

    Err(Error::Validation(format!(
        "draw file exceeds {MAX_DRAW_FILE_BYTES} bytes"
    )))
}

fn ensure_draw_path(path: &Path) -> Result<()> {`,
    { label: '插入统一 DRAW 文件大小校验函数' },
  )

  content = replaceExact(
    content,
    `    Err(crate::Error::Validation(format!(
        "expected a .draw file path: {}",
        path.display()
    )))`,
    `    Err(Error::Validation(format!(
        "expected a .draw file path: {}",
        path.display()
    )))`,
    { label: '统一 file.rs Error 引用' },
  )

  stage(
    relativePath,
    content,
    '修复最近文件错误吞噬并统一 DRAW 文件大小校验',
  )
}

async function ensureNoUnresolvedAllowBuildPlaceholders() {
  const content = files.get('pnpm-workspace.yaml')

  if (content.includes('set this to true or false')) {
    throw new Error(
      'pnpm-workspace.yaml 中仍存在 “set this to true or false” 占位值',
    )
  }
}

async function writeChanges() {
  const uniqueFiles = new Map()

  for (const change of changes) {
    uniqueFiles.set(change.relativePath, files.get(change.relativePath))
  }

  if (checkOnly) {
    console.log(`检查完成：需要修改 ${uniqueFiles.size} 个文件。`)

    for (const change of changes) {
      console.log(`- ${change.relativePath}: ${change.description}`)
    }

    process.exitCode = 1
    return
  }

  for (const [relativePath, content] of uniqueFiles) {
    await writeFile(filePath(relativePath), content, 'utf8')
  }

  console.log(`修改完成：共更新 ${uniqueFiles.size} 个文件。`)

  for (const change of changes) {
    console.log(`- ${change.relativePath}: ${change.description}`)
  }

  console.log('')
  console.log('请继续执行：')
  console.log('  pnpm install --frozen-lockfile')
  console.log('  pnpm format')
  console.log('  cargo fmt')
  console.log('  pnpm verify:release')
  console.log('  pnpm audit --audit-level high')
  console.log('  cargo deny check')
}

async function main() {
  await assertRepository()

  await fixPnpmAllowBuilds()
  await pinRustToolchainInCi()
  await removeRedundantTauriPermissions()
  await fixRustErrorMessage()
  await stopIgnoringStoreInitializationFailure()
  await fixSettingsDeserialization()
  await fixFileCommandErrorHandling()
  await ensureNoUnresolvedAllowBuildPlaceholders()

  await writeChanges()
}

main().catch((error) => {
  console.error('')
  console.error('修复脚本执行失败，尚未写入任何文件。')
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})