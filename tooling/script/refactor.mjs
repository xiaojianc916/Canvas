#!/usr/bin/env node

/**
 * Resume validation after installing @typescript/typescript6.
 *
 * Avoids `node --eval` because multiline eval arguments are corrupted
 * when passed through cmd.exe with shell:true on Windows.
 */

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

const checkerPath =
  'tests/architecture/check-ui-architecture.mjs'

assertRepository()

if (!apply) {
  console.log('将执行以下操作：')
  console.log(
    'VERIFY @typescript/typescript6 Compiler API',
  )
  console.log('PATCH  ' + checkerPath)
  console.log('RUN    UI architecture check')
  console.log('RUN    full architecture checks')
  console.log('RUN    desktop typecheck')
  console.log('RUN    lint')
  console.log('RUN    tests')
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

patchArchitectureChecker()
await verifyCompilerApiDirectly()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log(
  'TypeScript 7 Compiler API 兼容验证及剩余检查完成。',
)

function patchArchitectureChecker() {
  const absolutePath = join(
    root,
    checkerPath,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  const expectedImport =
    "import * as tsModule from '@typescript/typescript6'"

  const expectedBinding =
    'const ts = tsModule.default ?? tsModule'

  if (
    original.includes(expectedImport) &&
    original.includes(expectedBinding)
  ) {
    console.log(
      'SKIP   ' +
        checkerPath +
        '（已经使用 TypeScript 6 兼容 API）',
    )
    return
  }

  let updated = original

  updated = updated.replace(
    /import\s+ts\s+from\s+(['"])typescript\1/,
    [
      expectedImport,
      '',
      expectedBinding,
    ].join('\n'),
  )

  updated = updated.replace(
    /import\s+\*\s+as\s+ts\s+from\s+(['"])typescript\1/,
    [
      expectedImport,
      '',
      expectedBinding,
    ].join('\n'),
  )

  if (
    !updated.includes(expectedImport) ||
    !updated.includes(expectedBinding)
  ) {
    throw new Error(
      checkerPath +
        ': 无法生成 TypeScript 6 Compiler API 导入。',
    )
  }

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + checkerPath)
}

async function verifyCompilerApiDirectly() {
  console.log('')
  console.log(
    'VERIFY @typescript/typescript6 Compiler API',
  )

  /*
   * Import in the current Node process.
   *
   * Do not use `node --eval`: cmd.exe breaks multiline arguments
   * when execFileSync is configured with shell:true.
   */
  const tsModule = await import(
    '@typescript/typescript6'
  )

  const ts = tsModule.default ?? tsModule

  const failures = []

  if (
    typeof ts.createSourceFile !== 'function'
  ) {
    failures.push('createSourceFile')
  }

  if (
    typeof ts.forEachChild !== 'function'
  ) {
    failures.push('forEachChild')
  }

  if (
    typeof ts.flattenDiagnosticMessageText !==
    'function'
  ) {
    failures.push(
      'flattenDiagnosticMessageText',
    )
  }

  if (
    typeof ts.ScriptTarget?.Latest !==
    'number'
  ) {
    failures.push('ScriptTarget.Latest')
  }

  if (
    typeof ts.ScriptKind?.TSX !== 'number'
  ) {
    failures.push('ScriptKind.TSX')
  }

  if (failures.length > 0) {
    throw new Error(
      'TYPESCRIPT6_COMPILER_API_UNAVAILABLE: ' +
        failures.join(', '),
    )
  }

  const probeSource = ts.createSourceFile(
    'probe.tsx',
    'export const Probe = () => <div />',
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  if (
    probeSource.parseDiagnostics.length > 0
  ) {
    const diagnostics =
      probeSource.parseDiagnostics.map(
        (diagnostic) =>
          ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            ' ',
          ),
      )

    throw new Error(
      'TYPESCRIPT6_TSX_PROBE_FAILED: ' +
        diagnostics.join('; '),
    )
  }

  console.log(
    'TypeScript 6 Compiler API probe passed.',
  )
}

function runChecks() {
  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    checkerPath,
    'package.json',
  ])

  /*
   * Run the original failure first so a new architecture violation
   * is reported immediately without hiding it in the full chain.
   */
  run('node', [
    checkerPath,
  ])

  run('pnpm', [
    'test:architecture',
  ])

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

  if (
    !manifest.devDependencies?.[
      '@typescript/typescript6'
    ]
  ) {
    throw new Error(
      '根 package.json 尚未安装 @typescript/typescript6。',
    )
  }

  if (
    !existsSync(join(root, checkerPath))
  ) {
    throw new Error(
      '缺少架构检查器：' +
        checkerPath,
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

  /*
   * On Windows, pnpm is exposed through pnpm.cmd and needs a shell.
   * Node must not use a shell because arguments may contain JavaScript,
   * spaces, quotes or line breaks.
   */
  const needsWindowsShell =
    process.platform === 'win32' &&
    command === 'pnpm'

  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: needsWindowsShell,
  })
}