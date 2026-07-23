#!/usr/bin/env node
/**
 * 修复当前已确认的全部真实错误：
 *
 * - cross-domain contract 测试包缺少 @hybrid-canvas/file workspace 依赖
 * - exactOptionalPropertyTypes 下 JSX 不得显式传 description={undefined}
 * - atomic_write.rs 中被误写入的字面量 \\n / 重复 #[cfg(unix)]
 * - Windows 下质量脚本 shell:true 的 DEP0190 warning
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const crossDomainPackagePath = resolve(
  'tests/cross-domain-contract/package.json',
)

const inspectorPath = resolve(
  'apps/desktop/src/presentation/workspace/inspector/selections/SelectionInspectorShared.tsx',
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

const crossDomainPackage = {
  name: '@hybrid-canvas/test-cross-domain-contract',
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    check: 'tsc --project tsconfig.json --noEmit',
    typecheck: 'tsc --project tsconfig.json --noEmit',
    test: 'vitest run document-lifecycle',
  },
  dependencies: {
    '@hybrid-canvas/canvas': 'workspace:*',
    '@hybrid-canvas/document': 'workspace:*',
    '@hybrid-canvas/file': 'workspace:*',
    tldraw: 'catalog:',
  },
  devDependencies: {
    '@types/node': 'catalog:',
    typescript: 'catalog:',
    vitest: 'catalog:',
  },
}

const qualityRunner = `#!/usr/bin/env node
/**
 * Cross-platform quality runner.
 *
 * Runs Turbo through the Node.js entrypoint instead of spawning pnpm.cmd with
 * shell:true. This avoids Windows spawn EINVAL and Node DEP0190 warnings.
 */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

const turboCli = resolve(
  process.cwd(),
  'node_modules',
  'turbo',
  'bin',
  'turbo',
)

const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

function execute(command, args) {
  return new Promise((resolveExitCode) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: false,
      shell: false,
    })

    child.once('error', (error) => {
      console.error(\`Unable to start \${command}: \${error.message}\`)
      resolveExitCode(1)
    })

    child.once('exit', (code, signal) => {
      if (signal !== null) {
        console.error(\`\${command} terminated by signal: \${signal}\`)
        resolveExitCode(1)
        return
      }

      resolveExitCode(code ?? 1)
    })
  })
}

function turboTask(name) {
  return [
    process.execPath,
    [turboCli, 'run', name, '--continue=always'],
  ]
}

const mode = process.argv[2]

const tasks =
  mode === 'typecheck'
    ? [turboTask('typecheck')]
    : mode === 'test'
      ? [
          turboTask('test'),
          [cargo, ['test', '--workspace', '--all-features']],
        ]
      : mode === 'check'
        ? [
            turboTask('check'),
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
    crossDomainPackagePath,
    `${JSON.stringify(crossDomainPackage, null, 2)}\n`,
  ),

  write(qualityRunnerPath, qualityRunner),

  rewrite(atomicWritePath, (source) => {
    let next = source

    // 移除之前脚本意外写入的字面量 "\\n"。
    next = next.replaceAll('#[cfg(unix)]\\\\n', '')

    // 无论之前被执行过几次，均删除 import 前的重复 cfg attribute。
    next = next.replace(
      /(?:#\[cfg\(unix\)\]\r?\n)*use std::fs::File;\r?\n?/g,
      '',
    )

    // 仅 Unix 分支会编译该调用，因此无需顶层 import。
    next = next.replaceAll(
      'File::open(directory)?.sync_all()?',
      'std::fs::File::open(directory)?.sync_all()?',
    )

    return next
  }),

  rewrite(inspectorPath, (source) => {
    let next = source

    next = next.replace(
      `description={
        commonColor === null && shapes.length > 1
          ? '当前选择包含多个颜色；选择颜色后将统一覆盖。'
          : undefined
      }`,
      `{...(commonColor === null && shapes.length > 1
        ? {
            description:
              '当前选择包含多个颜色；选择颜色后将统一覆盖。',
          }
        : {})}`,
    )

    next = next.replace(
      `description={
        commonFill === null && shapes.length > 1
          ? '混合填充'
          : undefined
      }`,
      `{...(commonFill === null && shapes.length > 1
        ? { description: '混合填充' }
        : {})}`,
    )

    next = next.replace(
      `description={
          commonDash === null && shapes.length > 1
            ? '混合线型'
            : undefined
        }`,
      `{...(commonDash === null && shapes.length > 1
          ? { description: '混合线型' }
          : {})}`,
    )

    return next
  }),
])

console.log('已完成真实错误修复：')
console.log('- 补齐 cross-domain contract 的 file workspace 依赖')
console.log('- 修复 Inspector exact optional props')
console.log('- 修复 atomic_write.rs 的非法 Rust token')
console.log('- 移除质量脚本的 Windows shell warning')
console.log('')
console.log('下一步必须执行 pnpm install 以更新 workspace link 与 pnpm-lock.yaml。')