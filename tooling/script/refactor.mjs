#!/usr/bin/env node

/**
 * 优化顶部工作台标签栏：
 *
 * 1. 缩小标签最小宽度
 * 2. 建立独立、严格裁剪的标签滚动视口
 * 3. 加号按钮固定在右侧
 * 4. 激活标签时只滚动标签视口
 * 5. 减少边缘半个标签和两侧 UI 覆盖问题
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

function updateActiveTabScrolling(content) {
  if (content.includes('const viewportStart = scroller.scrollLeft')) {
    return content
  }

  const oldEffect = `  useEffect(() => {
    if (!activeTabId) {
      return
    }

    tabRefs.current.get(activeTabId)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeTabId])`

  const newEffect = `  useEffect(() => {
    if (!activeTabId) {
      return
    }

    const scroller = scrollerRef.current
    const activation = tabRefs.current.get(activeTabId)
    const tab = activation?.closest<HTMLElement>(
      '.chrome-workbench-tab',
    )

    if (!scroller || !tab) {
      return
    }

    /*
     * 只移动标签视口自身，不使用 scrollIntoView。
     * scrollIntoView 可能同时滚动祖先容器，导致标签看起来
     * 延伸到顶部栏两侧的固定 UI 下方。
     */
    const viewportPadding = 4
    const viewportStart = scroller.scrollLeft
    const viewportEnd =
      viewportStart + scroller.clientWidth
    const tabStart = tab.offsetLeft
    const tabEnd = tabStart + tab.offsetWidth

    let nextScrollLeft = viewportStart

    if (tabStart < viewportStart + viewportPadding) {
      nextScrollLeft = Math.max(
        0,
        tabStart - viewportPadding,
      )
    } else if (tabEnd > viewportEnd - viewportPadding) {
      nextScrollLeft =
        tabEnd -
        scroller.clientWidth +
        viewportPadding
    }

    if (nextScrollLeft !== viewportStart) {
      scroller.scrollTo({
        left: nextScrollLeft,
        behavior: 'auto',
      })
    }
  }, [activeTabId])`

  if (!content.includes(oldEffect)) {
    throw new Error(
      '无法找到 WorkbenchTabs.tsx 中原有的 scrollIntoView 代码。',
    )
  }

  return content.replace(oldEffect, newEffect)
}

function updateTabsMarkup(content) {
  if (
    content.includes(
      'className="chrome-workbench-tabs__viewport"',
    )
  ) {
    return content
  }

  const renderStart = content.indexOf(
    `  return (
    <div className="chrome-workbench-tabs">`,
  )

  const renderEndMarker =
    '\n  )\n}\n\nfunction ChromeActiveTabShape'

  const renderEnd = content.indexOf(
    renderEndMarker,
    renderStart,
  )

  if (renderStart < 0 || renderEnd < 0) {
    throw new Error(
      '无法找到 WorkbenchTabs.tsx 的标签栏渲染代码。',
    )
  }

  const newRender = `  return (
    <div className="chrome-workbench-tabs">
      <div className="chrome-workbench-tabs__viewport">
        <div
          aria-label="工作台标签页"
          className="chrome-workbench-tabs__scroller"
          onWheel={(event) => {
            const scroller = scrollerRef.current

            if (
              !scroller ||
              Math.abs(event.deltaY) <=
                Math.abs(event.deltaX)
            ) {
              return
            }

            scroller.scrollLeft += event.deltaY
          }}
          ref={scrollerRef}
          role="tablist"
        >
          {tabs.map((tab, index) => {
            const Icon = resolveTabIcon(tab)

            return (
              <article
                className="chrome-workbench-tab"
                data-active={
                  tab.isActive ? 'true' : 'false'
                }
                draggable={tab.canClose}
                key={tab.id}
                onDragEnd={() => {
                  draggedTabIdRef.current = null
                }}
                onDragOver={(event) => {
                  if (draggedTabIdRef.current) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }
                }}
                onDragStart={(event) =>
                  handleDragStart(event, tab)
                }
                onDrop={(event) =>
                  handleDrop(event, index)
                }
                onPointerLeave={(event) => {
                  event.currentTarget.removeAttribute(
                    'data-suppress-hover',
                  )
                }}
                onMouseDown={(event) => {
                  if (
                    event.button === 1 &&
                    tab.canClose
                  ) {
                    event.preventDefault()
                    onClose(tab.id)
                  }
                }}
              >
                <ChromeActiveTabShape />

                <span
                  aria-hidden="true"
                  className="chrome-workbench-tab__separator"
                />

                <div className="chrome-workbench-tab__content">
                  <button
                    aria-controls={
                      'workbench-panel-' +
                      encodeDomId(tab.id)
                    }
                    aria-selected={tab.isActive}
                    className="chrome-workbench-tab__activation"
                    id={
                      'workbench-tab-' +
                      encodeDomId(tab.id)
                    }
                    onClick={() => onActivate(tab.id)}
                    onKeyDown={(event) =>
                      handleKeyboard(event, tab.id)
                    }
                    ref={(node) => {
                      if (node) {
                        tabRefs.current.set(
                          tab.id,
                          node,
                        )
                      } else {
                        tabRefs.current.delete(tab.id)
                      }
                    }}
                    role="tab"
                    tabIndex={tab.isActive ? 0 : -1}
                    title={tab.title}
                    type="button"
                  >
                    <Icon
                      aria-hidden="true"
                      className="chrome-workbench-tab__icon"
                    />

                    <span className="chrome-workbench-tab__title">
                      {tab.title}
                    </span>
                  </button>

                  <TabEndAction
                    model={tab}
                    onClose={onClose}
                  />
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div
        className="chrome-workbench-tabs__actions"
        data-window-drag-exclude
      >
        <button
          aria-label="新建画布"
          className="chrome-workbench-tabs__new-tab"
          onClick={onCreate}
          type="button"
        >
          <Plus
            aria-hidden="true"
            className="size-3.5"
          />
        </button>
      </div>
    </div>`

  return (
    content.slice(0, renderStart) +
    newRender +
    content.slice(renderEnd)
  )
}

function updateWorkbenchTabs() {
  let content = readFile(WORKBENCH_TABS_PATH)

  content = updateActiveTabScrolling(content)
  content = updateTabsMarkup(content)

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
      content.slice(existingEnd + overrideEnd.length)
  }

  const overrides = `

/* BEGIN FIXED WORKBENCH TAB VIEWPORT */

/*
 * Layout ownership:
 *
 * - __viewport owns all scrollable tabs.
 * - __actions owns persistent controls such as the new-tab button.
 * - Tabs are never allowed to paint underneath persistent controls.
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
 * This is the hard clipping boundary for tabs.
 * Active-tab caps and partially scrolled tabs cannot leak into
 * the new-tab button or window-control regions.
 */
.chrome-workbench-tabs__viewport {
  position: relative;
  min-width: 0;
  height: 100%;
  flex: 1 1 auto;
  overflow: hidden;
}

.chrome-workbench-tabs__scroller {
  width: 100%;
  min-width: 0;
  height: 100%;
  scroll-padding-inline: 4px;
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
 * Keep inactive narrow tabs readable.
 * The close action remains available on hover, while the active
 * tab continues to expose its normal end action.
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
 * Persistent right-side actions are not part of the tab scroller.
 * The plus button therefore remains visible regardless of tab count.
 */
.chrome-workbench-tabs__actions {
  position: relative;
  z-index: 8;
  display: flex;
  width: 34px;
  height: 100%;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--chrome-tab-boundary);
  background: var(--chrome-tab-strip);
}

.chrome-workbench-tabs__new-tab {
  align-self: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  margin: 0 0 1px;
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

  updateWorkbenchTabs()
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
  console.log('- 标签最小宽度：88px')
  console.log('- 标签首选宽度：168px')
  console.log('- 标签最大宽度：220px')
  console.log('- 标签只能在独立视口内滚动')
  console.log('- 两侧固定 UI 不再覆盖标签')
  console.log('- 加号按钮固定在标签栏右侧')
  console.log('- 激活标签只滚动标签容器自身')
}

try {
  main()
} catch (error) {
  console.error('\n修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}