#!/usr/bin/env node

/**
 * Hybrid Canvas 构建语义与 Windows CI 调整脚本
 *
 * 放在仓库根目录运行：
 *   node apply-ci-build-fixes.mjs
 *
 * 只检查、不修改：
 *   node apply-ci-build-fixes.mjs --check
 *
 * 注意：
 * - 保留 TypeScript 7 和 @typescript/typescript6，不修改锁文件。
 * - 只有 apps/desktop 保留真正的 build。
 * - 内部源码包只执行 typecheck。
 * - 脚本可重复执行。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const checkOnly = process.argv.includes('--check')
const files = new Map()

for (const argument of process.argv.slice(2)) {
  if (argument !== '--check') {
    fail(`未知参数：${argument}`)
  }
}

const sourcePackagePaths = [
  'editor/assets/package.json',
  'editor/core/package.json',
  'editor/document/package.json',
  'editor/extensions/package.json',
  'editor/persistence/package.json',
  'features/settings/package.json',
  'features/workspace/package.json',
  'foundations/design-system/package.json',
  'foundations/geometry/package.json',
  'foundations/kernel/package.json',
  'foundations/observability/package.json',
  'foundations/serialization/package.json',
  'foundations/test-kit/package.json',
]

await updateRootPackage()
await updateTurboConfig()
await updateWindowsCi()
await updateSourcePackages()

const changedFiles = [...files.values()].filter(
  ({ original, updated }) => original !== updated,
)

if (checkOnly) {
  if (changedFiles.length === 0) {
    console.log('无需修改，构建语义与 Windows CI 已经符合要求。')
    process.exit(0)
  }

  console.error('以下文件需要修改：')

  for (const file of changedFiles) {
    console.error(`- ${file.relativePath}`)
  }

  process.exit(1)
}

/*
 * 所有修改均已在内存中完成并通过验证，
 * 确认没有错误后再统一写入，避免只修改一半。
 */
for (const file of changedFiles) {
  await writeFile(file.absolutePath, file.updated, 'utf8')
}

if (changedFiles.length === 0) {
  console.log('无需修改，脚本已经应用过。')
} else {
  console.log(`已修改 ${changedFiles.length} 个文件：`)

  for (const file of changedFiles) {
    console.log(`- ${file.relativePath}`)
  }
}

console.log('')
console.log('TypeScript 依赖保持不变。')
console.log('')
console.log('请继续执行：')
console.log('  pnpm format:check')
console.log('  pnpm lint')
console.log('  pnpm test:architecture')
console.log('  pnpm typecheck')
console.log('  pnpm test')
console.log('  pnpm build')

async function updateRootPackage() {
  const relativePath = 'package.json'
  let text = await load(relativePath)

  text = migrateExact({
    text,
    relativePath,
    description: '根构建脚本',
    oldValue:
      '    "build": "turbo run build",\n' +
      '    "build:desktop": "pnpm --filter @hybrid-canvas/desktop build",',
    newValue:
      '    "build": "pnpm build:desktop",\n' +
      '    "build:desktop": "turbo run build --filter=@hybrid-canvas/desktop",',
  })

  validateJson(relativePath, text)

  const manifest = JSON.parse(stripBom(text))

  if (manifest.scripts?.build !== 'pnpm build:desktop') {
    fail(`${relativePath}：根 build 脚本配置错误`)
  }

  if (
    manifest.scripts?.['build:desktop'] !==
    'turbo run build --filter=@hybrid-canvas/desktop'
  ) {
    fail(`${relativePath}：build:desktop 脚本配置错误`)
  }

  update(relativePath, text)
}

async function updateTurboConfig() {
  const relativePath = 'turbo.json'
  let text = await load(relativePath)

  text = migrateExact({
    text,
    relativePath,
    description: '桌面构建前置任务',
    oldValue:
      '    "build": {\n' +
      '      "dependsOn": ["^build"],',
    newValue:
      '    "build": {\n' +
      '      "dependsOn": ["^typecheck"],',
  })

  text = migrateExact({
    text,
    relativePath,
    description: '构建输出目录',
    oldValue:
      '      "outputs": ["dist/**", "build/**", ".vite/**", "coverage/**"]',
    newValue:
      '      "outputs": ["dist/**", "build/**", ".vite/**"]',
  })

  for (const task of [
    'test:unit',
    'test:integration',
    'test:architecture',
  ]) {
    text = migrateExact({
      text,
      relativePath,
      description: `${task} 前置任务`,
      oldValue:
        `    "${task}": {\n` +
        '      "dependsOn": ["^build"],',
      newValue:
        `    "${task}": {\n` +
        '      "dependsOn": ["^typecheck"],',
    })
  }

  validateJson(relativePath, text)

  const turbo = JSON.parse(text)

  if (
    JSON.stringify(turbo.tasks?.build?.dependsOn) !==
    JSON.stringify(['^typecheck'])
  ) {
    fail(`${relativePath}：build 必须依赖 ^typecheck`)
  }

  for (const task of [
    'test:unit',
    'test:integration',
    'test:architecture',
  ]) {
    if (
      JSON.stringify(turbo.tasks?.[task]?.dependsOn) !==
      JSON.stringify(['^typecheck'])
    ) {
      fail(`${relativePath}：${task} 必须依赖 ^typecheck`)
    }
  }

  update(relativePath, text)
}

async function updateWindowsCi() {
  const relativePath = '.github/workflows/quality.yml'
  let text = await load(relativePath)

  const windowsJobMarker = '  windows-desktop:\n'

  if (!text.includes(windowsJobMarker)) {
    const rustJobAnchor =
      '  rust:\n' +
      '    name: Rust\n'

    assertOccurrence({
      text,
      value: rustJobAnchor,
      relativePath,
      description: 'Rust CI 任务定位点',
      expected: 1,
    })

    text = text.replace(
      rustJobAnchor,
      `${createWindowsJob()}${rustJobAnchor}`,
    )
  } else {
    assertOccurrence({
      text,
      value: windowsJobMarker,
      relativePath,
      description: 'Windows Desktop CI 任务',
      expected: 1,
    })
  }

  update(relativePath, text)
}

async function updateSourcePackages() {
  const buildLinePattern =
    /^    "build": "tsc (?:--project|-p) tsconfig\.json --noEmit",\r?\n/m

  for (const relativePath of sourcePackagePaths) {
    let text = await load(relativePath)

    const matches =
      text.match(
        new RegExp(buildLinePattern.source, 'gm'),
      ) ?? []

    if (matches.length > 1) {
      fail(
        `${relativePath}：发现多个 tsc --noEmit build 脚本`,
      )
    }

    if (matches.length === 1) {
      text = text.replace(buildLinePattern, '')
    }

    validateJson(relativePath, text)

    const manifest = JSON.parse(stripBom(text))

    if (manifest.scripts?.build !== undefined) {
      fail(
        `${relativePath}：源码包不应保留 build 脚本`,
      )
    }

    if (typeof manifest.scripts?.typecheck !== 'string') {
      fail(
        `${relativePath}：源码包必须提供 typecheck 脚本`,
      )
    }

    update(relativePath, text)
  }
}

function createWindowsJob() {
  return `  windows-desktop:
    name: Windows Desktop
    runs-on: windows-latest
    timeout-minutes: 45

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11.15.0
          run_install: false

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: pnpm

      - name: Install Rust
        uses: dtolnay/rust-toolchain@1.88.0
        with:
          components: rustfmt, clippy

      - name: Cache Rust
        uses: Swatinem/rust-cache@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck workspace
        run: pnpm typecheck

      - name: Build desktop frontend
        run: pnpm build

      - name: Check Windows native target
        run: cargo check -p hybrid-canvas-desktop --all-targets --all-features

      - name: Build Windows desktop binary
        run: pnpm --filter @hybrid-canvas/desktop exec tauri build --debug --no-bundle

`
}

async function load(relativePath) {
  if (files.has(relativePath)) {
    return files.get(relativePath).updated
  }

  const absolutePath = resolve(root, relativePath)

  let original

  try {
    original = await readFile(absolutePath, 'utf8')
  } catch (error) {
    fail(
      `${relativePath}：无法读取文件：${formatError(error)}`,
    )
  }

  files.set(relativePath, {
    relativePath,
    absolutePath,
    original,
    updated: original,
  })

  return original
}

function update(relativePath, updated) {
  const file = files.get(relativePath)

  if (!file) {
    fail(`${relativePath}：内部文件状态错误`)
  }

  file.updated = updated
}

function migrateExact({
  text,
  relativePath,
  description,
  oldValue,
  newValue,
}) {
  if (text.includes(newValue)) {
    assertOccurrence({
      text,
      value: newValue,
      relativePath,
      description,
      expected: 1,
    })

    if (text.includes(oldValue)) {
      fail(
        `${relativePath}：同时存在新旧${description}`,
      )
    }

    return text
  }

  assertOccurrence({
    text,
    value: oldValue,
    relativePath,
    description,
    expected: 1,
  })

  return text.replace(oldValue, newValue)
}

function assertOccurrence({
  text,
  value,
  relativePath,
  description,
  expected,
}) {
  const count = text.split(value).length - 1

  if (count !== expected) {
    fail(
      `${relativePath}：${description}应出现 ${expected} 次，实际为 ${count} 次`,
    )
  }
}

function validateJson(relativePath, text) {
  try {
    JSON.parse(stripBom(text))
  } catch (error) {
    fail(
      `${relativePath}：修改后不是有效 JSON：${formatError(error)}`,
    )
  }
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, '')
}

function formatError(error) {
  return error instanceof Error
    ? error.message
    : String(error)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}