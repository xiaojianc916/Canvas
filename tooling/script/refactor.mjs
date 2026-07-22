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

const stylesPath =
  'features/workspace/src/presentation/shell/chrome-workbench-tabs.css'

const startMarker =
  '/* BEGIN CANONICAL FIXED TAB CONTENT GEOMETRY */'

const endMarker =
  '/* END CANONICAL FIXED TAB CONTENT GEOMETRY */'

assertRepository()

if (!apply) {
  console.log('将固定标签内容坐标：')
  console.log('PATCH  ' + stylesPath)
  console.log('')
  console.log('- 不解析现有 CSS selector 数量')
  console.log('- 活动和未活动使用相同 inset')
  console.log('- 活动和未活动使用相同 padding')
  console.log('- 图标、文字、关闭按钮不再位移')
  console.log('- Hover 背景使用独立绘制层')
  console.log('- 活动和未活动标题字重一致')
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

writeCanonicalGeometryBlock()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log('标签内容坐标已固定。')

function writeCanonicalGeometryBlock() {
  const absolutePath = join(
    root,
    stylesPath,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  const block = createGeometryBlock()

  let updated = original

  const startIndex =
    updated.indexOf(startMarker)

  const endIndex =
    updated.indexOf(endMarker)

  if (
    startIndex >= 0 ||
    endIndex >= 0
  ) {
    if (
      startIndex < 0 ||
      endIndex < 0 ||
      endIndex < startIndex
    ) {
      throw new Error(
        stylesPath +
          ': 固定布局样式标记不完整。',
      )
    }

    updated =
      updated.slice(0, startIndex) +
      block +
      updated.slice(
        endIndex + endMarker.length,
      )
  } else {
    updated =
      updated.trimEnd() +
      '\n\n' +
      block +
      '\n'
  }

  validateResult(updated)

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + stylesPath)
}

function createGeometryBlock() {
  return String.raw`${startMarker}

/*
 * State-invariant content geometry.
 *
 * Activation changes only the background shape. It must never alter
 * the content box occupied by icon, title, status and close button.
 */
.chrome-workbench-tab
  .chrome-workbench-tab__content,
.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__content,
.chrome-workbench-tab:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__content {
  inset: 2px 12px 0;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  outline: 0;
  background: transparent;
  box-shadow: none;
}

/*
 * Keep text metrics identical across activation changes. Changing
 * font weight changes glyph widths and creates a second visible jump.
 */
.chrome-workbench-tab
  .chrome-workbench-tab__title,
.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__title {
  font-weight: 400;
}

/*
 * Existing content-based hover paint is disabled. Hover is rendered
 * by the independent ::before paint layer below.
 */
.chrome-workbench-tab:hover:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__content,
.chrome-workbench-tab:hover:not(
    [data-active="true"]
  ):not(
    [data-suppress-hover="true"]
  )
  .chrome-workbench-tab__content {
  border: 0;
  background: transparent;
  box-shadow: none;
}

/*
 * Paint-only hover surface.
 *
 * This layer can appear and disappear without changing the content
 * element's dimensions or position.
 */
.chrome-workbench-tab:not(
    [data-active="true"]
  )::before {
  position: absolute;
  z-index: 3;
  inset: 2px 3px;
  display: block;
  border: 0;
  border-radius: 8px;
  outline: 0;
  background: var(--chrome-tab-hover);
  box-shadow: none;
  content: "";
  opacity: 0;
  pointer-events: none;
  transition: opacity 80ms ease-out;
}

.chrome-workbench-tab:hover:not(
    [data-active="true"]
  ):not(
    [data-suppress-hover="true"]
  )::before {
  opacity: 1;
}

.chrome-workbench-tab[
    data-suppress-hover="true"
  ]:not(
    [data-active="true"]
  )::before {
  opacity: 0;
  transition: none;
}

/*
 * Active-tab geometry remains owned by ChromeActiveTabShape.
 */
.chrome-workbench-tab[data-active="true"]::before {
  display: none;
  content: none;
}

${endMarker}`
}

function validateResult(source) {
  const required = [
    startMarker,
    endMarker,
    'inset: 2px 12px 0;',
    'padding: 0 8px;',
    'font-weight: 400;',
    'background: var(--chrome-tab-hover);',
    'data-suppress-hover="true"',
  ]

  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(
        stylesPath +
          ': 固定布局结果缺少 ' +
          token,
      )
    }
  }

  const startCount =
    source.split(startMarker).length - 1

  const endCount =
    source.split(endMarker).length - 1

  if (
    startCount !== 1 ||
    endCount !== 1
  ) {
    throw new Error(
      stylesPath +
        ': 固定布局规则块必须且只能存在一次。',
    )
  }
}

function runChecks() {
  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    stylesPath,
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'typecheck',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'test',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/desktop',
    'typecheck',
  ])

  run('node', [
    'tests/architecture/check-ui-architecture.mjs',
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
    !existsSync(
      join(root, stylesPath),
    )
  ) {
    throw new Error(
      '缺少目标文件：' +
        stylesPath,
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