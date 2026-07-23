#!/usr/bin/env node
/**
 * 一次性恢复并重构当前工作区：
 *
 * 1. 不解析当前损坏的 package.json，直接完整覆盖为有效 JSON。
 * 2. 修复 WorkbenchTabs.tsx 的 TS4111。
 * 3. 修复 atomic_write.rs 在 Windows 上的 unused import warning。
 * 4. 用 Node 质量门禁编排器替代 Turbo 在 Windows 上的中断式输出。
 *
 * 使用：
 *   node refactor.mjs --write
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const rootPackagePath = resolve('package.json')

const workbenchTabsPath = resolve(
  'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
)

const atomicWritePath = resolve(
  'editor/persistence/native/src/atomic_write.rs',
)

const qualityRunnerPath = resolve('scripts/quality/run.mjs')

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

async function rewrite(path, transform) {
  const source = await readFile(path, 'utf8')
  await write(path, transform(source))
}

const rootPackageJson = {
  name: 'hybrid-canvas',
  version: '0.1.0',
  private: true,
  description:
    'A local-first hybrid canvas for diagrams, scientific plots, freehand drawing and collaboration.',
  license: 'Apache-2.0',
  repository: {
    type: 'git',
    url: 'git+https://github.com/xiaojianc916/Canvas.git',
  },
  bugs: {
    url: 'https://github.com/xiaojianc916/Canvas/issues',
  },
  homepage: 'https://github.com/xiaojianc916/Canvas#readme',
  packageManager: 'pnpm@11.15.0',
  engines: {
    node: '>=24.0.0 <27',
    pnpm: '>=11.0.0 <12',
  },
  scripts: {
    dev: 'turbo run dev --filter=@hybrid-canvas/desktop',
    'dev:desktop': 'pnpm --filter @hybrid-canvas/desktop dev',
    build: 'turbo run build',
    'build:desktop': 'pnpm --filter @hybrid-canvas/desktop build',
    'build:native': 'cargo build --workspace',

    check: 'pnpm test:architecture && node scripts/quality/run.mjs check',
    'check:rust': 'cargo check --workspace --all-targets --all-features',

    typecheck: 'node scripts/quality/run.mjs typecheck',
    test: 'node scripts/quality/run.mjs test',

    lint: 'biome lint .',
    'lint:fix': 'biome lint --write .',
    format: 'biome format --write .',
    'format:check': 'biome format .',

    'test:rust': 'cargo test --workspace --all-features',
    clippy: 'cargo clippy --workspace --all-targets --all-features -- -D warnings',

    audit: 'pnpm audit --audit-level high',
    'audit:rust': 'cargo deny check',

    clean: 'turbo run clean && rimraf node_modules .turbo target',

    tauri: 'pnpm --filter @hybrid-canvas/desktop tauri',
    'tauri:dev': 'pnpm --filter @hybrid-canvas/desktop tauri dev',
    'tauri:build': 'pnpm --filter @hybrid-canvas/desktop tauri build',

    'test:architecture':
      'node tests/architecture/check.mjs && node tests/architecture/check-import-graph.mjs && node tests/architecture/check-termination-ux.mjs && node tests/architecture/check-ui-architecture.mjs && node tests/architecture/check-window-surface.mjs && node tests/architecture/check-window-dragging.mjs && node tests/architecture/check-rust-async-boundaries.mjs && node tests/architecture/check-rust-logging.mjs',

    'analyze:bundle': 'node tests/performance/report-bundle.mjs',
    'analyze:bundle:check': 'node tests/performance/check-bundle-budget.mjs',

    'verify:release':
      'pnpm format:check && pnpm lint && pnpm test:architecture && pnpm typecheck && pnpm test && pnpm build:desktop && pnpm analyze:bundle:check && pnpm clippy && pnpm audit --audit-level high && pnpm audit:rust',
  },
  devDependencies: {
    '@biomejs/biome': '2.5.4',
    '@types/node': 'catalog:',
    '@typescript/typescript6': '6.0.2',
    rimraf: '6.0.1',
    turbo: '2.10.5',
    typescript: 'catalog:',
  },
}

const qualityRunner = `#!/usr/bin/env node
/**
 * Windows-safe quality command orchestrator.
 *
 * Turbo's default cancellation behavior can terminate active pnpm.cmd child
 * processes after one package fails. On Windows this is rendered as "^C" and
 * "Terminate batch job (Y/N)" even when the user did not press Ctrl+C.
 *
 * --continue=always lets every package finish and this runner returns failure
 * only after collecting actual task exit codes.
 */

import { spawn } from 'node:child_process'
import process from 'node:process'

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

function execute(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: false,
    })

    child.once('error', (error) => {
      console.error(\`Unable to start \${command}: \${error.message}\`)
      resolve(1)
    })

    child.once('exit', (code, signal) => {
      if (signal !== null) {
        console.error(\`\${command} terminated by signal: \${signal}\`)
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })
}

const mode = process.argv[2]

const tasks =
  mode === 'typecheck'
    ? [
        [
          pnpm,
          ['exec', 'turbo', 'run', 'typecheck', '--continue=always'],
        ],
      ]
    : mode === 'test'
      ? [
          [
            pnpm,
            ['exec', 'turbo', 'run', 'test', '--continue=always'],
          ],
          [cargo, ['test', '--workspace', '--all-features']],
        ]
      : mode === 'check'
        ? [
            [
              pnpm,
              ['exec', 'turbo', 'run', 'check', '--continue=always'],
            ],
            [
              cargo,
              ['check', '--workspace', '--all-targets', '--all-features'],
            ],
          ]
        : null

if (!tasks) {
  console.error('Usage: node scripts/quality/run.mjs <typecheck|test|check>')
  process.exitCode = 1
} else {
  let failed = false

  for (const [command, args] of tasks) {
    console.log('')
    console.log(\`>>> \${command} \${args.join(' ')}\`)
    console.log('')

    if ((await execute(command, args)) !== 0) {
      failed = true
    }
  }

  process.exitCode = failed ? 1 : 0
}
`

await Promise.all([
  write(
    rootPackagePath,
    `${JSON.stringify(rootPackageJson, null, 2)}\n`,
  ),

  write(qualityRunnerPath, qualityRunner),

  rewrite(workbenchTabsPath, (source) =>
    source.replaceAll(
      'viewport.dataset.hasActiveTab',
      "viewport.dataset['hasActiveTab']",
    ),
  ),

  rewrite(atomicWritePath, (source) =>
    source.replace(
      'use std::fs::File;',
      '#[cfg(unix)]\nuse std::fs::File;',
    ),
  ),
])

console.log('完成：')
console.log('- package.json 已完整重建为有效 JSON')
console.log('- WorkbenchTabs.tsx TS4111 已修复')
console.log('- atomic_write.rs Windows warning 已修复')
console.log('- Windows-safe Turbo 质量门禁编排已写入')
console.log('')
console.log('现在执行：')
console.log('  pnpm typecheck')
console.log('  pnpm test')
console.log('  cargo check -p hybrid-canvas-desktop')