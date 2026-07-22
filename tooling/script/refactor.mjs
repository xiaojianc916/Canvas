#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const apply = process.argv.includes('--apply')
const skipChecks = process.argv.includes('--skip-checks')

const paths = {
  rootPackage: 'package.json',
  workspaceTsconfig: 'features/workspace/tsconfig.json',
  workspaceCssDeclaration: 'features/workspace/src/css.d.ts',
  workbenchTabs: 'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
  refactorScript: 'tooling/script/refactor.mjs',
}

assertRepository()

if (!apply) {
  console.log('将执行以下修复：')
  console.log('WRITE  ' + paths.workspaceCssDeclaration)
  console.log('PATCH  ' + paths.workspaceTsconfig)
  console.log('PATCH  ' + paths.workbenchTabs)
  console.log('PATCH  ' + paths.refactorScript)
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

writeCssDeclaration()
patchWorkspaceTsconfig()
patchDatasetAccess(paths.workbenchTabs)
patchDatasetAccess(paths.refactorScript)

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log('Chrome 标签 TypeScript 修复完成。')

function writeCssDeclaration() {
  const content = String.raw`/**
 * Enables typed side-effect imports for component-owned CSS files.
 *
 * CSS files contain presentation only. Workbench state and behavior
 * must remain in TypeScript application/controller layers.
 */
declare module '*.css'
`

  atomicWrite(paths.workspaceCssDeclaration, content)

  console.log('WRITE  ' + paths.workspaceCssDeclaration)
}

function patchWorkspaceTsconfig() {
  const absolutePath = join(root, paths.workspaceTsconfig)

  const tsconfig = JSON.parse(readFileSync(absolutePath, 'utf8'))

  const include = Array.isArray(tsconfig.include) ? [...tsconfig.include] : []

  if (!include.includes('src/**/*.d.ts')) {
    include.push('src/**/*.d.ts')
  }

  tsconfig.include = include

  atomicWrite(paths.workspaceTsconfig, JSON.stringify(tsconfig, null, 2))

  console.log('PATCH  ' + paths.workspaceTsconfig)
}

function patchDatasetAccess(relativePath) {
  const absolutePath = join(root, relativePath)

  if (!existsSync(absolutePath)) {
    throw new Error('找不到待修复文件：' + relativePath)
  }

  const original = readFileSync(absolutePath, 'utf8')

  const invalidPattern = /root\.dataset\.size\s*=/g

  const matches = original.match(invalidPattern)

  if (!matches) {
    if (original.includes("root.dataset['size'] =")) {
      console.log('SKIP   ' + relativePath + '（已经修复）')
      return
    }

    throw new Error(relativePath + ': 找不到 dataset.size，拒绝静默跳过。')
  }

  const updated = original.replaceAll(invalidPattern, "root.dataset['size'] =")

  atomicWrite(relativePath, updated)

  console.log('PATCH  ' + relativePath + '（' + String(matches.length) + ' 处）')
}

function runChecks() {
  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    paths.workspaceCssDeclaration,
    paths.workspaceTsconfig,
    paths.workbenchTabs,
    paths.refactorScript,
  ])

  run('pnpm', ['--filter', '@hybrid-canvas/workspace', 'typecheck'])

  run('pnpm', ['--filter', '@hybrid-canvas/workspace', 'test'])

  run('pnpm', ['test:architecture'])

  run('pnpm', ['--filter', '@hybrid-canvas/desktop', 'typecheck'])

  run('pnpm', ['lint'])
}

function assertRepository() {
  const packagePath = join(root, paths.rootPackage)

  if (!existsSync(packagePath)) {
    throw new Error('请在 hybrid-canvas 仓库根目录执行脚本。')
  }

  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))

  if (manifest.name !== 'hybrid-canvas') {
    throw new Error('当前目录不是 hybrid-canvas 仓库。')
  }

  for (const path of [paths.workspaceTsconfig, paths.workbenchTabs, paths.refactorScript]) {
    if (!existsSync(join(root, path))) {
      throw new Error('缺少预期文件：' + path)
    }
  }
}

function atomicWrite(relativePath, content) {
  const destination = join(root, relativePath)

  const temporaryPath = destination + '.tmp-' + process.pid + '-' + Date.now()

  mkdirSync(dirname(destination), {
    recursive: true,
  })

  writeFileSync(temporaryPath, normalize(content), 'utf8')

  renameSync(temporaryPath, destination)
}

function normalize(content) {
  return content.replaceAll('\r\n', '\n').trimStart() + '\n'
}

function run(command, args) {
  console.log('')
  console.log('RUN    ' + command + ' ' + args.join(' '))

  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}
