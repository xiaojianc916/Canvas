#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const apply = process.argv.includes('--apply')
const skipChecks = process.argv.includes('--skip-checks')

const rustFile =
  'apps/desktop/src-tauri/src/commands/file.rs'

const oldImplementation = `async fn write_draw_file(
    path: PathBuf,
    content: String,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        atomic_write(&path, content.as_bytes())?;
        Ok(content)
    })
    .await
    .map_err(|error| {
        Error::Internal(format!(
            "draw file write task failed: {error}"
        ))
    })?
}`

const newImplementation = `async fn write_draw_file(
    path: PathBuf,
    content: String,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        write_draw_file_blocking(path, content)
    })
    .await
    .map_err(|error| {
        Error::Internal(format!(
            "draw file write task failed: {error}"
        ))
    })?
}

fn write_draw_file_blocking(
    path: PathBuf,
    content: String,
) -> Result<String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    atomic_write(&path, content.as_bytes())?;
    Ok(content)
}`

assertRepository()

if (!apply) {
  console.log('将执行以下修复：')
  console.log('PATCH  ' + rustFile)
  console.log('')
  console.log(
    '把阻塞文件系统操作提取到同步函数中，',
  )
  console.log(
    '异步函数只保留 spawn_blocking 调度边界。',
  )
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

patchRustAsyncBoundary()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log(
  'Rust 文件写入异步边界修复及验证完成。',
)

function patchRustAsyncBoundary() {
  const absolutePath = join(
    root,
    rustFile,
  )

  const source = readFileSync(
    absolutePath,
    'utf8',
  )

  if (
    source.includes(
      'fn write_draw_file_blocking(',
    ) &&
    source.includes(
      'write_draw_file_blocking(path, content)',
    )
  ) {
    console.log(
      'SKIP   ' +
        rustFile +
        '（异步边界已经拆分）',
    )
    return
  }

  const occurrenceCount =
    source.split(oldImplementation).length - 1

  if (occurrenceCount !== 1) {
    throw new Error(
      rustFile +
        ': 预期匹配一次 write_draw_file，实际匹配 ' +
        String(occurrenceCount) +
        ' 次。拒绝生成不完整修改。',
    )
  }

  const updated = source.replace(
    oldImplementation,
    newImplementation,
  )

  assertUpdatedSource(updated)

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + rustFile)
}

function assertUpdatedSource(source) {
  const asyncStart = source.indexOf(
    'async fn write_draw_file(',
  )

  const blockingStart = source.indexOf(
    'fn write_draw_file_blocking(',
  )

  if (
    asyncStart < 0 ||
    blockingStart < 0 ||
    blockingStart <= asyncStart
  ) {
    throw new Error(
      'write_draw_file 阻塞边界拆分失败。',
    )
  }

  const asyncBody = source.slice(
    asyncStart,
    blockingStart,
  )

  if (
    asyncBody.includes('std::fs::')
  ) {
    throw new Error(
      '异步函数体内仍然存在 std::fs。',
    )
  }

  if (
    !asyncBody.includes(
      'tokio::task::spawn_blocking',
    )
  ) {
    throw new Error(
      '异步函数缺少 spawn_blocking 调度边界。',
    )
  }

  if (
    !asyncBody.includes(
      'write_draw_file_blocking(path, content)',
    )
  ) {
    throw new Error(
      '异步函数没有调用同步写入函数。',
    )
  }

  const blockingBody = source.slice(
    blockingStart,
  )

  if (
    !blockingBody.includes(
      'std::fs::create_dir_all(parent)?;',
    )
  ) {
    throw new Error(
      '同步函数缺少目录创建逻辑。',
    )
  }

  if (
    !blockingBody.includes(
      'atomic_write(&path, content.as_bytes())?;',
    )
  ) {
    throw new Error(
      '同步函数缺少原子写入逻辑。',
    )
  }
}

function runChecks() {
  run('cargo', [
    'fmt',
    '--manifest-path',
    'apps/desktop/src-tauri/Cargo.toml',
  ])

  // 先运行原始失败项。
  run('node', [
    'tests/architecture/check-rust-async-boundaries.mjs',
  ])

  // 验证 Rust 代码确实可以编译。
  run('cargo', [
    'check',
    '--manifest-path',
    'apps/desktop/src-tauri/Cargo.toml',
  ])

  // 从头执行全部架构约束。
  run('pnpm', [
    'test:architecture',
  ])

  // 继续之前未运行的验证。
  run('pnpm', [
    '--filter',
    '@hybrid-canvas/desktop',
    'typecheck',
  ])

  run('pnpm', [
    'lint',
  ])

  run('pnpm', [
    'test',
  ])
}

function assertRepository() {
  const packagePath = join(
    root,
    'package.json',
  )

  const rustPath = join(
    root,
    rustFile,
  )

  if (!existsSync(packagePath)) {
    throw new Error(
      '请在 hybrid-canvas 仓库根目录执行脚本。',
    )
  }

  const manifest = JSON.parse(
    readFileSync(packagePath, 'utf8'),
  )

  if (manifest.name !== 'hybrid-canvas') {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库。',
    )
  }

  if (!existsSync(rustPath)) {
    throw new Error(
      '缺少 Rust 文件：' +
        rustFile,
    )
  }

  const rustSource = readFileSync(
    rustPath,
    'utf8',
  )

  if (
    !rustSource.includes(
      'async fn write_draw_file(',
    )
  ) {
    throw new Error(
      rustFile +
        ': 找不到 write_draw_file。',
    )
  }
}

function atomicWrite(
  destination,
  content,
) {
  const temporary =
    destination +
    '.tmp-' +
    process.pid +
    '-' +
    Date.now()

  writeFileSync(
    temporary,
    normalize(content),
    'utf8',
  )

  renameSync(
    temporary,
    destination,
  )
}

function normalize(content) {
  return (
    content
      .replaceAll('\r\n', '\n')
      .trimStart() + '\n'
  )
}

function run(command, args) {
  console.log('')
  console.log(
    'RUN    ' +
      command +
      ' ' +
      args.join(' '),
  )

  const needsWindowsShell =
    process.platform === 'win32' &&
    command === 'pnpm'

  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: needsWindowsShell,
  })
}