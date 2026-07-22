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
  console.log('将重构 Chrome 标签视觉细节：')
  console.log('PATCH  ' + paths.tabs)
  console.log('WRITE  ' + paths.styles)
  console.log('PATCH  ' + paths.shell)
  console.log('')
  console.log('- 缩短标签视觉间距')
  console.log('- 增强非活动标签 Hover')
  console.log('- Hover 区域上下留白')
  console.log('- 缩小加号及其 Hover 区域')
  console.log('- 活动标签顶部留白')
  console.log('- 恢复工作区分割线')
  console.log('- 仅在活动标签下方遮蔽分割线')
  console.log('- 添加平滑标签轮廓')
  console.log('')
  console.log('不会修改 DesktopTitleBar。')
  console.log('不会修改侧边栏宽度占位。')
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

patchTabsMarkup()
writeStyles()
normalizeWorkspaceBaseline()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log('Chrome 标签视觉细节重构完成。')

function patchTabsMarkup() {
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
   * Normalize old two-separator markup if the previous migration
   * has not been applied completely.
   */
  const legacyTwoSeparators =
    /\n\s*<span\n\s*aria-hidden="true"\n\s*className="chrome-workbench-tab__divider chrome-workbench-tab__divider--leading"\n\s*\/>\n\s*<span\n\s*aria-hidden="true"\n\s*className="chrome-workbench-tab__divider chrome-workbench-tab__divider--trailing"\n\s*\/>/

  if (
    legacyTwoSeparators.test(updated)
  ) {
    updated = updated.replace(
      legacyTwoSeparators,
      `
              <span
                aria-hidden="true"
                className="chrome-workbench-tab__separator"
              />`,
    )
  }

  updated = updated.replace(
    /className="chrome-workbench-tab__divider chrome-workbench-tab__divider--trailing"/g,
    'className="chrome-workbench-tab__separator"',
  )

  updated = updated.replace(
    /\n\s*<span\n\s*aria-hidden="true"\n\s*className="chrome-workbench-tab__divider chrome-workbench-tab__divider--leading"\n\s*\/>/g,
    '',
  )

  /*
   * The strip baseline is now rendered by CSS behind the tabs.
   * An extra DOM bottom bar would produce a second line.
   */
  updated = updated.replace(
    /\n\s*<div aria-hidden="true" className="chrome-workbench-tabs__bottom-bar" \/>\n?/g,
    '\n',
  )

  /*
   * Match the close icon's 14px visual size.
   */
  updated = updated.replace(
    /<Plus aria-hidden="true" className="size-5" \/>/g,
    '<Plus aria-hidden="true" className="size-3.5" />',
  )

  /*
   * Ensure the old ResizeObserver cannot hide tab text.
   */
  updated = updated.replace(
    /\n  useEffect\(\(\) => \{\n    const scroller = scrollerRef\.current[\s\S]*?\n  \}, \[tabs\]\)\n/,
    '\n',
  )

  updated = updated.replace(
    /\n\s*data-size="normal"/g,
    '',
  )

  assertTabsMarkup(updated)

  if (updated === original) {
    console.log(
      'SKIP   ' +
        paths.tabs +
        '（标签 DOM 已符合目标结构）',
    )
    return
  }

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + paths.tabs)
}

function assertTabsMarkup(source) {
  const separatorTemplates =
    source.match(
      /className="chrome-workbench-tab__separator"/g,
    )?.length ?? 0

  if (separatorTemplates !== 1) {
    throw new Error(
      paths.tabs +
        ': separator 模板应出现一次，实际为 ' +
        String(separatorTemplates) +
        ' 次。',
    )
  }

  const requiredTokens = [
    '<Plus aria-hidden="true" className="size-3.5" />',
    'chrome-workbench-tab__title',
    '{tab.title}',
  ]

  for (const token of requiredTokens) {
    if (!source.includes(token)) {
      throw new Error(
        paths.tabs +
          ': 缺少 ' +
          token,
      )
    }
  }

  const forbiddenTokens = [
    'chrome-workbench-tab__divider--leading',
    'chrome-workbench-tab__divider--trailing',
    'chrome-workbench-tabs__bottom-bar',
    'ResizeObserver',
    'data-size="normal"',
  ]

  for (const token of forbiddenTokens) {
    if (source.includes(token)) {
      throw new Error(
        paths.tabs +
          ': 旧实现仍然包含 ' +
          token,
      )
    }
  }
}

function writeStyles() {
  const css = String.raw`
/*
 * Chrome-style workbench tabs.
 *
 * The strip owns one continuous baseline between browser chrome and
 * workspace content. Active tab geometry is painted above that line,
 * covering only the segment directly beneath the active tab. This
 * preserves the workspace separator while making the active tab look
 * physically open into the workspace.
 */

.chrome-workbench-tabs,
.chrome-workbench-tabs * {
  box-sizing: border-box;
}

.chrome-workbench-tabs {
  --chrome-tab-height: 32px;
  --chrome-tab-shoulder: 8px;
  --chrome-tab-min-width: 120px;
  --chrome-tab-preferred-width: 196px;
  --chrome-tab-max-width: 228px;

  --chrome-tab-strip: var(--color-chrome);
  --chrome-tab-surface: var(--color-background);

  --chrome-tab-hover: color-mix(
    in srgb,
    var(--color-foreground) 9%,
    var(--chrome-tab-strip)
  );

  --chrome-tab-hover-border: color-mix(
    in srgb,
    var(--color-foreground) 13%,
    transparent
  );

  --chrome-tab-outline: color-mix(
    in srgb,
    var(--color-foreground) 18%,
    transparent
  );

  --chrome-tab-divider: color-mix(
    in srgb,
    var(--color-foreground) 21%,
    transparent
  );

  --chrome-workspace-divider: var(
    --color-divider,
    color-mix(
      in srgb,
      var(--color-foreground) 16%,
      transparent
    )
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

/*
 * Real workspace separator.
 *
 * It exists across the strip but is painted below active tabs. The
 * active body and its shoulders have a higher stacking order and mask
 * only their own portion of the separator.
 */
.chrome-workbench-tabs::after {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: var(--chrome-workspace-divider);
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

/*
 * Tabs overlap slightly so neighboring tabs do not look detached.
 * The overlap is visual only and does not change state ownership.
 */
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

/*
 * Active shoulders.
 *
 * The first shadow paints the surface. The second, slightly larger
 * shadow paints the subtle outline around the concave transition.
 */
.chrome-workbench-tab[data-active="true"]::before,
.chrome-workbench-tab[data-active="true"]::after {
  position: absolute;
  z-index: 3;
  bottom: 0;
  width: var(--chrome-tab-shoulder);
  height: var(--chrome-tab-shoulder);
  content: "";
  pointer-events: none;
}

.chrome-workbench-tab[data-active="true"]::before {
  left: 0;
  border-bottom-right-radius: var(
    --chrome-tab-shoulder
  );
  box-shadow:
    4px 4px 0 4px var(--chrome-tab-surface),
    4px 3px 0 5px var(--chrome-tab-outline);
}

.chrome-workbench-tab[data-active="true"]::after {
  right: 0;
  border-bottom-left-radius: var(
    --chrome-tab-shoulder
  );
  box-shadow:
    -4px 4px 0 4px var(--chrome-tab-surface),
    -4px 3px 0 5px var(--chrome-tab-outline);
}

/*
 * Default content occupies the tab without creating its own visible
 * background. Inactive hover and active states provide their own
 * geometry below.
 */
.chrome-workbench-tab__content {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  background: transparent;
  transition:
    background-color 120ms ease-out,
    border-color 120ms ease-out,
    color 120ms ease-out;
}

/*
 * Active body:
 * - 2px internal top gap in addition to the strip's 4px top padding.
 * - No bottom border, so the body opens into the workspace.
 * - Top and side outline remains visible.
 */
.chrome-workbench-tab[data-active="true"]
  .chrome-workbench-tab__content {
  inset:
    2px
    var(--chrome-tab-shoulder)
    0;
  padding: 0 9px;
  border: 1px solid var(--chrome-tab-outline);
  border-bottom: 0;
  border-radius: 9px 9px 0 0;
  background: var(--chrome-tab-surface);
}

/*
 * Inactive body:
 * horizontal inset reduces the apparent gap between tabs.
 */
.chrome-workbench-tab:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__content {
  inset: 2px 3px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
}

/*
 * Hover fill intentionally leaves 2px above and below. It is stronger
 * than the previous translucent surface while remaining subordinate
 * to the active tab.
 */
.chrome-workbench-tab:hover:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__content {
  border-color: var(--chrome-tab-hover-border);
  background: var(--chrome-tab-hover);
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
  .chrome-workbench-tab__activation {
  color: var(--color-foreground);
}

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
    var(--color-foreground) 11%,
    transparent
  );
  opacity: 1;
}

.chrome-workbench-tab__close:active {
  background: color-mix(
    in srgb,
    var(--color-foreground) 17%,
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

/*
 * A single separator represents the boundary after this tab.
 */
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
  transition: opacity 120ms ease-out;
}

/*
 * Active and hover shapes replace separators on both sides.
 *
 * The current tab owns its right separator. The previous tab owns the
 * current tab's left separator.
 */
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

/*
 * Compact new-tab button.
 *
 * Icon size is 14px, matching the X icon. The hover target is reduced
 * from 36px to 26px and uses the same rounded-square language.
 */
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
    var(--color-foreground) 9%,
    transparent
  );
}

.chrome-workbench-tabs__new-tab:active {
  background: color-mix(
    in srgb,
    var(--color-foreground) 16%,
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

function normalizeWorkspaceBaseline() {
  const absolutePath = join(
    root,
    paths.shell,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  /*
   * Do not use the header border as the central workspace separator:
   * it paints above all child tab geometry and cannot be selectively
   * masked below the active tab.
   *
   * The separator is restored by .chrome-workbench-tabs::after, which
   * is painted behind the active tab. Sidebar/titlebar regions remain
   * untouched.
   */
  const withBorder =
    'col-span-full row-1 min-h-0 min-w-0 border-b border-divider bg-chrome'

  const controlledBaseline =
    'col-span-full row-1 min-h-0 min-w-0 bg-chrome'

  if (original.includes(withBorder)) {
    const updated = original.replace(
      withBorder,
      controlledBaseline,
    )

    atomicWrite(
      absolutePath,
      updated,
    )

    console.log(
      'PATCH  ' +
        paths.shell +
        '（改为可被活动标签遮蔽的分割线）',
    )

    return
  }

  if (
    original.includes(controlledBaseline)
  ) {
    console.log(
      'SKIP   ' +
        paths.shell +
        '（已使用标签层控制分割线）',
    )
    return
  }

  throw new Error(
    paths.shell +
      ': 找不到预期的 Chrome 标题行 className。',
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