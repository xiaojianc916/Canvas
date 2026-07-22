#!/usr/bin/env node

/**
 * Canvas 工程审查第二阶段修复脚本
 *
 * 用法：
 *   node tooling/script/apply-engineering-review-phase2.mjs
 *   node tooling/script/apply-engineering-review-phase2.mjs --check
 *
 * 修改内容：
 *   1. 使用项目已有的 thiserror 收敛 Rust 错误样板代码
 *   2. 保持现有 IPC 序列化结构和错误分类行为
 *   3. 保留 native persistence error 的自定义转换语义
 *   4. 增加错误消息和 IPC 映射回归测试
 *   5. 为 CI 增加 cargo-deny 检查
 *
 * 注意：
 *   - 请先执行第一阶段脚本。
 *   - 本脚本先在内存中完成全部验证，再写入文件。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const checkOnly = process.argv.includes('--check')

const stagedFiles = new Map()
const changes = []

function absolutePath(relativePath) {
  return resolve(root, relativePath)
}

async function read(relativePath) {
  if (!stagedFiles.has(relativePath)) {
    stagedFiles.set(
      relativePath,
      await readFile(absolutePath(relativePath), 'utf8'),
    )
  }

  return stagedFiles.get(relativePath)
}

function stage(relativePath, content, description) {
  stagedFiles.set(relativePath, content)
  changes.push({ relativePath, description })
}

function countOccurrences(content, search) {
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

function replaceExact(
  content,
  search,
  replacement,
  { expected = 1, label = search.slice(0, 100) } = {},
) {
  const actual = countOccurrences(content, search)

  if (actual !== expected) {
    throw new Error(
      [
        `修改断言失败：${label}`,
        `预期匹配 ${expected} 次，实际匹配 ${actual} 次。`,
      ].join('\n'),
    )
  }

  return content.replace(search, replacement)
}

async function assertRepository() {
  const packageJson = JSON.parse(await read('package.json'))

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `请在 Canvas 仓库根目录执行；当前项目为 ${String(
        packageJson.name,
      )}`,
    )
  }

  const cargo = await read('Cargo.toml')

  if (!cargo.includes('thiserror = "2.0.12"')) {
    throw new Error(
      '根 Cargo.toml 未找到 thiserror = "2.0.12"，请先检查依赖版本。',
    )
  }
}

async function refactorRustErrorWithThiserror() {
  const relativePath = 'apps/desktop/src-tauri/src/error.rs'
  let content = await read(relativePath)

  content = replaceExact(
    content,
    `use serde::Serialize;
use specta::Type;
use std::fmt;

#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    Persistence(String),
    SerdeJson(serde_json::Error),
    Tauri(tauri::Error),
    Store(tauri_plugin_store::Error),
    Dialog(tauri_plugin_dialog::Error),
    Fs(tauri_plugin_fs::Error),
    Opener(tauri_plugin_opener::Error),
    Updater(tauri_plugin_updater::Error),
    Clipboard(tauri_plugin_clipboard_manager::Error),
    Shell(tauri_plugin_shell::Error),
    Notification(tauri_plugin_notification::Error),
    WindowState(tauri_plugin_window_state::Error),
    GlobalShortcut(tauri_plugin_global_shortcut::Error),
    Log(tauri_plugin_log::Error),
    Validation(String),
    NotFound(String),
    PermissionDenied(String),
    Internal(String),
    Plugin(String),
    Collaboration(String),
    Export(String),
    Import(String),
    Asset(String),
    File(String),
}`,
    `use serde::Serialize;
use specta::Type;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Persistence error: {0}")]
    Persistence(String),

    #[error("JSON error: {0}")]
    SerdeJson(#[from] serde_json::Error),

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("Store error: {0}")]
    Store(#[from] tauri_plugin_store::Error),

    #[error("Dialog error: {0}")]
    Dialog(#[from] tauri_plugin_dialog::Error),

    #[error("FS error: {0}")]
    Fs(#[from] tauri_plugin_fs::Error),

    #[error("Opener error: {0}")]
    Opener(#[from] tauri_plugin_opener::Error),

    #[error("Updater error: {0}")]
    Updater(#[from] tauri_plugin_updater::Error),

    #[error("Clipboard error: {0}")]
    Clipboard(#[from] tauri_plugin_clipboard_manager::Error),

    #[error("Shell error: {0}")]
    Shell(#[from] tauri_plugin_shell::Error),

    #[error("Notification error: {0}")]
    Notification(#[from] tauri_plugin_notification::Error),

    #[error("Window state error: {0}")]
    WindowState(#[from] tauri_plugin_window_state::Error),

    #[error("Global shortcut error: {0}")]
    GlobalShortcut(#[from] tauri_plugin_global_shortcut::Error),

    #[error("Log error: {0}")]
    Log(#[from] tauri_plugin_log::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Plugin error: {0}")]
    Plugin(String),

    #[error("Collaboration error: {0}")]
    Collaboration(String),

    #[error("Export error: {0}")]
    Export(String),

    #[error("Import error: {0}")]
    Import(String),

    #[error("Asset error: {0}")]
    Asset(String),

    #[error("File error: {0}")]
    File(String),
}`,
    { label: '将 Error enum 转换为 thiserror derive' },
  )

  const handwrittenStart = content.indexOf(
    'impl fmt::Display for Error {',
  )
  const resultAliasStart = content.indexOf(
    'pub type Result<T> = std::result::Result<T, Error>;',
  )

  if (handwrittenStart === -1) {
    throw new Error(
      `${relativePath} 中没有找到手写的 Display 实现，可能已执行过本脚本。`,
    )
  }

  if (resultAliasStart === -1 || resultAliasStart <= handwrittenStart) {
    throw new Error(
      `${relativePath} 中没有找到预期的 Result 类型别名。`,
    )
  }

  const customNativeConversion = `impl From<hybrid_canvas_file_native::Error> for Error {
    fn from(error: hybrid_canvas_file_native::Error) -> Self {
        Self::Persistence(error.to_string())
    }
}

`

  content =
    content.slice(0, handwrittenStart) +
    customNativeConversion +
    content.slice(resultAliasStart)

  const tests = `

#[cfg(test)]
mod tests {
    use super::{Error, IpcErrorCode, IpcOperation};

    #[test]
    fn import_error_uses_import_message() {
        let error = Error::Import("invalid document".to_owned());

        assert_eq!(
            error.to_string(),
            "Import error: invalid document"
        );
    }

    #[test]
    fn export_error_uses_export_message() {
        let error = Error::Export("unsupported target".to_owned());

        assert_eq!(
            error.to_string(),
            "Export error: unsupported target"
        );
    }

    #[test]
    fn validation_error_has_validation_ipc_mapping() {
        let error = Error::Validation("invalid input".to_owned());

        assert!(matches!(error.code(), IpcErrorCode::Validation));
        assert!(matches!(error.operation(), IpcOperation::Platform));
        assert!(!error.recoverable());
    }

    #[test]
    fn import_error_has_import_export_operation() {
        let error = Error::Import("invalid document".to_owned());

        assert!(matches!(
            error.code(),
            IpcErrorCode::ImportExport
        ));
        assert!(matches!(
            error.operation(),
            IpcOperation::ImportExport
        ));
        assert!(!error.recoverable());
    }

    #[test]
    fn io_error_is_recoverable_persistence_error() {
        let error = Error::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "denied",
        ));

        assert!(matches!(
            error.code(),
            IpcErrorCode::Persistence
        ));
        assert!(matches!(
            error.operation(),
            IpcOperation::File
        ));
        assert!(error.recoverable());
    }

    #[test]
    fn serialized_error_preserves_ipc_contract() {
        let value = serde_json::to_value(
            Error::Validation("invalid settings".to_owned()),
        )
        .expect("error should serialize");

        assert_eq!(value["code"], "validation");
        assert_eq!(value["operation"], "platform");
        assert_eq!(
            value["message"],
            "Validation error: invalid settings"
        );
        assert_eq!(value["recoverable"], false);
    }
}
`

  const resultAlias =
    'pub type Result<T> = std::result::Result<T, Error>;'

  content = replaceExact(
    content,
    resultAlias,
    `${resultAlias}${tests}`,
    { label: '为 Error 增加回归测试' },
  )

  if (content.includes('impl fmt::Display for Error')) {
    throw new Error('手写 Display 实现没有被完整删除。')
  }

  if (content.includes('impl std::error::Error for Error')) {
    throw new Error('手写 std::error::Error 实现没有被完整删除。')
  }

  if (content.includes('use std::fmt;')) {
    throw new Error('不再需要的 std::fmt import 没有被删除。')
  }

  stage(
    relativePath,
    content,
    '使用 thiserror 收敛错误样板并增加 IPC 回归测试',
  )
}

async function addCargoDenyToCi() {
  const relativePath = '.github/workflows/quality.yml'
  let content = await read(relativePath)

  if (content.includes('EmbarkStudios/cargo-deny-action')) {
    throw new Error(
      `${relativePath} 已包含 cargo-deny action，可能已执行过本脚本。`,
    )
  }

  const insertionPoint = `      - name: Tests
        run: cargo test --workspace --all-features
`

  const replacement = `      - name: Tests
        run: cargo test --workspace --all-features

      - name: Dependency policy
        uses: EmbarkStudios/cargo-deny-action@v2
        with:
          command: check
          arguments: --all-features
`

  content = replaceExact(
    content,
    insertionPoint,
    replacement,
    { label: '在 Rust CI 末尾加入 cargo-deny' },
  )

  stage(
    relativePath,
    content,
    '在 CI 中执行 Rust 依赖、许可证和来源策略检查',
  )
}

async function validateResult() {
  const errorFile = stagedFiles.get(
    'apps/desktop/src-tauri/src/error.rs',
  )

  const requiredFragments = [
    '#[derive(Debug, Error)]',
    'Io(#[from] std::io::Error)',
    'SerdeJson(#[from] serde_json::Error)',
    'impl From<hybrid_canvas_file_native::Error> for Error',
    'fn serialized_error_preserves_ipc_contract()',
  ]

  for (const fragment of requiredFragments) {
    if (!errorFile.includes(fragment)) {
      throw new Error(
        `最终验证失败：error.rs 缺少 ${fragment}`,
      )
    }
  }

  const forbiddenFragments = [
    'impl fmt::Display for Error',
    'impl std::error::Error for Error',
    'Error::Import(e) => write!(f, "Export error:',
  ]

  for (const fragment of forbiddenFragments) {
    if (errorFile.includes(fragment)) {
      throw new Error(
        `最终验证失败：error.rs 仍包含 ${fragment}`,
      )
    }
  }
}

async function writeStagedFiles() {
  const changedPaths = [
    ...new Set(changes.map(({ relativePath }) => relativePath)),
  ]

  if (checkOnly) {
    console.log(
      `检查完成：第二阶段需要修改 ${changedPaths.length} 个文件。`,
    )

    for (const change of changes) {
      console.log(
        `- ${change.relativePath}: ${change.description}`,
      )
    }

    process.exitCode = 1
    return
  }

  for (const relativePath of changedPaths) {
    await writeFile(
      absolutePath(relativePath),
      stagedFiles.get(relativePath),
      'utf8',
    )
  }

  console.log(
    `第二阶段修改完成：共更新 ${changedPaths.length} 个文件。`,
  )

  for (const change of changes) {
    console.log(
      `- ${change.relativePath}: ${change.description}`,
    )
  }

  console.log('')
  console.log('请执行以下验证命令：')
  console.log('  cargo fmt --all')
  console.log('  cargo check --workspace --all-targets --all-features')
  console.log(
    '  cargo clippy --workspace --all-targets --all-features -- -D warnings',
  )
  console.log('  cargo test --workspace --all-features')
  console.log('  cargo deny check')
  console.log('  pnpm verify:release')
}

async function main() {
  await assertRepository()
  await refactorRustErrorWithThiserror()
  await addCargoDenyToCi()
  await validateResult()
  await writeStagedFiles()
}

main().catch((error) => {
  console.error('')
  console.error(
    '第二阶段修复失败；脚本尚未写入任何文件。',
  )
  console.error(
    error instanceof Error ? error.stack : String(error),
  )
  process.exitCode = 1
})