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

const tabsPath =
  'features/workspace/src/presentation/shell/WorkbenchTabs.tsx'

const stylesPath =
  'features/workspace/src/presentation/shell/chrome-workbench-tabs.css'

const styleStartMarker =
  '/* BEGIN FIXED CHROME ACTIVE TAB SHAPE */'

const styleEndMarker =
  '/* END FIXED CHROME ACTIVE TAB SHAPE */'

assertRepository()

if (!apply) {
  console.log('将执行：')
  console.log('PATCH  ' + tabsPath)
  console.log('PATCH  ' + stylesPath)
  console.log('')
  console.log(
    '使用稳定的 tab content 节点插入活动标签背景，',
  )
  console.log(
    '不再依赖 separator 的格式或存在位置。',
  )
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

patchTabsComponent()
patchStyles()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log('固定 SVG Chrome 肩部修复完成。')

function patchTabsComponent() {
  const absolutePath = join(
    root,
    tabsPath,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  let updated = original

  if (
    !updated.includes(
      '<ChromeActiveTabShape />',
    )
  ) {
    const contentAnchor =
      '<div className="chrome-workbench-tab__content">'

    const anchorCount =
      updated.split(contentAnchor).length - 1

    if (anchorCount !== 1) {
      throw new Error(
        tabsPath +
          ': 预期找到一个稳定 content 节点，实际找到 ' +
          String(anchorCount) +
          ' 个。',
      )
    }

    updated = updated.replace(
      contentAnchor,
      [
        '<ChromeActiveTabShape />',
        '',
        '              ' + contentAnchor,
      ].join('\n'),
    )
  }

  if (
    !updated.includes(
      'function ChromeActiveTabShape()',
    )
  ) {
    const functionAnchor =
      'function TabEndAction'

    const anchorCount =
      updated.split(functionAnchor).length - 1

    if (anchorCount !== 1) {
      throw new Error(
        tabsPath +
          ': 预期找到一个 TabEndAction，实际找到 ' +
          String(anchorCount) +
          ' 个。',
      )
    }

    updated = updated.replace(
      functionAnchor,
      chromeShapeComponent() +
        '\n' +
        functionAnchor,
    )
  }

  assertTabsComponent(updated)

  if (updated === original) {
    console.log(
      'SKIP   ' +
        tabsPath +
        '（SVG 活动标签结构已经存在）',
    )
    return
  }

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + tabsPath)
}

function chromeShapeComponent() {
  return String.raw`function ChromeActiveTabShape() {
  return (
    <div
      aria-hidden="true"
      className="chrome-workbench-tab__active-shape"
    >
      <svg
        className="chrome-workbench-tab__active-cap chrome-workbench-tab__active-cap--left"
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 20 32"
      >
        <path
          className="chrome-workbench-tab__active-cap-fill"
          d="M0 32H20V2H18C13.6 2 10 5.6 10 10V23C10 28 6 32 0 32Z"
        />
        <path
          className="chrome-workbench-tab__active-cap-outline"
          d="M0 31.5C6 31.5 10 27.7 10 23V10C10 5.6 13.6 2.5 18 2.5H20"
        />
      </svg>

      <span className="chrome-workbench-tab__active-center" />

      <svg
        className="chrome-workbench-tab__active-cap chrome-workbench-tab__active-cap--right"
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 20 32"
      >
        <path
          className="chrome-workbench-tab__active-cap-fill"
          d="M0 32H20V2H18C13.6 2 10 5.6 10 10V23C10 28 6 32 0 32Z"
        />
        <path
          className="chrome-workbench-tab__active-cap-outline"
          d="M0 31.5C6 31.5 10 27.7 10 23V10C10 5.6 13.6 2.5 18 2.5H20"
        />
      </svg>
    </div>
  )
}
`
}

function assertTabsComponent(source) {
  const callCount =
    source.split(
      '<ChromeActiveTabShape />',
    ).length - 1

  const functionCount =
    source.split(
      'function ChromeActiveTabShape()',
    ).length - 1

  if (callCount !== 1) {
    throw new Error(
      tabsPath +
        ': ChromeActiveTabShape 调用应为一次，实际为 ' +
        String(callCount) +
        ' 次。',
    )
  }

  if (functionCount !== 1) {
    throw new Error(
      tabsPath +
        ': ChromeActiveTabShape 定义应为一次，实际为 ' +
        String(functionCount) +
        ' 次。',
    )
  }

  const requiredTokens = [
    'chrome-workbench-tab__active-cap--left',
    'chrome-workbench-tab__active-cap--right',
    'chrome-workbench-tab__active-center',
    'M0 31.5C6 31.5 10 27.7 10 23',
  ]

  for (const token of requiredTokens) {
    if (!source.includes(token)) {
      throw new Error(
        tabsPath +
          ': SVG 结构缺少 ' +
          token,
      )
    }
  }
}

function patchStyles() {
  const absolutePath = join(
    root,
    stylesPath,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  const block = chromeShapeStyles()

  let updated = original

  const startIndex =
    updated.indexOf(styleStartMarker)

  const endIndex =
    updated.indexOf(styleEndMarker)

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
          ': SVG 样式标记不完整，拒绝继续。',
      )
    }

    const end =
      endIndex +
      styleEndMarker.length

    updated =
      updated.slice(0, startIndex) +
      block +
      updated.slice(end)
  } else {
    updated =
      updated.trimEnd() +
      '\n\n' +
      block +
      '\n'
  }

  assertStyles(updated)

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + stylesPath)
}

function chromeShapeStyles() {
  return String.raw`${styleStartMarker}

/*
 * Disable the previous box-shadow pseudo-element implementation.
 * Those shadows were clipped into square feet at the strip baseline.
 */
.chrome-workbench-tab[data-active="true"]::before,
.chrome-workbench-tab[data-active="true"]::after {
  display: none;
  content: none;
  box-shadow: none;
}

/*
 * Fixed-cap active tab geometry.
 *
 * The side caps always remain 20×32. Only the center stretches, so
 * shoulder curves and corner radii cannot distort with tab width.
 */
.chrome-workbench-tab__active-shape {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: none;
  overflow: visible;
  pointer-events: none;
}

.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__active-shape {
  display: block;
}

.chrome-workbench-tab__active-cap {
  position: absolute;
  top: 0;
  display: block;
  width: 20px;
  height: 32px;
  overflow: visible;
}

.chrome-workbench-tab__active-cap--left {
  left: 0;
}

.chrome-workbench-tab__active-cap--right {
  right: 0;
  transform: scaleX(-1);
  transform-origin: center;
}

.chrome-workbench-tab__active-cap-fill {
  fill: var(--chrome-tab-surface);
}

.chrome-workbench-tab__active-cap-outline {
  fill: none;
  stroke: var(--chrome-tab-outline);
  stroke-width: 1;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

/*
 * Flexible center body.
 *
 * It paints only the top outline. There is no bottom border, allowing
 * the active surface to merge directly into the workspace below.
 */
.chrome-workbench-tab__active-center {
  position: absolute;
  top: 2px;
  right: 20px;
  bottom: 0;
  left: 20px;
  border-top: 1px solid
    var(--chrome-tab-outline);
  background: var(--chrome-tab-surface);
}

/*
 * Shape owns all active fill and outline. Content is layout only.
 * These declarations intentionally override the old rounded body.
 */
.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__content {
  inset: 2px 12px 0;
  z-index: 4;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

${styleEndMarker}`
}

function assertStyles(source) {
  const requiredTokens = [
    styleStartMarker,
    styleEndMarker,
    '.chrome-workbench-tab__active-shape {',
    '.chrome-workbench-tab__active-center {',
    'stroke: var(--chrome-tab-outline);',
    'display: none;',
    'content: none;',
  ]

  for (const token of requiredTokens) {
    if (!source.includes(token)) {
      throw new Error(
        stylesPath +
          ': 修复样式缺少 ' +
          token,
      )
    }
  }

  const startCount =
    source.split(styleStartMarker).length - 1

  const endCount =
    source.split(styleEndMarker).length - 1

  if (
    startCount !== 1 ||
    endCount !== 1
  ) {
    throw new Error(
      stylesPath +
        ': SVG 样式块标记数量异常。',
    )
  }
}

function runChecks() {
  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    tabsPath,
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

  for (const path of [
    tabsPath,
    stylesPath,
  ]) {
    if (!existsSync(join(root, path))) {
      throw new Error(
        '缺少目标文件：' + path,
      )
    }
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