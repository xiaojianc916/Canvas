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

const paths = {
  tabs:
    'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
  styles:
    'features/workspace/src/presentation/shell/chrome-workbench-tabs.css',
  shell:
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
}

assertRepository()

if (!apply) {
  console.log('将从当前回滚状态重建标签视觉：')
  console.log('PATCH  ' + paths.tabs)
  console.log('WRITE  ' + paths.styles)
  console.log('PATCH  ' + paths.shell)
  console.log('')
  console.log('- 不要求旧 ChromeActiveTabShape 存在')
  console.log('- 清理旧 SVG/渐变/阴影实现')
  console.log('- 重建固定 SVG 肩部')
  console.log('- 轮廓与工作区分割线使用同一颜色')
  console.log('- 不使用颜色渐变')
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

rebuildTabsComponent()
writeCanonicalStyles()
normalizeWorkspaceBoundary()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log('Chrome 标签视觉已从回滚状态重建。')

function rebuildTabsComponent() {
  const absolutePath = join(
    root,
    paths.tabs,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  let updated = original

  /*
   * Remove all previous shape invocations before reconstructing the
   * canonical markup.
   */
  updated = updated.replaceAll(
    '<ChromeActiveTabShape />',
    '',
  )

  updated = updated.replaceAll(
    '<ChromeTabBackground />',
    '',
  )

  /*
   * Remove legacy leading/trailing dividers and any existing canonical
   * separator. The markup is then rebuilt in exactly one location.
   */
  updated = updated.replace(
    /<span\b(?=[^>]*className="chrome-workbench-tab__(?:separator|divider)[^"]*")[^>]*\/>/g,
    '',
  )

  updated = removeNamedFunctionIfPresent(
    updated,
    'ChromeActiveTabShape',
  )

  updated = removeNamedFunctionIfPresent(
    updated,
    'ChromeTabBackground',
  )

  const contentAnchor =
    '<div className="chrome-workbench-tab__content">'

  const contentCount =
    updated.split(contentAnchor).length - 1

  if (contentCount !== 1) {
    throw new Error(
      paths.tabs +
        ': 标签 content 容器应出现一次，实际出现 ' +
        String(contentCount) +
        ' 次。',
    )
  }

  const canonicalMarkup = [
    '<ChromeActiveTabShape />',
    '',
    '              <span',
    '                aria-hidden="true"',
    '                className="chrome-workbench-tab__separator"',
    '              />',
    '',
    '              ' + contentAnchor,
  ].join('\n')

  updated = updated.replace(
    contentAnchor,
    canonicalMarkup,
  )

  const functionAnchor =
    'function TabEndAction'

  const functionAnchorCount =
    updated.split(functionAnchor).length - 1

  if (functionAnchorCount !== 1) {
    throw new Error(
      paths.tabs +
        ': TabEndAction 应出现一次，实际出现 ' +
        String(functionAnchorCount) +
        ' 次。',
    )
  }

  updated = updated.replace(
    functionAnchor,
    createActiveShapeSource() +
      '\n\n' +
      functionAnchor,
  )

  updated = removeUnusedUseId(
    updated,
  )

  updated = updated.replace(
    /<Plus aria-hidden="true" className="size-[^"]+" \/>/g,
    '<Plus aria-hidden="true" className="size-3.5" />',
  )

  validateTabsComponent(updated)

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + paths.tabs)
}

function removeNamedFunctionIfPresent(
  source,
  functionName,
) {
  const signature =
    'function ' + functionName + '('

  const functionStart =
    source.indexOf(signature)

  if (functionStart < 0) {
    return source
  }

  if (
    source.indexOf(
      signature,
      functionStart + signature.length,
    ) >= 0
  ) {
    throw new Error(
      paths.tabs +
        ': ' +
        functionName +
        ' 出现多次。',
    )
  }

  const bodyStart =
    source.indexOf('{', functionStart)

  if (bodyStart < 0) {
    throw new Error(
      paths.tabs +
        ': ' +
        functionName +
        ' 缺少函数体。',
    )
  }

  let depth = 0
  let cursor = bodyStart
  let quote = null
  let escaped = false

  while (cursor < source.length) {
    const character = source[cursor]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }

      cursor += 1
      continue
    }

    if (
      character === '"' ||
      character === "'" ||
      character === '`'
    ) {
      quote = character
      cursor += 1
      continue
    }

    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1

      if (depth === 0) {
        cursor += 1
        break
      }
    }

    cursor += 1
  }

  if (depth !== 0) {
    throw new Error(
      paths.tabs +
        ': 无法确定 ' +
        functionName +
        ' 的结束位置。',
    )
  }

  while (
    cursor < source.length &&
    /\s/.test(source[cursor])
  ) {
    cursor += 1
  }

  return (
    source.slice(0, functionStart) +
    source.slice(cursor)
  )
}

function createActiveShapeSource() {
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
          d="M0 32C5.5 32 9.5 28 9.5 23V10C9.5 5.6 13.1 2 17.5 2H20V32Z"
        />

        <path
          className="chrome-workbench-tab__active-cap-outline"
          d="M0 31.5C5.5 31.5 9.5 27.7 9.5 23V10C9.5 5.9 13.1 2.5 17.5 2.5H20"
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
          d="M0 32C5.5 32 9.5 28 9.5 23V10C9.5 5.6 13.1 2 17.5 2H20V32Z"
        />

        <path
          className="chrome-workbench-tab__active-cap-outline"
          d="M0 31.5C5.5 31.5 9.5 27.7 9.5 23V10C9.5 5.9 13.1 2.5 17.5 2.5H20"
        />
      </svg>
    </div>
  )
}`
}

function removeUnusedUseId(source) {
  if (
    /\buseId\s*\(/.test(source)
  ) {
    return source
  }

  const reactImportPattern =
    /import\s*\{([\s\S]*?)\}\s*from\s*(['"])react\2/

  const match =
    reactImportPattern.exec(source)

  if (!match || !match[1]) {
    throw new Error(
      paths.tabs +
        ': 找不到 React named import。',
    )
  }

  if (
    !/\buseId\b/.test(match[1])
  ) {
    return source
  }

  let importBody = match[1]

  importBody = importBody.replace(
    /\buseId\s*,\s*/g,
    '',
  )

  importBody = importBody.replace(
    /,\s*\buseId\b/g,
    '',
  )

  const updatedImport =
    match[0].replace(
      match[1],
      importBody,
    )

  return (
    source.slice(0, match.index) +
    updatedImport +
    source.slice(
      match.index + match[0].length,
    )
  )
}

function validateTabsComponent(source) {
  const expectedCounts = [
    {
      token:
        '<ChromeActiveTabShape />',
      count: 1,
    },
    {
      token:
        'function ChromeActiveTabShape()',
      count: 1,
    },
    {
      token:
        'className="chrome-workbench-tab__separator"',
      count: 1,
    },
  ]

  for (const expected of expectedCounts) {
    const count =
      source.split(expected.token).length - 1

    if (count !== expected.count) {
      throw new Error(
        paths.tabs +
          ': ' +
          expected.token +
          ' 应出现 ' +
          String(expected.count) +
          ' 次，实际为 ' +
          String(count) +
          ' 次。',
      )
    }
  }

  const forbidden = [
    'ChromeTabBackground',
    '<linearGradient',
    '<stop',
    'gradientScope',
    'leftGradientId',
    'rightGradientId',
    'chrome-workbench-tab__divider--leading',
    'chrome-workbench-tab__divider--trailing',
  ]

  for (const token of forbidden) {
    if (source.includes(token)) {
      throw new Error(
        paths.tabs +
          ': 旧结构仍包含 ' +
          token,
      )
    }
  }
}

function writeCanonicalStyles() {
  const css = String.raw`
/*
 * Canonical Chrome-style workbench tabs.
 *
 * A single boundary color is shared by the active-tab outline and the
 * workspace separator. Continuity is geometric; there are no outline
 * gradients, shadows or opacity-erased edges.
 */

.chrome-workbench-tabs,
.chrome-workbench-tabs * {
  box-sizing: border-box;
}

.chrome-workbench-tabs {
  --chrome-tab-height: 32px;
  --chrome-tab-min-width: 120px;
  --chrome-tab-preferred-width: 196px;
  --chrome-tab-max-width: 228px;

  --chrome-tab-strip: var(--color-chrome);
  --chrome-tab-surface: var(--color-background);

  --chrome-tab-boundary: color-mix(
    in srgb,
    var(--color-foreground) 15%,
    var(--chrome-tab-surface) 85%
  );

  --chrome-tab-divider: color-mix(
    in srgb,
    var(--color-foreground) 18%,
    var(--chrome-tab-strip) 82%
  );

  --chrome-tab-hover: color-mix(
    in srgb,
    var(--color-foreground) 4%,
    var(--chrome-tab-strip) 96%
  );

  position: relative;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  color: var(--color-foreground);
  background: var(--chrome-tab-strip);
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  font-size: 12px;
}

.chrome-workbench-tabs::after {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: var(--chrome-tab-boundary);
  content: "";
  pointer-events: none;
}

.chrome-workbench-tabs__scroller {
  position: relative;
  display: flex;
  align-items: end;
  width: 100%;
  height: 100%;
  min-width: 0;
  padding: 4px 4px 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}

.chrome-workbench-tabs__scroller::-webkit-scrollbar {
  display: none;
}

.chrome-workbench-tabs__drag-region {
  height: 100%;
  min-width: 24px;
  flex: 1 0 24px;
}

.chrome-workbench-tab {
  position: relative;
  z-index: 1;
  height: var(--chrome-tab-height);
  min-width: var(--chrome-tab-min-width);
  max-width: var(--chrome-tab-max-width);
  flex: 0 1 var(--chrome-tab-preferred-width);
  margin-left: -4px;
  overflow: visible;
  isolation: isolate;
  user-select: none;
}

.chrome-workbench-tab:first-child {
  margin-left: 0;
}

.chrome-workbench-tab[data-active="true"] {
  z-index: 5;
}

.chrome-workbench-tab:hover:not(
    [data-active="true"]
  ) {
  z-index: 3;
}

.chrome-workbench-tab[data-active="true"]::before,
.chrome-workbench-tab[data-active="true"]::after {
  display: none;
  content: none;
  box-shadow: none;
}

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
  stroke: var(--chrome-tab-boundary);
  stroke-width: 1;
  stroke-linecap: round;
  stroke-linejoin: round;
  shape-rendering: geometricPrecision;
  vector-effect: non-scaling-stroke;
}

.chrome-workbench-tab__active-center {
  position: absolute;
  top: 2px;
  right: 20px;
  bottom: 0;
  left: 20px;
  border-top: 1px solid
    var(--chrome-tab-boundary);
  background: var(--chrome-tab-surface);
}

.chrome-workbench-tab__content {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  background: transparent;
  transition: color 80ms ease-out;
}

.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__content {
  inset: 2px 12px 0;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.chrome-workbench-tab:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__content {
  inset: 2px 3px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  outline: 0;
  box-shadow: none;
}

.chrome-workbench-tab:hover:not(
    [data-active="true"]
  ):not(
    [data-suppress-hover="true"]
  )
  .chrome-workbench-tab__content {
  border: 0;
  background: var(--chrome-tab-hover);
  box-shadow: none;
}

.chrome-workbench-tab[
    data-suppress-hover="true"
  ]:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__content {
  border: 0;
  background: transparent;
  box-shadow: none;
  transition: none;
}

.chrome-workbench-tab[
    data-suppress-hover="true"
  ]
  .chrome-workbench-tab__separator {
  opacity: 0;
  transition: none;
}

.chrome-workbench-tab__activation {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  flex: 1 1 auto;
  gap: 7px;
  padding: 0;
  overflow: hidden;
  border: 0;
  outline: 0;
  color: var(--color-muted-foreground);
  background: transparent;
  text-align: left;
  cursor: default;
}

.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__activation,
.chrome-workbench-tab:hover:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__activation {
  color: var(--color-foreground);
}

.chrome-workbench-tab__activation:focus-visible {
  border-radius: 6px;
  outline: 2px solid var(--color-primary);
  outline-offset: -3px;
}

.chrome-workbench-tab__icon {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  stroke-width: 1.8;
}

.chrome-workbench-tab__title {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__title {
  font-weight: 500;
}

.chrome-workbench-tab__end {
  position: relative;
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  margin-left: 3px;
  place-items: center;
}

.chrome-workbench-tab__close {
  position: absolute;
  inset: 2px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: currentColor;
  background: transparent;
  opacity: 0.78;
}

.chrome-workbench-tab__close:hover {
  background: color-mix(
    in srgb,
    var(--color-foreground) 10%,
    transparent
  );
  opacity: 1;
}

.chrome-workbench-tab__close:active {
  background: color-mix(
    in srgb,
    var(--color-foreground) 16%,
    transparent
  );
}

.chrome-workbench-tab__close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.chrome-workbench-tab__status {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.chrome-workbench-tab__status--dirty {
  background: #d5803b;
}

.chrome-workbench-tab__status--saving {
  background: #2783de;
  animation:
    chrome-workbench-saving
    900ms
    ease-in-out
    infinite
    alternate;
}

.chrome-workbench-tab__status--failed {
  background: #e56458;
}

.chrome-workbench-tab__status
  + .chrome-workbench-tab__close {
  opacity: 0;
}

.chrome-workbench-tab:hover
  .chrome-workbench-tab__status {
  opacity: 0;
}

.chrome-workbench-tab:hover
  .chrome-workbench-tab__status
  + .chrome-workbench-tab__close {
  opacity: 1;
}

.chrome-workbench-tab__separator {
  position: absolute;
  z-index: 2;
  top: 9px;
  right: 3px;
  bottom: 9px;
  width: 1px;
  background: var(--chrome-tab-divider);
  opacity: 1;
  pointer-events: none;
  transition: opacity 100ms ease-out;
}

.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__separator,
.chrome-workbench-tab:hover
  .chrome-workbench-tab__separator,
.chrome-workbench-tab:has(
    + .chrome-workbench-tab[data-active="true"]
  )
  .chrome-workbench-tab__separator,
.chrome-workbench-tab:has(
    + .chrome-workbench-tab:hover
  )
  .chrome-workbench-tab__separator {
  opacity: 0;
}

.chrome-workbench-tabs__new-tab {
  align-self: center;
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  margin: 0 3px 1px 2px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: var(--color-muted-foreground);
  background: transparent;
}

.chrome-workbench-tabs__new-tab:hover {
  color: var(--color-foreground);
  background: color-mix(
    in srgb,
    var(--color-foreground) 8%,
    transparent
  );
}

.chrome-workbench-tabs__new-tab:active {
  background: color-mix(
    in srgb,
    var(--color-foreground) 14%,
    transparent
  );
}

.chrome-workbench-tabs__new-tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

@keyframes chrome-workbench-saving {
  from {
    opacity: 0.4;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chrome-workbench-tab__content,
  .chrome-workbench-tab__separator,
  .chrome-workbench-tab__status {
    transition: none;
    animation: none;
  }
}
`

  atomicWrite(
    join(root, paths.styles),
    css,
  )

  console.log('WRITE  ' + paths.styles)
}

function normalizeWorkspaceBoundary() {
  const absolutePath = join(
    root,
    paths.shell,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  const withHeaderBorder =
    'col-span-full row-1 min-h-0 min-w-0 border-b border-divider bg-chrome'

  const controlledBoundary =
    'col-span-full row-1 min-h-0 min-w-0 bg-chrome'

  if (
    original.includes(withHeaderBorder)
  ) {
    atomicWrite(
      absolutePath,
      original.replace(
        withHeaderBorder,
        controlledBoundary,
      ),
    )

    console.log(
      'PATCH  ' +
        paths.shell +
        '（由标签层绘制工作区分割线）',
    )

    return
  }

  if (
    original.includes(controlledBoundary)
  ) {
    console.log(
      'SKIP   ' +
        paths.shell +
        '（标签层已控制工作区分割线）',
    )

    return
  }

  throw new Error(
    paths.shell +
      ': 找不到标题行 className。',
  )
}

function runChecks() {
  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    paths.tabs,
    paths.styles,
    paths.shell,
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

  for (const path of Object.values(paths)) {
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