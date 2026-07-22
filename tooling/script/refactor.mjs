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
  console.log('将修复 Chrome 标签分割线和活动标签基线：')
  console.log('PATCH  ' + paths.tabs)
  console.log('PATCH  ' + paths.styles)
  console.log('PATCH  ' + paths.shell)
  console.log('')
  console.log('- 每个标签边界只保留一根分割线')
  console.log('- 活动标签两侧不显示分割线')
  console.log('- Hover 标签两侧分割线同步渐隐')
  console.log('- 删除活动标签下方接缝')
  console.log('- 保留侧边栏标题栏占位')
  console.log('- 不修改 DesktopTitleBar 布局')
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

patchTabsMarkup()
patchSeparatorStyles()
patchWorkspaceBaseline()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log(
  'Chrome 标签分割线和工作区融合逻辑修复完成。',
)

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
   * Chromium internally tracks leading and trailing separator
   * opacities because adjacent native tabs overlap and both separators
   * are aligned to the same physical coordinate.
   *
   * Our DOM tabs do not share that native paint coordinate. Therefore,
   * each visual boundary has exactly one owner: the tab on its left.
   */
  const twoSeparatorsPattern =
    /\n\s*<span\n\s*aria-hidden="true"\n\s*className="chrome-workbench-tab__divider chrome-workbench-tab__divider--leading"\n\s*\/>\n\s*<span\n\s*aria-hidden="true"\n\s*className="chrome-workbench-tab__divider chrome-workbench-tab__divider--trailing"\n\s*\/>/

  const oneSeparatorMarkup = `
              <span
                aria-hidden="true"
                className="chrome-workbench-tab__separator"
              />`

  if (
    twoSeparatorsPattern.test(updated)
  ) {
    updated = updated.replace(
      twoSeparatorsPattern,
      oneSeparatorMarkup,
    )
  } else {
    /*
     * Handle a partially modified version where only one legacy
     * divider remains.
     */
    updated = updated.replace(
      /\n\s*<span\n\s*aria-hidden="true"\n\s*className="chrome-workbench-tab__divider chrome-workbench-tab__divider--leading"\n\s*\/>/g,
      '',
    )

    updated = updated.replace(
      /className="chrome-workbench-tab__divider chrome-workbench-tab__divider--trailing"/g,
      'className="chrome-workbench-tab__separator"',
    )
  }

  /*
   * There must not be a strip-wide baseline. The selected tab and
   * workspace surface already share the same surface token.
   */
  updated = updated.replace(
    /\n\s*<div aria-hidden="true" className="chrome-workbench-tabs__bottom-bar" \/>\n?/g,
    '\n',
  )

  assertTabsMarkup(updated)

  if (updated === original) {
    console.log(
      'SKIP   ' +
        paths.tabs +
        '（DOM 已经使用单边界分割线）',
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
  const separatorCount =
    source.match(
      /className="chrome-workbench-tab__separator"/g,
    )?.length ?? 0

  if (separatorCount !== 1) {
    throw new Error(
      paths.tabs +
        ': 分割线模板应出现一次，实际出现 ' +
        String(separatorCount) +
        ' 次。',
    )
  }

  const forbiddenTokens = [
    'chrome-workbench-tab__divider--leading',
    'chrome-workbench-tab__divider--trailing',
    'chrome-workbench-tabs__bottom-bar',
  ]

  for (const token of forbiddenTokens) {
    if (source.includes(token)) {
      throw new Error(
        paths.tabs +
          ': 旧结构仍然包含 ' +
          token,
      )
    }
  }
}

function patchSeparatorStyles() {
  const absolutePath = join(
    root,
    paths.styles,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  const separatorStyles = String.raw`
/*
 * One DOM separator represents one physical boundary.
 *
 * Chromium computes leading and trailing opacities independently
 * because native tabs overlap and their separators align onto the
 * same device coordinate. In this flex layout, rendering both sides
 * would produce two distinct lines, so the left tab exclusively owns
 * the boundary after it.
 */
.chrome-workbench-tab__separator {
  position: absolute;
  z-index: 2;
  top: 10px;
  right: var(
    --chrome-tab-shoulder,
    var(--chrome-tab-margin, 12px)
  );
  bottom: 9px;
  width: 1px;
  background: var(--chrome-tab-divider);
  opacity: 1;
  pointer-events: none;
  transition: opacity 120ms ease-out;
}

/*
 * Chromium separator state mapped to a single-active-tab workbench:
 *
 * 1. Active tabs have a visible shape, so their own trailing
 *    separator is hidden.
 * 2. Hovered tabs have a visible hover shape, so their trailing
 *    separator fades out.
 * 3. The preceding tab owns the boundary before the active/hovered
 *    tab, so that preceding separator must also fade out.
 *
 * This guarantees that active and hovered tabs have no separator on
 * either side, while two ordinary background tabs have exactly one.
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
`

  let updated = original

  /*
   * Replace the entire legacy separator section, regardless of
   * whether it came from the original SVG version or shoulder version.
   */
  const separatorSectionPattern =
    /\.chrome-workbench-tab__divider\s*\{[\s\S]*?(?=\.chrome-workbench-tabs__new-tab\s*\{)/

  if (
    separatorSectionPattern.test(updated)
  ) {
    updated = updated.replace(
      separatorSectionPattern,
      separatorStyles + '\n',
    )
  } else if (
    updated.includes(
      '.chrome-workbench-tab__separator {',
    )
  ) {
    const existingSeparatorPattern =
      /\/\*\n \* One DOM separator[\s\S]*?(?=\.chrome-workbench-tabs__new-tab\s*\{)/

    if (
      existingSeparatorPattern.test(updated)
    ) {
      updated = updated.replace(
        existingSeparatorPattern,
        separatorStyles + '\n',
      )
    } else {
      throw new Error(
        paths.styles +
          ': 已存在 separator，但无法确定安全替换范围。',
      )
    }
  } else {
    throw new Error(
      paths.styles +
        ': 找不到旧分割线样式区域。',
    )
  }

  /*
   * Remove the artificial strip-wide baseline.
   */
  updated = updated.replace(
    /\.chrome-workbench-tabs__bottom-bar\s*\{[\s\S]*?\}\n?/g,
    '',
  )

  /*
   * Remove stale reduced-motion references to the old divider.
   */
  updated = updated.replaceAll(
    '.chrome-workbench-tab__divider,',
    '.chrome-workbench-tab__separator,',
  )

  assertSeparatorStyles(updated)

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + paths.styles)
}

function assertSeparatorStyles(source) {
  const requiredTokens = [
    '.chrome-workbench-tab__separator {',
    '.chrome-workbench-tab[data-active="true"]',
    '+ .chrome-workbench-tab[data-active="true"]',
    '+ .chrome-workbench-tab:hover',
    'opacity: 0;',
  ]

  for (const token of requiredTokens) {
    if (!source.includes(token)) {
      throw new Error(
        paths.styles +
          ': 新分割线逻辑缺少 ' +
          token,
      )
    }
  }

  const forbiddenTokens = [
    '.chrome-workbench-tab__divider {',
    'chrome-workbench-tab__divider--leading',
    'chrome-workbench-tab__divider--trailing',
    '.chrome-workbench-tabs__bottom-bar {',
  ]

  for (const token of forbiddenTokens) {
    if (source.includes(token)) {
      throw new Error(
        paths.styles +
          ': 旧样式仍然包含 ' +
          token,
      )
    }
  }
}

function patchWorkspaceBaseline() {
  const absolutePath = join(
    root,
    paths.shell,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  /*
   * This border spans the full chrome row, including directly below
   * the active tab. It conflicts with the selected tab's surface and
   * creates the visible seam reported by the user.
   *
   * DesktopTitleBar's intentionally reserved sidebar space is not
   * touched.
   */
  const oldClass =
    'col-span-full row-1 min-h-0 min-w-0 border-b border-divider bg-chrome'

  const newClass =
    'col-span-full row-1 min-h-0 min-w-0 bg-chrome'

  if (
    !original.includes(oldClass)
  ) {
    if (original.includes(newClass)) {
      console.log(
        'SKIP   ' +
          paths.shell +
          '（工作区基线已经删除）',
      )
      return
    }

    throw new Error(
      paths.shell +
        ': 找不到预期的 Chrome 行底部边框。',
    )
  }

  const updated = original.replace(
    oldClass,
    newClass,
  )

  if (
    updated.includes(oldClass)
  ) {
    throw new Error(
      paths.shell +
        ': 工作区基线删除失败。',
    )
  }

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + paths.shell)
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