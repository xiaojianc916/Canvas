#!/usr/bin/env node

/**
 * 修正新建标签按钮的位置：
 *
 * - 标签较少：加号紧跟最后一个标签
 * - 标签增多：加号自然向右移动
 * - 标签溢出：加号 sticky 在标签视口右侧
 * - 加号始终可见，但不是永久固定在顶部栏最右侧
 *
 * 运行：
 * node tooling/script/refactor.mjs --apply
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

function findRepositoryRoot(startDirectory) {
  let currentDirectory = startDirectory

  while (true) {
    if (
      fs.existsSync(path.join(currentDirectory, 'package.json')) &&
      fs.existsSync(path.join(currentDirectory, 'pnpm-workspace.yaml'))
    ) {
      return currentDirectory
    }

    const parentDirectory = path.dirname(currentDirectory)

    if (parentDirectory === currentDirectory) {
      throw new Error('找不到 Canvas 仓库根目录。')
    }

    currentDirectory = parentDirectory
  }
}

const ROOT = findRepositoryRoot(SCRIPT_DIRECTORY)

const WORKBENCH_TABS_PATH = path.join(
  ROOT,
  'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
)

const WORKBENCH_TABS_CSS_PATH = path.join(
  ROOT,
  'features/workspace/src/presentation/shell/chrome-workbench-tabs.css',
)

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在：${path.relative(ROOT, filePath)}`)
  }

  return fs.readFileSync(filePath, 'utf8')
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8')
  console.log(`已修改：${path.relative(ROOT, filePath)}`)
}

function updateWorkbenchTabsMarkup() {
  let content = readFile(WORKBENCH_TABS_PATH)

  if (
    content.includes(
      'className="chrome-workbench-tabs__new-tab chrome-workbench-tabs__new-tab--sticky"',
    )
  ) {
    console.log('加号按钮结构已经是 sticky 版本。')
    return
  }

  /*
   * 上一版结构：
   *
   * viewport
   * ├── scroller
   * │   └── tabs
   * └── actions
   *     └── plus
   *
   * 修正后：
   *
   * viewport
   * └── scroller
   *     ├── tabs
   *     ├── sticky plus
   *     └── remaining drag region
   */
  const fixedActionsTailPattern =
    /        <\/div>\s*<\/div>\s*<div\s+className="chrome-workbench-tabs__actions"\s+data-window-drag-exclude\s*>\s*<button\s+aria-label="新建画布"\s+className="chrome-workbench-tabs__new-tab"\s+onClick=\{onCreate\}\s+type="button"\s*>\s*<Plus\s+aria-hidden="true"\s+className="size-3\.5"\s*\/>\s*<\/button>\s*<\/div>\s*<\/div>/

  if (!fixedActionsTailPattern.test(content)) {
    throw new Error(
      [
        '无法找到上一版固定在右侧的加号按钮结构。',
        '请确认 WorkbenchTabs.tsx 已执行过上一版标签栏脚本。',
      ].join('\n'),
    )
  }

  const stickyTail = `          <button
            aria-label="新建画布"
            className="chrome-workbench-tabs__new-tab chrome-workbench-tabs__new-tab--sticky"
            data-window-drag-exclude
            onClick={onCreate}
            type="button"
          >
            <Plus
              aria-hidden="true"
              className="size-3.5"
            />
          </button>

          <div
            aria-hidden="true"
            className="chrome-workbench-tabs__drag-region"
          />
        </div>
      </div>
    </div>`

  content = content.replace(
    fixedActionsTailPattern,
    stickyTail,
  )

  writeFile(WORKBENCH_TABS_PATH, content)
}

function updateWorkbenchTabsCss() {
  let content = readFile(WORKBENCH_TABS_CSS_PATH)

  const overrideStart =
    '/* BEGIN FIXED WORKBENCH TAB VIEWPORT */'
  const overrideEnd =
    '/* END FIXED WORKBENCH TAB VIEWPORT */'

  const existingStart = content.indexOf(overrideStart)
  const existingEnd = content.indexOf(overrideEnd)

  if (existingStart >= 0 && existingEnd >= 0) {
    content =
      content.slice(0, existingStart) +
      content.slice(
        existingEnd + overrideEnd.length,
      )
  }

  const overrides = `

/* BEGIN FIXED WORKBENCH TAB VIEWPORT */

/*
 * Tab density:
 *
 * Tabs shrink before overflow, but retain enough room for an icon
 * and a recognizable title.
 */
.chrome-workbench-tabs {
  --chrome-tab-min-width: 88px;
  --chrome-tab-preferred-width: 168px;
  --chrome-tab-max-width: 220px;

  display: flex;
  align-items: stretch;
  min-width: 0;
}

/*
 * The viewport clips tabs at a real layout boundary.
 * Tabs cannot paint below the sidebar toggle or window controls.
 */
.chrome-workbench-tabs__viewport {
  position: relative;
  min-width: 0;
  height: 100%;
  flex: 1 1 auto;
  overflow: hidden;
}

.chrome-workbench-tabs__scroller {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 100%;
  scroll-padding-inline: 4px 34px;
  scroll-snap-type: x proximity;
  overscroll-behavior-inline: contain;
}

.chrome-workbench-tab {
  min-width: var(--chrome-tab-min-width);
  max-width: var(--chrome-tab-max-width);
  flex: 0 1 var(--chrome-tab-preferred-width);
  scroll-snap-align: start;
  scroll-snap-stop: normal;
}

/*
 * Narrow inactive tabs reserve their available width for the title.
 * Their close button becomes available when hovered.
 */
.chrome-workbench-tab:not([data-active="true"]):not(:hover)
  .chrome-workbench-tab__close {
  opacity: 0;
  pointer-events: none;
}

.chrome-workbench-tab:not([data-active="true"]):hover
  .chrome-workbench-tab__close {
  pointer-events: auto;
}

/*
 * Inline-until-overflow:
 *
 * In normal layout, the button sits immediately after the final tab.
 * When tabs exceed the viewport, position: sticky keeps the button
 * visible at the right edge of the tab viewport.
 */
.chrome-workbench-tabs__new-tab--sticky {
  position: sticky;
  z-index: 8;
  right: 4px;
  align-self: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  margin: 0 3px 1px 2px;
  background: var(--chrome-tab-strip);
  isolation: isolate;
}

.chrome-workbench-tabs__new-tab--sticky:hover {
  color: var(--color-foreground);
  background: color-mix(
    in srgb,
    var(--color-foreground) 8%,
    var(--chrome-tab-strip)
  );
}

.chrome-workbench-tabs__new-tab--sticky:active {
  background: color-mix(
    in srgb,
    var(--color-foreground) 14%,
    var(--chrome-tab-strip)
  );
}

/*
 * Empty space after the inline plus button remains draggable.
 * It grows only when the tab strip has unused space.
 */
.chrome-workbench-tabs__drag-region {
  height: 100%;
  min-width: 24px;
  flex: 1 0 24px;
}

@media (prefers-reduced-motion: reduce) {
  .chrome-workbench-tabs__scroller {
    scroll-behavior: auto;
  }
}

/* END FIXED WORKBENCH TAB VIEWPORT */
`

  content = `${content.trimEnd()}${overrides}\n`

  writeFile(WORKBENCH_TABS_CSS_PATH, content)
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
    env: process.env,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `命令执行失败（退出码 ${String(result.status)}）：` +
        `${command} ${args.join(' ')}`,
    )
  }
}

function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('请添加 --apply 参数执行修改。')
  }

  console.log(`仓库目录：${ROOT}\n`)

  updateWorkbenchTabsMarkup()
  updateWorkbenchTabsCss()

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
    'features/workspace/src/presentation/shell/chrome-workbench-tabs.css',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'typecheck',
  ])

  run('pnpm', ['test:architecture'])

  console.log('\n修改完成：')
  console.log('- 标签较少时，加号紧跟最后一个标签')
  console.log('- 标签增加时，加号自然向右移动')
  console.log('- 标签溢出时，加号吸附到视口右侧')
  console.log('- 加号始终保持可见')
  console.log('- 加号不再永久固定在顶部栏最右侧')
}

try {
  main()
} catch (error) {
  console.error('\n修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}