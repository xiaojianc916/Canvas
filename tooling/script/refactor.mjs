#!/usr/bin/env node

/**
 * Canvas 工程审查第三阶段修复脚本
 *
 * 用法：
 *   node tooling/script/apply-engineering-review-phase3.mjs
 *   node tooling/script/apply-engineering-review-phase3.mjs --check
 *
 * 前置条件：
 *   已执行 phase1 和 phase2。
 *
 * 修改内容：
 *   1. 为 Tauri crate 启用工作区 Tokio
 *   2. 将 DRAW 文件读取迁移到 tokio::fs
 *   3. 将原子写入和目录创建放入 spawn_blocking
 *   4. 避免在异步 command 中直接执行同步磁盘 I/O
 *   5. 在 CI 中校验 Node、pnpm、Rust 实际版本
 *   6. 在 CI 中禁止未处理的 pnpm allowBuilds 占位值
 *
 * 不自动修改：
 *   tauri-plugin-dialog 的 blocking_pick_*。
 *   该部分涉及 Tauri 对话框线程模型，应单独进行桌面端交互测试，
 *   不在没有运行验证的情况下机械改写。
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

  const toolchain = await read('rust-toolchain.toml')

  if (!toolchain.includes('channel = "1.88.0"')) {
    throw new Error(
      'rust-toolchain.toml 未固定到 1.88.0，请先检查工具链基线。',
    )
  }
}

async function addTokioToDesktopCrate() {
  const relativePath = 'apps/desktop/src-tauri/Cargo.toml'
  let content = await read(relativePath)

  if (content.includes('tokio.workspace = true')) {
    throw new Error(
      `${relativePath} 已包含 tokio.workspace = true，可能已执行过本脚本。`,
    )
  }

  content = replaceExact(
    content,
    `specta.workspace = true
specta-typescript.workspace = true
tauri-specta.workspace = true
tempfile.workspace = true`,
    `specta.workspace = true
specta-typescript.workspace = true
tauri-specta.workspace = true
tempfile.workspace = true
tokio.workspace = true`,
    { label: '为 Tauri crate 添加 Tokio 依赖' },
  )

  stage(
    relativePath,
    content,
    '为异步文件操作启用工作区 Tokio',
  )
}

async function migrateDrawFileIoToTokio() {
  const relativePath = 'apps/desktop/src-tauri/src/commands/file.rs'
  let content = await read(relativePath)

  if (content.includes('async fn write_draw_file(')) {
    throw new Error(
      `${relativePath} 已存在 write_draw_file，可能已执行过本脚本。`,
    )
  }

  content = replaceExact(
    content,
    'use std::path::Path;',
    'use std::path::{Path, PathBuf};',
    { label: '导入 PathBuf' },
  )

  content = replaceExact(
    content,
    `    let path = registry.require(Path::new(&request.path))?;
    ensure_draw_path(&path)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    atomic_write(&path, request.content.as_bytes())?;
    Ok(())`,
    `    let path = registry.require(Path::new(&request.path))?;
    ensure_draw_path(&path)?;

    write_draw_file(path, request.content).await?;
    Ok(())`,
    { label: 'file_save_draw 异步隔离同步写入' },
  )

  content = replaceExact(
    content,
    `    let path = registry.require(Path::new(&path))?;
    ensure_draw_path(&path)?;
    let metadata = std::fs::metadata(&path)?;

    ensure_draw_size(metadata.len())?;

    let content = std::fs::read_to_string(&path)?;
    Ok(DrawReadResult { content })`,
    `    let path = registry.require(Path::new(&path))?;
    ensure_draw_path(&path)?;

    let metadata = tokio::fs::metadata(&path).await?;
    ensure_draw_size(metadata.len())?;

    let content = tokio::fs::read_to_string(&path).await?;
    Ok(DrawReadResult { content })`,
    { label: 'file_read_draw 使用 tokio::fs' },
  )

  content = replaceExact(
    content,
    `    let file_path = registry.require(Path::new(&path))?;
    ensure_draw_path(&file_path)?;

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    atomic_write(&file_path, content.as_bytes())?;

    Ok(DrawReadResult { content })`,
    `    let file_path = registry.require(Path::new(&path))?;
    ensure_draw_path(&file_path)?;

    let content = write_draw_file(file_path, content).await?;
    Ok(DrawReadResult { content })`,
    { label: 'file_create_draw 异步隔离同步写入' },
  )

  content = replaceExact(
    content,
    `fn ensure_draw_size(size: u64) -> Result<()> {`,
    `async fn write_draw_file(
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
}

fn ensure_draw_size(size: u64) -> Result<()> {`,
    { label: '增加 spawn_blocking 写入辅助函数' },
  )

  stage(
    relativePath,
    content,
    '将 DRAW 文件读写迁移到 Tokio 兼容的异步边界',
  )
}

async function addRuntimeVersionChecksToCi() {
  const relativePath = '.github/workflows/quality.yml'
  let content = await read(relativePath)

  if (content.includes('name: Verify JavaScript toolchain')) {
    throw new Error(
      `${relativePath} 已包含 JavaScript 工具链检查。`,
    )
  }

  content = replaceExact(
    content,
    `      - name: Install dependencies
        run: pnpm install --frozen-lockfile`,
    `      - name: Verify JavaScript toolchain
        shell: bash
        run: |
          set -euo pipefail

          expected_node="$(tr -d '[:space:]' < .node-version)"
          actual_node="$(node --version | sed 's/^v//')"
          actual_pnpm="$(pnpm --version)"

          test "$actual_node" = "$expected_node"
          test "$actual_pnpm" = "11.15.0"

          if grep -R "set this to true or false" pnpm-workspace.yaml; then
            echo "::error::pnpm allowBuilds contains unresolved placeholders"
            exit 1
          fi

      - name: Install dependencies
        run: pnpm install --frozen-lockfile`,
    { label: '增加 Node 和 pnpm 版本检查' },
  )

  if (content.includes('name: Verify Rust toolchain')) {
    throw new Error(`${relativePath} 已包含 Rust 工具链检查。`)
  }

  content = replaceExact(
    content,
    `      - name: Cache Rust
        uses: Swatinem/rust-cache@v2

      - name: Format`,
    `      - name: Cache Rust
        uses: Swatinem/rust-cache@v2

      - name: Verify Rust toolchain
        shell: bash
        run: |
          set -euo pipefail

          expected="1.88.0"
          actual="$(rustc --version | awk '{print $2}')"

          test "$actual" = "$expected"

      - name: Format`,
    { label: '增加 Rust 版本检查' },
  )

  stage(
    relativePath,
    content,
    '在 CI 中验证 Node、pnpm、Rust 和 allowBuilds 基线',
  )
}

async function addArchitectureGuardForBlockingFs() {
  const relativePath =
    'tests/architecture/check-rust-async-boundaries.mjs'

  let existing = null

  try {
    existing = await readFile(absolutePath(relativePath), 'utf8')
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error
    }
  }

  if (existing !== null) {
    throw new Error(`${relativePath} 已存在，拒绝覆盖。`)
  }

  const content = `#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const rustRoot = resolve(root, 'apps/desktop/src-tauri/src')

const allowedBlockingFiles = new Set([
  // tauri-plugin-dialog 当前提供 blocking_pick_* 调用。
  // 对话框线程模型将在独立桌面 E2E 中治理。
  'apps/desktop/src-tauri/src/commands/file.rs',
])

async function collectRustFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectRustFiles(path)))
      continue
    }

    if (entry.isFile() && extname(entry.name) === '.rs') {
      files.push(path)
    }
  }

  return files
}

function findAsyncFunctions(source) {
  const functions = []
  const pattern =
    /(?:pub\\s+)?async\\s+fn\\s+([A-Za-z0-9_]+)[^{]*\\{/g

  for (const match of source.matchAll(pattern)) {
    const bodyStart = match.index + match[0].length
    let depth = 1
    let cursor = bodyStart

    while (cursor < source.length && depth > 0) {
      const character = source[cursor]

      if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
      }

      cursor += 1
    }

    if (depth === 0) {
      functions.push({
        name: match[1],
        body: source.slice(bodyStart, cursor - 1),
      })
    }
  }

  return functions
}

const forbiddenPatterns = [
  {
    name: 'std::fs',
    pattern: /\\bstd::fs::/,
  },
  {
    name: 'std::thread::sleep',
    pattern: /\\bstd::thread::sleep\\s*\\(/,
  },
]

const violations = []

for (const path of await collectRustFiles(rustRoot)) {
  const repositoryPath = relative(root, path).replaceAll('\\\\', '/')
  const source = await readFile(path, 'utf8')

  for (const fn of findAsyncFunctions(source)) {
    for (const forbidden of forbiddenPatterns) {
      if (forbidden.pattern.test(fn.body)) {
        violations.push(
          \`\${repositoryPath}: async fn \${fn.name} directly uses \${forbidden.name}\`,
        )
      }
    }

    if (
      /\\bblocking_[A-Za-z0-9_]+\\s*\\(/.test(fn.body) &&
      !allowedBlockingFiles.has(repositoryPath)
    ) {
      violations.push(
        \`\${repositoryPath}: async fn \${fn.name} directly invokes a blocking_* API\`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Rust async boundary check failed:\\n' +
      violations.map((item) => \`- \${item}\`).join('\\n'),
  )
  process.exitCode = 1
} else {
  console.log('Rust async boundary check passed.')
}
`

  stagedFiles.set(relativePath, content)
  changes.push({
    relativePath,
    description: '新增 Rust async 阻塞操作架构门禁',
  })
}

async function registerArchitectureGuard() {
  const relativePath = 'package.json'
  let content = await read(relativePath)

  const packageJson = JSON.parse(content)
  const command =
    'node tests/architecture/check-rust-async-boundaries.mjs'

  if (
    typeof packageJson.scripts?.['test:architecture'] !== 'string'
  ) {
    throw new Error(
      'package.json 缺少 scripts.test:architecture。',
    )
  }

  if (
    packageJson.scripts['test:architecture'].includes(command)
  ) {
    throw new Error(
      'test:architecture 已注册 Rust async boundary 检查。',
    )
  }

  packageJson.scripts['test:architecture'] += ` && ${command}`

  content = `${JSON.stringify(packageJson, null, 2)}\n`

  stage(
    relativePath,
    content,
    '将 Rust async 边界检查注册到架构测试',
  )
}

async function validateResult() {
  const cargo = stagedFiles.get(
    'apps/desktop/src-tauri/Cargo.toml',
  )
  const fileCommands = stagedFiles.get(
    'apps/desktop/src-tauri/src/commands/file.rs',
  )
  const workflow = stagedFiles.get(
    '.github/workflows/quality.yml',
  )
  const packageJson = JSON.parse(stagedFiles.get('package.json'))

  const assertions = [
    [
      cargo.includes('tokio.workspace = true'),
      'Tauri crate 缺少 Tokio workspace 依赖',
    ],
    [
      fileCommands.includes(
        'let metadata = tokio::fs::metadata(&path).await?;',
      ),
      'file_read_draw 未使用 tokio::fs::metadata',
    ],
    [
      fileCommands.includes(
        'let content = tokio::fs::read_to_string(&path).await?;',
      ),
      'file_read_draw 未使用 tokio::fs::read_to_string',
    ],
    [
      fileCommands.includes('tokio::task::spawn_blocking'),
      '同步原子写入未放入 spawn_blocking',
    ],
    [
      !fileCommands.includes(
        'std::fs::read_to_string(&path)',
      ),
      '仍存在同步 DRAW 文件读取',
    ],
    [
      workflow.includes(
        'name: Verify JavaScript toolchain',
      ),
      'CI 缺少 JavaScript 工具链验证',
    ],
    [
      workflow.includes('name: Verify Rust toolchain'),
      'CI 缺少 Rust 工具链验证',
    ],
    [
      packageJson.scripts['test:architecture'].includes(
        'check-rust-async-boundaries.mjs',
      ),
      '架构测试未注册 Rust async 边界门禁',
    ],
  ]

  for (const [condition, message] of assertions) {
    if (!condition) {
      throw new Error(`最终验证失败：${message}`)
    }
  }
}

async function writeStagedFiles() {
  const changedPaths = [
    ...new Set(changes.map(({ relativePath }) => relativePath)),
  ]

  if (checkOnly) {
    console.log(
      `检查完成：第三阶段需要修改 ${changedPaths.length} 个文件。`,
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
    `第三阶段修改完成：共更新 ${changedPaths.length} 个文件。`,
  )

  for (const change of changes) {
    console.log(
      `- ${change.relativePath}: ${change.description}`,
    )
  }

  console.log('')
  console.log('请执行：')
  console.log('  pnpm format')
  console.log('  cargo fmt --all')
  console.log('  pnpm test:architecture')
  console.log(
    '  cargo check --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo clippy --workspace --all-targets --all-features -- -D warnings',
  )
  console.log('  cargo test --workspace --all-features')
  console.log('  pnpm verify:release')
}

async function main() {
  await assertRepository()
  await addTokioToDesktopCrate()
  await migrateDrawFileIoToTokio()
  await addRuntimeVersionChecksToCi()
  await addArchitectureGuardForBlockingFs()
  await registerArchitectureGuard()
  await validateResult()
  await writeStagedFiles()
}

main().catch((error) => {
  console.error('')
  console.error(
    '第三阶段修复失败；脚本尚未写入任何文件。',
  )
  console.error(
    error instanceof Error ? error.stack : String(error),
  )
  process.exitCode = 1
})