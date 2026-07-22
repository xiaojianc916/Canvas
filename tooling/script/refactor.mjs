#!/usr/bin/env node

/**
 * Canvas 工程审查第四阶段修复脚本：Rust 日志单轨化
 *
 * 用法：
 *   node tooling/script/apply-engineering-review-phase4.mjs
 *   node tooling/script/apply-engineering-review-phase4.mjs --check
 *
 * 前置条件：
 *   已执行 phase1、phase2、phase3。
 *
 * 策略：
 *   - Tauri 当前通过 tauri-plugin-log 接收 log facade；
 *   - 如果仓库不存在真实 tracing 调用，删除未使用的 tracing 直接依赖；
 *   - 如果发现 tracing 调用，停止执行并输出位置，不盲目删除；
 *   - 建立架构门禁，禁止 Rust 后端再次形成 log/tracing 双轨；
 *   - 不删除 tauri-plugin-log，因为它负责 stdout、文件和 WebView 输出。
 */

import {
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
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

function repositoryPath(path) {
  return relative(root, path).replaceAll('\\', '/')
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

async function collectFiles(directory, predicate) {
  const result = []
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      entry.name === 'dist' ||
      entry.name === 'build' ||
      entry.name === 'generated' ||
      entry.name === 'gen'
    ) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      result.push(...(await collectFiles(path, predicate)))
      continue
    }

    if (entry.isFile() && predicate(path)) {
      result.push(path)
    }
  }

  return result
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

  const logging = await read(
    'apps/desktop/src-tauri/src/bootstrap/logging.rs',
  )

  const requiredFragments = [
    'use log::LevelFilter;',
    'tauri_plugin_log::Builder::new()',
    'TargetKind::LogDir',
    'TargetKind::Webview',
  ]

  for (const fragment of requiredFragments) {
    if (!logging.includes(fragment)) {
      throw new Error(
        `当前日志实现与预期不一致，缺少：${fragment}`,
      )
    }
  }
}

function findLineNumber(content, index) {
  return content.slice(0, index).split('\n').length
}

function findPatternUsages(content, patterns) {
  const usages = []

  for (const { name, pattern } of patterns) {
    pattern.lastIndex = 0

    for (const match of content.matchAll(pattern)) {
      usages.push({
        name,
        index: match.index,
        value: match[0],
      })
    }
  }

  return usages
}

async function inspectRustLogging() {
  const rustFiles = await collectFiles(
    root,
    (path) => extname(path) === '.rs',
  )

  const tracingPatterns = [
    {
      name: 'tracing path',
      pattern: /\btracing::[A-Za-z_][A-Za-z0-9_:]*/g,
    },
    {
      name: 'tracing import',
      pattern: /\buse\s+tracing(?:\s*::|\s*\{)/g,
    },
    {
      name: 'tracing attribute',
      pattern: /#\[\s*tracing::instrument\b/g,
    },
  ]

  const logPatterns = [
    {
      name: 'log path',
      pattern: /\blog::[A-Za-z_][A-Za-z0-9_:]*/g,
    },
    {
      name: 'log import',
      pattern: /\buse\s+log(?:\s*::|\s*\{)/g,
    },
  ]

  const tracingUsages = []
  const logUsages = []

  for (const path of rustFiles) {
    const content = await readFile(path, 'utf8')

    for (const usage of findPatternUsages(
      content,
      tracingPatterns,
    )) {
      tracingUsages.push({
        path: repositoryPath(path),
        line: findLineNumber(content, usage.index),
        expression: usage.value,
      })
    }

    for (const usage of findPatternUsages(
      content,
      logPatterns,
    )) {
      logUsages.push({
        path: repositoryPath(path),
        line: findLineNumber(content, usage.index),
        expression: usage.value,
      })
    }
  }

  if (tracingUsages.length > 0) {
    const details = tracingUsages
      .map(
        ({ path, line, expression }) =>
          `- ${path}:${line} ${expression}`,
      )
      .join('\n')

    throw new Error(
      [
        '检测到真实 tracing 调用，拒绝自动删除 tracing。',
        '请先决定使用以下哪种方案：',
        '1. 全量迁移到 tracing，并增加 tracing-log/log bridge；',
        '2. 将以下调用迁移到 log facade。',
        '',
        details,
      ].join('\n'),
    )
  }

  if (logUsages.length === 0) {
    throw new Error(
      '没有检测到 log facade 调用，无法确认当前日志主轨。',
    )
  }

  return {
    rustFiles,
    tracingUsages,
    logUsages,
  }
}

async function collectCargoManifests() {
  return collectFiles(
    root,
    (path) => path.endsWith('Cargo.toml'),
  )
}

async function removeUnusedTracingDependencies() {
  const cargoFiles = await collectCargoManifests()

  const dependencyNames = [
    'tracing',
    'tracing-appender',
    'tracing-subscriber',
  ]

  const declarationPattern = new RegExp(
    `^[ \\t]*(?:${dependencyNames.join('|')})(?:\\.workspace)?[ \\t]*=[^\\r\\n]*(?:\\r?\\n|$)`,
    'gm',
  )

  const declarationTestPattern = new RegExp(
    `^[ \\t]*(?:${dependencyNames.join('|')})(?:\\.workspace)?[ \\t]*=`,
    'm',
  )

  const rootCargoPath = 'Cargo.toml'
  let rootCargo = await read(rootCargoPath)

  /*
   * 根 Cargo.toml 中的 tracing-subscriber 是多行配置，
   * 必须先整体删除，不能只删除声明首行，否则会留下损坏的 TOML。
   */
  const rootTracingBlock = `tracing = "0.1.41"
tracing-appender = "0.2.3"
tracing-subscriber = { version = "0.3.19", features = [
  "env-filter", "fmt", "json", "registry",
] }
`

  if (rootCargo.includes(rootTracingBlock)) {
    rootCargo = replaceExact(
      rootCargo,
      rootTracingBlock,
      '',
      {
        label: '删除根工作区 tracing 依赖定义',
      },
    )

    stage(
      rootCargoPath,
      rootCargo,
      '删除工作区未使用的 tracing 依赖定义',
    )
  } else if (
    declarationTestPattern.test(rootCargo)
  ) {
    throw new Error(
      [
        '根 Cargo.toml 中存在未识别的 tracing 依赖格式。',
        '为避免破坏多行 TOML，脚本拒绝自动删除。',
        '请检查 [workspace.dependencies] 中的 tracing 配置。',
      ].join('\n'),
    )
  }

  for (const path of cargoFiles) {
    const relativePath = repositoryPath(path)

    /*
     * 根 Cargo.toml 已在上面单独处理。
     */
    if (relativePath === rootCargoPath) {
      continue
    }

    let content =
      stagedFiles.get(relativePath) ??
      (await readFile(path, 'utf8'))

    const original = content
    const matches = [...content.matchAll(declarationPattern)]

    for (const match of matches) {
      const declaration = match[0].trim()

      /*
       * 防止删除未知的多行 inline table 或 features 数组首行。
       */
      const opensArray =
        declaration.includes('[') &&
        !declaration.includes(']')

      const opensInlineTable =
        declaration.includes('{') &&
        !declaration.includes('}')

      if (opensArray || opensInlineTable) {
        throw new Error(
          [
            `${relativePath} 中存在多行 tracing 依赖：`,
            declaration,
            '请为该格式增加精确删除规则，脚本拒绝破坏 TOML。',
          ].join('\n'),
        )
      }
    }

    content = content.replace(declarationPattern, '')

    if (content !== original) {
      stage(
        relativePath,
        content,
        '删除没有真实调用的 tracing 直接依赖',
      )
    }
  }

  /*
   * 对内存中的最终结果再次检查。
   */
  const remainingDeclarations = []

  for (const path of cargoFiles) {
    const relativePath = repositoryPath(path)
    const content =
      stagedFiles.get(relativePath) ??
      (await readFile(path, 'utf8'))

    if (declarationTestPattern.test(content)) {
      remainingDeclarations.push(relativePath)
    }
  }

  if (remainingDeclarations.length > 0) {
    throw new Error(
      [
        '以下 Cargo.toml 仍声明 tracing 依赖：',
        ...remainingDeclarations.map(
          (relativePath) => `- ${relativePath}`,
        ),
      ].join('\n'),
    )
  }
}

async function createLoggingArchitectureGuard() {
  const relativePath =
    'tests/architecture/check-rust-logging.mjs'

  try {
    await stat(absolutePath(relativePath))
    throw new Error(`${relativePath} 已存在，拒绝覆盖。`)
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      // 文件不存在，允许创建。
    } else {
      throw error
    }
  }

  const content = `#!/usr/bin/env node

/**
 * Rust 日志架构门禁。
 *
 * 当前项目选择：
 *   log facade -> tauri-plugin-log -> stdout/file/WebView
 *
 * 禁止重新直接引入 tracing，避免形成两套日志字段、过滤器和初始化流程。
 */

import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  'generated',
  'gen',
])

async function collectRustFiles(directory) {
  const files = []
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      ignoredDirectories.has(entry.name)
    ) {
      continue
    }

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

const forbiddenSourcePatterns = [
  {
    name: 'tracing path',
    pattern: /\\btracing::/,
  },
  {
    name: 'tracing import',
    pattern: /\\buse\\s+tracing(?:\\s*::|\\s*\\{)/,
  },
  {
    name: 'tracing instrument attribute',
    pattern: /#\\[\\s*tracing::instrument\\b/,
  },
]

const violations = []

for (const path of await collectRustFiles(root)) {
  const content = await readFile(path, 'utf8')
  const repositoryPath = relative(root, path).replaceAll(
    '\\\\',
    '/',
  )

  for (const forbidden of forbiddenSourcePatterns) {
    if (forbidden.pattern.test(content)) {
      violations.push(
        \`\${repositoryPath}: contains \${forbidden.name}\`,
      )
    }
  }
}

const cargoFiles = []

async function collectCargoFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      ignoredDirectories.has(entry.name)
    ) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      await collectCargoFiles(path)
      continue
    }

    if (entry.isFile() && entry.name === 'Cargo.toml') {
      cargoFiles.push(path)
    }
  }
}

await collectCargoFiles(root)

for (const path of cargoFiles) {
  const content = await readFile(path, 'utf8')
  const repositoryPath = relative(root, path).replaceAll(
    '\\\\',
    '/',
  )

  if (
    /^(?:tracing|tracing-appender|tracing-subscriber)(?:\\.workspace)?\\s*=/m.test(
      content,
    )
  ) {
    violations.push(
      \`\${repositoryPath}: declares a tracing dependency\`,
    )
  }
}

const loggingBootstrap = resolve(
  root,
  'apps/desktop/src-tauri/src/bootstrap/logging.rs',
)
const bootstrapContent = await readFile(
  loggingBootstrap,
  'utf8',
)

const requiredBootstrapFragments = [
  'use log::LevelFilter;',
  'tauri_plugin_log::Builder::new()',
  'TargetKind::LogDir',
  'TargetKind::Webview',
]

for (const fragment of requiredBootstrapFragments) {
  if (!bootstrapContent.includes(fragment)) {
    violations.push(
      \`logging bootstrap is missing: \${fragment}\`,
    )
  }
}

if (violations.length > 0) {
  console.error(
    [
      'Rust logging architecture check failed:',
      ...violations.map((violation) => \`- \${violation}\`),
    ].join('\\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'Rust logging architecture check passed.',
  )
}
`

  stagedFiles.set(relativePath, content)
  changes.push({
    relativePath,
    description: '新增 Rust 日志单轨架构门禁',
  })
}

async function registerLoggingGuard() {
  const relativePath = 'package.json'
  const packageJson = JSON.parse(await read(relativePath))

  const command =
    'node tests/architecture/check-rust-logging.mjs'

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
      'Rust 日志架构门禁已经注册，可能已执行过脚本。',
    )
  }

  packageJson.scripts['test:architecture'] += ` && ${command}`

  stage(
    relativePath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    '将 Rust 日志单轨检查加入架构测试',
  )
}

async function validateResult() {
  const rustFiles = await collectFiles(
    root,
    (path) => extname(path) === '.rs',
  )

  for (const path of rustFiles) {
    const relativePath = repositoryPath(path)
    const content =
      stagedFiles.get(relativePath) ??
      (await readFile(path, 'utf8'))

    if (
      /\btracing::/.test(content) ||
      /\buse\s+tracing(?:\s*::|\s*\{)/.test(content)
    ) {
      throw new Error(
        `最终验证失败：${relativePath} 仍存在 tracing 调用。`,
      )
    }
  }

  const cargoFiles = await collectCargoManifests()

  for (const path of cargoFiles) {
    const relativePath = repositoryPath(path)
    const content =
      stagedFiles.get(relativePath) ??
      (await readFile(path, 'utf8'))

    if (
      /^(?:tracing|tracing-appender|tracing-subscriber)(?:\.workspace)?\s*=/m.test(
        content,
      )
    ) {
      throw new Error(
        `最终验证失败：${relativePath} 仍声明 tracing 依赖。`,
      )
    }
  }

  const packageJson = JSON.parse(
    stagedFiles.get('package.json'),
  )

  if (
    !packageJson.scripts['test:architecture'].includes(
      'check-rust-logging.mjs',
    )
  ) {
    throw new Error(
      '最终验证失败：日志门禁未注册到 test:architecture。',
    )
  }
}

async function writeStagedFiles() {
  const changedPaths = [
    ...new Set(changes.map(({ relativePath }) => relativePath)),
  ]

  if (checkOnly) {
    console.log(
      `检查完成：第四阶段需要修改 ${changedPaths.length} 个文件。`,
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
    `第四阶段修改完成：共更新 ${changedPaths.length} 个文件。`,
  )

  for (const change of changes) {
    console.log(
      `- ${change.relativePath}: ${change.description}`,
    )
  }

  console.log('')
  console.log('请执行：')
  console.log('  pnpm install --lockfile-only')
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
  await inspectRustLogging()
  await removeUnusedTracingDependencies()
  await createLoggingArchitectureGuard()
  await registerLoggingGuard()
  await validateResult()
  await writeStagedFiles()
}

main().catch((error) => {
  console.error('')
  console.error(
    '第四阶段修复失败；脚本尚未写入任何文件。',
  )
  console.error(
    error instanceof Error ? error.stack : String(error),
  )
  process.exitCode = 1
})