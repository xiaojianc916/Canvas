#!/usr/bin/env node

import {
  cp,
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  join,
  relative,
  resolve,
} from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldWrite =
  process.argv.includes('--write')

const writes = new Map()

function absolute(path) {
  return resolve(root, path)
}

async function exists(path) {
  try {
    await stat(absolute(path))
    return true
  } catch {
    return false
  }
}

async function read(path) {
  return readFile(
    absolute(path),
    'utf8',
  )
}

function write(path, content) {
  writes.set(path, content)
}

async function edit(path, transform) {
  const content = await read(path)
  const updated = transform(content)

  if (content === updated) {
    throw new Error(
      `文件未产生修改：${path}`,
    )
  }

  write(path, updated)
}

function replaceOnce(
  content,
  oldText,
  newText,
  description,
) {
  const index = content.indexOf(oldText)

  if (index < 0) {
    throw new Error(
      `找不到待修改内容：${description}`,
    )
  }

  if (
    content.indexOf(
      oldText,
      index + oldText.length,
    ) >= 0
  ) {
    throw new Error(
      `待修改内容不唯一：${description}`,
    )
  }

  return (
    content.slice(0, index) +
    newText +
    content.slice(
      index + oldText.length,
    )
  )
}

async function preflight() {
  const required = [
    'apps/desktop/src-tauri/src/commands/file.rs',
    'apps/desktop/src-tauri/src/bootstrap/app.rs',
    'editor/persistence/native/src/atomic_write.rs',
    'editor/persistence/native/src/recovery.rs',
    'tests/performance/report-bundle.mjs',
    'docs/architecture/refactor-progress.md',
  ]

  for (const path of required) {
    if (!(await exists(path))) {
      throw new Error(
        `缺少前置文件：${path}`,
      )
    }
  }

  const fileCommands = await read(
    'apps/desktop/src-tauri/src/commands/file.rs',
  )

  if (
    !fileCommands.includes(
      'MAX_DRAW_FILE_BYTES',
    )
  ) {
    throw new Error(
      'Phase 5 原生文件大小边界尚未落地。',
    )
  }

  const app = await read(
    'apps/desktop/src-tauri/src/bootstrap/app.rs',
  )

  if (
    app.includes('commands::asset::')
  ) {
    throw new Error(
      '仍存在未实现的 Asset command 注册。',
    )
  }

  if (
    await exists(
      'features/workspace/src/presentation/shell/WorkspaceChrome.tsx',
    )
  ) {
    throw new Error(
      '废弃 WorkspaceChrome 尚未删除。',
    )
  }

  if (
    shouldWrite &&
    !(await exists(
      'apps/desktop/dist/.vite/manifest.json',
    ))
  ) {
    throw new Error(
      [
        '找不到 Desktop Vite manifest。',
        '请先执行：pnpm build:desktop',
      ].join('\n'),
    )
  }
}

function createApprovedPathRegistry() {
  write(
    'apps/desktop/src-tauri/src/security/mod.rs',
    `mod approved_paths;

pub use approved_paths::ApprovedPathRegistry;
`,
  )

  write(
    'apps/desktop/src-tauri/src/security/approved_paths.rs',
    `use crate::{Error, Result};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;

/// Stores exact paths explicitly selected through a native file dialog.
///
/// Renderer-provided paths are never trusted on their own. A path must first
/// be approved by file_open or file_save during the current application
/// process.
#[derive(Default)]
pub struct ApprovedPathRegistry {
    paths: RwLock<HashSet<PathBuf>>,
}

impl ApprovedPathRegistry {
    pub fn approve(&self, path: &Path) -> Result<PathBuf> {
        let normalized = normalize_path(path)?;
        let mut paths = self.paths.write().map_err(|_| {
            Error::Internal(
                "approved path registry write lock poisoned".into(),
            )
        })?;

        paths.insert(normalized.clone());
        Ok(normalized)
    }

    pub fn require(&self, path: &Path) -> Result<PathBuf> {
        let normalized = normalize_path(path)?;
        let paths = self.paths.read().map_err(|_| {
            Error::Internal(
                "approved path registry read lock poisoned".into(),
            )
        })?;

        if paths.contains(&normalized) {
            return Ok(normalized);
        }

        Err(Error::PermissionDenied(format!(
            "path was not approved by a native file dialog: {}",
            normalized.display()
        )))
    }
}

fn normalize_path(path: &Path) -> Result<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err(Error::Validation(
            "file path cannot be empty".into(),
        ));
    }

    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };

    if absolute.exists() {
        return Ok(absolute.canonicalize()?);
    }

    let mut normalized = PathBuf::new();

    for component in absolute.components() {
        match component {
            Component::Prefix(prefix) => {
                normalized.push(prefix.as_os_str());
            }
            Component::RootDir => {
                normalized.push(component.as_os_str());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(Error::Validation(
                        "file path escapes its root".into(),
                    ));
                }
            }
            Component::Normal(value) => {
                normalized.push(value);
            }
        }
    }

    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unapproved_paths() {
        let directory = tempfile::tempdir().unwrap();
        let registry = ApprovedPathRegistry::default();
        let path = directory.path().join("canvas.draw");

        let error = registry.require(&path).unwrap_err();

        assert!(matches!(error, Error::PermissionDenied(_)));
    }

    #[test]
    fn accepts_the_exact_approved_path() {
        let directory = tempfile::tempdir().unwrap();
        let registry = ApprovedPathRegistry::default();
        let path = directory.path().join("canvas.draw");

        registry.approve(&path).unwrap();

        assert_eq!(
            registry.require(&path).unwrap(),
            path
        );
    }

    #[test]
    fn does_not_authorize_sibling_paths() {
        let directory = tempfile::tempdir().unwrap();
        let registry = ApprovedPathRegistry::default();
        let approved = directory.path().join("one.draw");
        let sibling = directory.path().join("two.draw");

        registry.approve(&approved).unwrap();

        assert!(matches!(
            registry.require(&sibling),
            Err(Error::PermissionDenied(_))
        ));
    }

    #[test]
    fn normalizes_relative_segments() {
        let directory = tempfile::tempdir().unwrap();
        let registry = ApprovedPathRegistry::default();
        let path = directory
            .path()
            .join("folder")
            .join("..")
            .join("canvas.draw");

        registry.approve(&path).unwrap();

        assert_eq!(
            registry.require(&path).unwrap(),
            directory.path().join("canvas.draw")
        );
    }
}
`,
  )
}

async function wireSecurityState() {
  await edit(
    'apps/desktop/src-tauri/src/lib.rs',
    (content) =>
      replaceOnce(
        content,
        `pub mod ipc;

pub use bootstrap::app;`,
        `pub mod ipc;
pub mod security;

pub use bootstrap::app;`,
        '注册 security module',
      ),
  )

  await edit(
    'apps/desktop/src-tauri/src/bootstrap/app.rs',
    (content) => {
      let updated = replaceOnce(
        content,
        `use crate::commands;`,
        `use crate::commands;
use crate::security::ApprovedPathRegistry;`,
        '导入 ApprovedPathRegistry',
      )

      updated = replaceOnce(
        updated,
        `    tauri::Builder::<Wry>::default()
        .plugin(logging::plugin().build())`,
        `    tauri::Builder::<Wry>::default()
        .manage(ApprovedPathRegistry::default())
        .plugin(logging::plugin().build())`,
        '注入 ApprovedPathRegistry state',
      )

      return updated
    },
  )
}

async function secureFileCommands() {
  await edit(
    'apps/desktop/src-tauri/src/commands/file.rs',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `use crate::error::Result;`,
        `use crate::error::Result;
use crate::security::ApprovedPathRegistry;`,
        '导入路径注册表',
      )

      updated = replaceOnce(
        updated,
        `use std::path::PathBuf;
use tauri::{AppHandle, command};`,
        `use std::path::{Path, PathBuf};
use tauri::{AppHandle, State, command};`,
        '导入 Path 和 State',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_open(app: AppHandle, options: Option<OpenFileOptions>) -> Result<OpenFileResult> {`,
        `pub async fn file_open(
    app: AppHandle,
    registry: State<'_, ApprovedPathRegistry>,
    options: Option<OpenFileOptions>,
) -> Result<OpenFileResult> {`,
        '为 file_open 注入 registry',
      )

      updated = replaceOnce(
        updated,
        `        Some(paths) => Ok(OpenFileResult {
            paths: paths.into_iter().map(file_path_to_string).collect(),
            cancelled: false,
        }),`,
        `        Some(paths) => {
            let mut approved_paths = Vec::with_capacity(paths.len());

            for path in paths {
                if let FilePath::Path(ref native_path) = path {
                    registry.approve(native_path)?;
                }

                approved_paths.push(file_path_to_string(path));
            }

            Ok(OpenFileResult {
                paths: approved_paths,
                cancelled: false,
            })
        }`,
        '系统打开对话框授权路径',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_save(app: AppHandle, options: Option<SaveFileOptions>) -> Result<SaveFileResult> {`,
        `pub async fn file_save(
    app: AppHandle,
    registry: State<'_, ApprovedPathRegistry>,
    options: Option<SaveFileOptions>,
) -> Result<SaveFileResult> {`,
        '为 file_save 注入 registry',
      )

      updated = replaceOnce(
        updated,
        `        Some(path) => Ok(SaveFileResult {
            path: Some(file_path_to_string(path)),
            cancelled: false,
        }),`,
        `        Some(path) => {
            if let FilePath::Path(ref native_path) = path {
                registry.approve(native_path)?;
            }

            Ok(SaveFileResult {
                path: Some(file_path_to_string(path)),
                cancelled: false,
            })
        }`,
        '系统保存对话框授权路径',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_save_as(app: AppHandle, options: SaveFileOptions) -> Result<SaveFileResult> {
    file_save(app, Some(options)).await
}`,
        `pub async fn file_save_as(
    app: AppHandle,
    registry: State<'_, ApprovedPathRegistry>,
    options: SaveFileOptions,
) -> Result<SaveFileResult> {
    file_save(app, registry, Some(options)).await
}`,
        '传递 save-as registry',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_save_draw(request: DrawSaveRequest) -> Result<()> {`,
        `pub async fn file_save_draw(
    registry: State<'_, ApprovedPathRegistry>,
    request: DrawSaveRequest,
) -> Result<()> {`,
        '保护 file_save_draw',
      )

      updated = replaceOnce(
        updated,
        `    let path = PathBuf::from(&request.path);

    if let Some(parent) = path.parent() {`,
        `    let path = registry.require(Path::new(&request.path))?;
    ensure_draw_path(&path)?;

    if let Some(parent) = path.parent() {`,
        '保存前验证授权路径',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_read_draw(path: String) -> Result<DrawReadResult> {
    let metadata = std::fs::metadata(&path)?;`,
        `pub async fn file_read_draw(
    registry: State<'_, ApprovedPathRegistry>,
    path: String,
) -> Result<DrawReadResult> {
    let path = registry.require(Path::new(&path))?;
    ensure_draw_path(&path)?;
    let metadata = std::fs::metadata(&path)?;`,
        '读取前验证授权路径',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_create_draw(path: String, content: String) -> Result<DrawReadResult> {`,
        `pub async fn file_create_draw(
    registry: State<'_, ApprovedPathRegistry>,
    path: String,
    content: String,
) -> Result<DrawReadResult> {`,
        '保护 file_create_draw',
      )

      updated = replaceOnce(
        updated,
        `    let file_path = PathBuf::from(&path);

    if let Some(parent) = file_path.parent() {`,
        `    let file_path = registry.require(Path::new(&path))?;
    ensure_draw_path(&file_path)?;

    if let Some(parent) = file_path.parent() {`,
        '创建前验证授权路径',
      )

      updated += `

fn ensure_draw_path(path: &Path) -> Result<()> {
    let is_draw = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("draw"));

    if is_draw {
        return Ok(());
    }

    Err(crate::Error::Validation(format!(
        "expected a .draw file path: {}",
        path.display()
    )))
}
`

      return updated
    },
  )
}

function fixRecoveryAndAddTests() {
  write(
    'editor/persistence/native/src/recovery.rs',
    `//! Crash recovery helpers for interrupted Canvas commits.

use crate::Result;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryAction {
    RemovedTemporary(PathBuf),
    RestoredBackup(PathBuf),
    KeptDestination(PathBuf),
}

pub fn recover_directory(
    directory: impl AsRef<Path>,
) -> Result<Vec<RecoveryAction>> {
    let directory = directory.as_ref();
    let mut actions = Vec::new();

    if !directory.exists() {
        return Ok(actions);
    }

    for entry in std::fs::read_dir(directory)? {
        let path = entry?.path();
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();

        if name.starts_with(".hybrid-canvas-")
            && name.ends_with(".tmp")
        {
            std::fs::remove_file(&path)?;
            actions.push(
                RecoveryAction::RemovedTemporary(path),
            );
            continue;
        }

        let Some(destination) =
            backup_destination(&path)
        else {
            continue;
        };

        if destination.exists() {
            std::fs::remove_file(&path)?;
            actions.push(
                RecoveryAction::KeptDestination(
                    destination,
                ),
            );
        } else {
            std::fs::rename(&path, &destination)?;
            actions.push(
                RecoveryAction::RestoredBackup(
                    destination,
                ),
            );
        }
    }

    Ok(actions)
}

fn backup_destination(
    backup: &Path,
) -> Option<PathBuf> {
    let name = backup
        .file_name()?
        .to_str()?;

    let destination_name = name
        .strip_prefix('.')?
        .strip_suffix(".backup")?;

    if !destination_name.ends_with(".draw") {
        return None;
    }

    Some(
        backup.with_file_name(
            destination_name,
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_interrupted_temporary_files() {
        let directory = tempfile::tempdir().unwrap();
        let temporary = directory
            .path()
            .join(".hybrid-canvas-test.tmp");

        std::fs::write(&temporary, b"partial").unwrap();

        let actions =
            recover_directory(directory.path()).unwrap();

        assert!(!temporary.exists());
        assert_eq!(
            actions,
            vec![RecoveryAction::RemovedTemporary(
                temporary,
            )]
        );
    }

    #[test]
    fn restores_windows_backup_to_original_name() {
        let directory = tempfile::tempdir().unwrap();
        let backup =
            directory.path().join(".canvas.draw.backup");
        let destination =
            directory.path().join("canvas.draw");

        std::fs::write(&backup, b"previous").unwrap();

        let actions =
            recover_directory(directory.path()).unwrap();

        assert!(!backup.exists());
        assert_eq!(
            std::fs::read(&destination).unwrap(),
            b"previous"
        );
        assert_eq!(
            actions,
            vec![RecoveryAction::RestoredBackup(
                destination,
            )]
        );
    }

    #[test]
    fn keeps_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let backup =
            directory.path().join(".canvas.draw.backup");
        let destination =
            directory.path().join("canvas.draw");

        std::fs::write(&backup, b"previous").unwrap();
        std::fs::write(&destination, b"current").unwrap();

        let actions =
            recover_directory(directory.path()).unwrap();

        assert!(!backup.exists());
        assert_eq!(
            std::fs::read(&destination).unwrap(),
            b"current"
        );
        assert_eq!(
            actions,
            vec![RecoveryAction::KeptDestination(
                destination,
            )]
        );
    }
}
`,
  )
}

async function addAtomicWriteTests() {
  await edit(
    'editor/persistence/native/src/atomic_write.rs',
    (content) => {
      if (
        content.includes(
          'atomic_write_creates_and_replaces_file',
        )
      ) {
        throw new Error(
          'atomic_write tests 已存在。',
        )
      }

      return `${content}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_creates_and_replaces_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("canvas.draw");

        atomic_write(&path, b"first").unwrap();
        assert_eq!(
            std::fs::read(&path).unwrap(),
            b"first"
        );

        atomic_write(&path, b"second").unwrap();
        assert_eq!(
            std::fs::read(&path).unwrap(),
            b"second"
        );
    }

    #[test]
    fn successful_write_leaves_no_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("canvas.draw");

        atomic_write(&path, b"content").unwrap();

        let temporary_count =
            std::fs::read_dir(directory.path())
                .unwrap()
                .filter_map(std::result::Result::ok)
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".hybrid-canvas-")
                })
                .count();

        assert_eq!(temporary_count, 0);
    }
}
`
    },
  )
}

function createBundleBudgetChecker() {
  write(
    'tests/performance/check-bundle-budget.mjs',
    `#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs'
import {
  dirname,
  join,
  resolve,
} from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const manifestPath = join(
  root,
  'apps/desktop/dist/.vite/manifest.json',
)
const baselinePath = join(
  root,
  'tests/performance/bundle-baseline.json',
)

if (!existsSync(manifestPath)) {
  fail('Vite manifest not found. Run pnpm build:desktop first.')
}

if (!existsSync(baselinePath)) {
  fail('Bundle baseline not found.')
}

const manifest = JSON.parse(
  readFileSync(manifestPath, 'utf8'),
)
const baseline = JSON.parse(
  readFileSync(baselinePath, 'utf8'),
)
const distRoot = resolve(
  dirname(manifestPath),
  '..',
)
const files = new Map()

for (const entry of Object.values(manifest)) {
  collect(entry.file, 'javascript')

  for (const file of entry.css ?? []) {
    collect(file, 'css')
  }

  for (const file of entry.assets ?? []) {
    collect(file, 'assets')
  }
}

const current = {
  javascriptBytes: total('javascript'),
  cssBytes: total('css'),
  assetBytes: total('assets'),
}

current.totalBytes =
  current.javascriptBytes +
  current.cssBytes +
  current.assetBytes

const tolerance =
  baseline.tolerancePercent / 100

const failures = []

for (const key of [
  'javascriptBytes',
  'cssBytes',
  'assetBytes',
  'totalBytes',
]) {
  const limit = Math.ceil(
    baseline[key] * (1 + tolerance),
  )

  if (current[key] > limit) {
    failures.push(
      \`\${key}: \${current[key]} bytes exceeds \${limit} bytes\`,
    )
  }
}

console.log({
  baseline,
  current,
})

if (failures.length > 0) {
  fail(
    ['Bundle budget exceeded:', ...failures].join('\\n'),
  )
}

console.log('Bundle budget passed.')

function collect(file, kind) {
  if (!file || files.has(file)) {
    return
  }

  const path = join(distRoot, file)

  if (existsSync(path)) {
    files.set(file, {
      kind,
      bytes: statSync(path).size,
    })
  }
}

function total(kind) {
  return [...files.values()]
    .filter((file) => file.kind === kind)
    .reduce(
      (sum, file) => sum + file.bytes,
      0,
    )
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
`,
  )
}

async function calculateBundleBaseline() {
  const manifestPath =
    'apps/desktop/dist/.vite/manifest.json'

  if (!(await exists(manifestPath))) {
    return
  }

  const manifest = JSON.parse(
    await read(manifestPath),
  )

  const distRoot = absolute(
    'apps/desktop/dist',
  )

  const files = new Map()

  async function collect(file, kind) {
    if (!file || files.has(file)) {
      return
    }

    const path = join(distRoot, file)

    try {
      const info = await stat(path)

      files.set(file, {
        kind,
        bytes: info.size,
      })
    } catch {
      // Ignore manifest entries absent from output.
    }
  }

  for (const entry of Object.values(manifest)) {
    await collect(
      entry.file,
      'javascript',
    )

    for (const file of entry.css ?? []) {
      await collect(file, 'css')
    }

    for (
      const file of entry.assets ?? []
    ) {
      await collect(file, 'assets')
    }
  }

  function total(kind) {
    return [...files.values()]
      .filter(
        (file) => file.kind === kind,
      )
      .reduce(
        (sum, file) =>
          sum + file.bytes,
        0,
      )
  }

  const javascriptBytes =
    total('javascript')
  const cssBytes = total('css')
  const assetBytes = total('assets')

  write(
    'tests/performance/bundle-baseline.json',
    `${JSON.stringify(
      {
        schemaVersion: 1,
        tolerancePercent: 10,
        javascriptBytes,
        cssBytes,
        assetBytes,
        totalBytes:
          javascriptBytes +
          cssBytes +
          assetBytes,
      },
      null,
      2,
    )}\n`,
  )
}

async function updateReleaseCommands() {
  const packageJson =
    JSON.parse(await read('package.json'))

  packageJson.scripts[
    'analyze:bundle:check'
  ] =
    'node tests/performance/check-bundle-budget.mjs'

  packageJson.scripts[
    'verify:release'
  ] =
    'pnpm format:check && pnpm lint && pnpm test:architecture && pnpm typecheck && pnpm test && pnpm build:desktop && pnpm analyze:bundle:check && pnpm clippy'

  write(
    'package.json',
    `${JSON.stringify(
      packageJson,
      null,
      2,
    )}\n`,
  )

  await edit(
    '.github/workflows/quality.yml',
    (content) =>
      replaceOnce(
        content,
        `      - name: Bundle report
        run: pnpm analyze:bundle`,
        `      - name: Bundle budget
        run: pnpm analyze:bundle:check`,
        'CI 启用 bundle budget',
      ),
  )
}

function createReleaseChecklist() {
  write(
    'tests/desktop-e2e/release-checklist.md',
    `# Desktop release acceptance

This checklist covers native interactions that are not honestly exercised by
the browser-only Vite test environment.

## Window chrome

- [ ] Dragging an empty title-bar region moves the native window.
- [ ] Double-clicking the title bar toggles maximize and restore.
- [ ] Minimize sends the window to the taskbar or dock.
- [ ] Close exits immediately when no canvas is dirty.
- [ ] Interactive buttons do not start window dragging.

## Document lifecycle

- [ ] Create a canvas, save it through the native save dialog, close it and reopen it.
- [ ] A dirty canvas requests confirmation before close.
- [ ] Cancel keeps the dirty canvas open.
- [ ] Discard closes without writing unsaved changes.
- [ ] A save failure is visible and does not mark the document clean.
- [ ] Files larger than 32 MiB are rejected.
- [ ] A renderer-supplied path not selected by a native dialog is rejected.

## Recovery

- [ ] Existing destination wins over a stale backup.
- [ ] Missing destination is restored from its backup.
- [ ] Interrupted temporary files are removed during recovery.
- [ ] The restored filename is visible and does not begin with a dot.

## Settings

- [ ] Theme, language, auto-save and canvas settings survive restart.
- [ ] Reset restores Rust and TypeScript defaults consistently.

## Evidence

Record the tested commit, operating system and result in the release PR.
Do not mark desktop release acceptance complete from unit tests alone.
`,
  )
}

async function updateProgress() {
  await edit(
    'docs/architecture/refactor-progress.md',
    (content) => {
      let updated = content

      updated = updated.replace(
        `| 5. Compatibility and release verification | In progress | Settings IPC aligned, draw fixtures and native size boundaries added |`,
        `| 5. Compatibility and release verification | Complete | Settings IPC aligned, draw fixtures and native size boundaries added |`,
      )

      if (
        !updated.includes(
          '| 6. Security and release gates |',
        )
      ) {
        updated = updated.replace(
          `| 5. Compatibility and release verification | Complete | Settings IPC aligned, draw fixtures and native size boundaries added |`,
          `| 5. Compatibility and release verification | Complete | Settings IPC aligned, draw fixtures and native size boundaries added |
| 6. Security and release gates | Complete after verification | Approved-path registry, recovery tests and measured bundle budgets |`,
        )
      }

      updated += `

## Completion criteria

The architecture refactor is complete when the automated release verification
passes. Native desktop release acceptance remains a per-release activity and
must be recorded using tests/desktop-e2e/release-checklist.md.
`

      return updated
    },
  )
}

async function backupFiles() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = absolute(
    `.refactor-backup/${stamp}`,
  )

  for (const path of writes.keys()) {
    if (!(await exists(path))) {
      continue
    }

    const target = resolve(
      backupRoot,
      path,
    )

    await mkdir(
      dirname(target),
      {
        recursive: true,
      },
    )

    await cp(
      absolute(path),
      target,
    )
  }

  return backupRoot
}

async function apply() {
  for (const [path, content] of writes) {
    await mkdir(
      dirname(absolute(path)),
      {
        recursive: true,
      },
    )

    await writeFile(
      absolute(path),
      content,
      'utf8',
    )
  }
}

async function main() {
  await preflight()

  createApprovedPathRegistry()
  await wireSecurityState()
  await secureFileCommands()
  fixRecoveryAndAddTests()
  await addAtomicWriteTests()
  createBundleBudgetChecker()
  await calculateBundleBaseline()
  await updateReleaseCommands()
  createReleaseChecklist()
  await updateProgress()

  console.log('')
  console.log(
    shouldWrite
      ? 'Phase 6 修改：'
      : 'Phase 6 预览：',
  )

  for (const path of writes.keys()) {
    console.log(`  WRITE ${path}`)
  }

  if (!shouldWrite) {
    console.log('')
    console.log(
      '执行 pnpm build:desktop 后，使用 --write 写入。',
    )
    return
  }

  const backupRoot =
    await backupFiles()

  await apply()

  console.log('')
  console.log(
    `备份：${relative(root, backupRoot)}`,
  )
  console.log('')
  console.log('下一步：')
  console.log('')
  console.log('  pnpm format')
  console.log('  pnpm install')
  console.log('  pnpm verify:release')
  console.log('  pnpm tauri dev')
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error('Phase 6 执行失败：')
  console.error(error)
  process.exitCode = 1
})