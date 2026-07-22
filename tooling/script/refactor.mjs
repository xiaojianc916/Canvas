#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: migration script intentionally reports progress. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')

const DIVIDER_COLOR = 'oklch(0.9067 0 0)'

const PATHS = Object.freeze({
  designTokens: 'foundations/design-system/src/styles/index.css',
  separator: 'foundations/design-system/src/components/ui/separator.tsx',
  applicationStyles: 'apps/desktop/src/app.css',
  desktopTitleBar:
    'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx',
  workspaceShell:
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  workbenchTabs:
    'features/workspace/src/presentation/shell/chrome-workbench-tabs.css',
})

main()

function main() {
  assertRepositoryRoot()

  const changes = []

  updateFile(PATHS.designTokens, migrateDesignTokens, changes)
  updateFile(PATHS.separator, migrateSeparator, changes)
  updateFile(PATHS.applicationStyles, migrateApplicationStyles, changes)
  updateFile(PATHS.desktopTitleBar, migrateDesktopTitleBar, changes)
  updateFile(PATHS.workspaceShell, migrateWorkspaceShell, changes)
  updateFile(PATHS.workbenchTabs, migrateWorkbenchTabs, changes)

  console.log('')

  if (changes.length === 0) {
    console.log('没有需要修改的内容；重构可能已经应用。')
    return
  }

  if (!WRITE) {
    console.log('已完成预览，没有写入文件。')
    console.log('')
    console.log('将修改：')

    for (const file of changes) {
      console.log(`- ${file}`)
    }

    console.log('')
    console.log('执行写入：')
    console.log('node tooling/script/1.mjs --write')
    return
  }

  console.log('区域分割线重构完成。')
  console.log('')
  console.log(`颜色：${DIVIDER_COLOR}`)
  console.log('宽度：1px')
  console.log('')
  console.log('已修改：')

  for (const file of changes) {
    console.log(`- ${file}`)
  }
}

function assertRepositoryRoot() {
  const packagePath = path.join(ROOT, 'package.json')

  if (!fs.existsSync(packagePath)) {
    fail('请在仓库根目录运行脚本：当前目录缺少 package.json')
  }

  let packageJson

  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } catch (cause) {
    fail(`无法读取 package.json：${formatCause(cause)}`)
  }

  if (packageJson.name !== 'hybrid-canvas') {
    fail(
      `仓库不匹配：期望 package.json.name 为 hybrid-canvas，实际为 ${String(
        packageJson.name,
      )}`,
    )
  }
}

function updateFile(relativePath, migrate, changes) {
  const absolutePath = path.join(ROOT, relativePath)

  if (!fs.existsSync(absolutePath)) {
    fail(`缺少文件：${relativePath}`)
  }

  const original = fs.readFileSync(absolutePath, 'utf8')
  const migrated = migrate(original)

  if (migrated === original) {
    console.log(`跳过：${relativePath}`)
    return
  }

  changes.push(relativePath)

  if (!WRITE) {
    console.log(`预览：${relativePath}`)
    return
  }

  fs.writeFileSync(absolutePath, migrated, 'utf8')
  console.log(`已修改：${relativePath}`)
}

function migrateDesignTokens(source) {
  let content = source

  content = replaceOneOf(
    content,
    [
      [
        '  --ui-divider: oklch(0.885 0.004 90);',
        '  --ui-border: var(--ui-divider);',
      ].join('\n'),
    ],
    [
      '  /* Canonical 1px workspace-region divider. */',
      `  --ui-region-divider-color: ${DIVIDER_COLOR};`,
      '  --ui-region-divider-width: 1px;',
      '  --ui-divider: var(--ui-region-divider-color);',
      '  --ui-border: var(--ui-region-divider-color);',
    ].join('\n'),
    '建立统一区域分割线 token',
  )

  content = replaceOneOf(
    content,
    [
      [
        '  --ui-divider: rgb(255 255 255 / 16%);',
        '  --ui-border: var(--ui-divider);',
      ].join('\n'),
    ],
    [
      '  /* Region divider remains theme-invariant. */',
      '  --ui-border: rgb(255 255 255 / 16%);',
    ].join('\n'),
    '删除暗色主题的区域分割线颜色覆盖',
  )

  return content
}

function migrateSeparator(source) {
  return replaceOneOf(
    source,
    ["'shrink-0 bg-border'"],
    "'shrink-0 bg-divider'",
    '让 Separator 使用统一 divider token',
  )
}

function migrateApplicationStyles(source) {
  let content = source

  content = removeIfPresent(
    content,
    '  --color-divider: #e0e0e0;\n',
  )

  content = removeIfPresent(
    content,
    '  --color-divider: var(--color-divider);\n',
  )

  return content
}

function migrateDesktopTitleBar(source) {
  let content = source

  /*
   * 最终目标：
   * 1. 左上角 48px 按钮区本身不画竖线。
   * 2. 仅当 sidebar open 时，由 sidebar 占位区右侧画线。
   * 3. 窗口控制区不再参与顶部水平边界绘制。
   */

  content = replaceOneOf(
    content,
    [
      'className="flex w-(--activity-rail-width) shrink-0 items-center justify-center border-b border-divider"',
      'className="flex w-(--activity-rail-width) shrink-0 items-center justify-center border-r border-divider"',
    ],
    'className="flex w-(--activity-rail-width) shrink-0 items-center justify-center"',
    '移除左上角按钮区右侧的错误分割线',
  )

  content = replaceOneOf(
    content,
    [
      [
        '        <div',
        '          className="shrink-0 border-b border-divider"',
        '          style={{',
        "            borderRightStyle: 'solid',",
        '            borderRightWidth: isSidebarOpen ? 1 : 0,',
        "            width: 'var(--workspace-sidebar-column-width, 0px)',",
        '          }}',
        '        />',
      ].join('\n'),
      [
        '        <div',
        '          className="shrink-0 border-r border-divider"',
        '          style={{',
        '            borderRightWidth: isSidebarOpen ? 1 : 0,',
        "            width: 'var(--workspace-sidebar-column-width, 0px)',",
        '          }}',
        '        />',
      ].join('\n'),
      [
        '        <div',
        '          className="shrink-0 border-r border-divider"',
        '          style={{',
        "            borderRightStyle: 'solid',",
        '            borderRightWidth: isSidebarOpen ? 1 : 0,',
        "            width: 'var(--workspace-sidebar-column-width, 0px)',",
        '          }}',
        '        />',
      ].join('\n'),
    ],
    [
      '        <div',
      '          className="shrink-0 border-r border-divider"',
      '          style={{',
      '            borderRightWidth: isSidebarOpen ? 1 : 0,',
      "            width: 'var(--workspace-sidebar-column-width, 0px)',",
      '          }}',
      '        />',
    ].join('\n'),
    '让标题栏中的 sidebar/titlebar 分割线只在 sidebar 打开时存在',
  )

  content = replaceOneOf(
    content,
    [
      '<div className="flex shrink-0 items-stretch border-b border-divider">',
    ],
    '<div className="flex shrink-0 items-stretch">',
    '删除窗口控制区的分段底边',
  )

  return content
}

function migrateWorkspaceShell(source) {
  let content = source

  /*
   * Chrome / 主体边界只由 header 绘制。
   */
  content = replaceOneOf(
    content,
    [
      '<header className="col-span-full row-1 min-h-0 min-w-0 bg-chrome">',
    ],
    '<header className="col-span-full row-1 min-h-0 min-w-0 border-b border-divider bg-chrome">',
    '让 Chrome 独占顶部水平区域边界',
  )

  /*
   * 侧边栏关闭时，侧边栏右边界宽度必须为 0。
   */
  content = replaceOneOf(
    content,
    [
      [
        '        style={{',
        '          gridColumn: 2,',
        "          pointerEvents: dockSidebar ? 'auto' : 'none',",
        '        }}',
      ].join('\n'),
    ],
    [
      '        style={{',
      '          borderRightWidth: dockSidebar ? 1 : 0,',
      '          gridColumn: 2,',
      "          pointerEvents: dockSidebar ? 'auto' : 'none',",
      '        }}',
    ].join('\n'),
    '让侧边栏边界跟随侧边栏显示状态',
  )

  /*
   * 修复 sidebar / canvas 双边框：
   * - sidebar 拥有右边界
   * - canvas 不再绘制左边界
   * - canvas 仅在 inspector 打开时绘制右边界
   */
  content = replaceOneOf(
    content,
    [
      [
        '      className="relative z-10 row-2 min-h-0 min-w-0 overflow-hidden border-l border-divider bg-background"',
        '      style={{ gridColumn: 3 }}',
      ].join('\n'),
    ],
    [
      '      className="relative z-10 row-2 min-h-0 min-w-0 overflow-hidden border-r border-divider bg-background"',
      '      style={{',
      '        borderRightWidth: dockInspector ? 1 : 0,',
      '        gridColumn: 3,',
      '      }}',
    ].join('\n'),
    '删除内容区重复左边界并统一检查器边界所有权',
  )

  /*
   * 宽屏 Inspector 不再重复绘制左边界。
   */
  content = replaceOneOf(
    content,
    [
      "? 'relative row-[2/-1] min-h-0 min-w-0 overflow-visible border-l border-divider'",
    ],
    "? 'relative row-[2/-1] min-h-0 min-w-0 overflow-visible'",
    '删除宽屏检查器重复左边界',
  )

  /*
   * 状态栏延续 canvas / inspector 的同一条垂直边界。
   */
  content = replaceOneOf(
    content,
    [
      [
        '      className="relative z-10 min-w-0 border-l border-divider bg-background"',
        '      style={{ gridColumn: 3, gridRow: 3 }}',
      ].join('\n'),
    ],
    [
      '      className="relative z-10 min-w-0 border-r border-divider bg-background"',
      '      style={{',
      '        borderRightWidth: dockInspector ? 1 : 0,',
      '        gridColumn: 3,',
      '        gridRow: 3,',
      '      }}',
    ].join('\n'),
    '删除状态栏重复左边界并延续检查器边界',
  )

  return content
}

function migrateWorkbenchTabs(source) {
  let content = source

  /*
   * 标签轮廓和内部 separator 使用统一 divider token。
   */
  content = replaceOneOf(
    content,
    [
      [
        '  --chrome-tab-boundary: color-mix(',
        '    in srgb,',
        '    var(--color-foreground) 15%,',
        '    var(--chrome-tab-surface) 85%',
        '  );',
        '',
        '  --chrome-tab-divider: color-mix(',
        '    in srgb,',
        '    var(--color-foreground) 18%,',
        '    var(--chrome-tab-strip) 82%',
        '  );',
      ].join('\n'),
    ],
    [
      '  --chrome-tab-boundary: var(--color-divider);',
      '  --chrome-tab-divider: var(--color-divider);',
    ].join('\n'),
    '统一标签轮廓和标签 separator 颜色',
  )

  /*
   * 顶部水平边界已由 header 独占，删除标签栏重复底线。
   */
  content = removeIfPresent(
    content,
    [
      '.chrome-workbench-tabs::after {',
      '  position: absolute;',
      '  z-index: 2;',
      '  right: 0;',
      '  bottom: 0;',
      '  left: 0;',
      '  height: 1px;',
      '  background: var(--chrome-tab-boundary);',
      '  content: "";',
      '  pointer-events: none;',
      '}',
      '',
    ].join('\n'),
  )

  return content
}

function replaceOneOf(source, oldTexts, newText, description) {
  if (source.includes(newText)) {
    return source
  }

  const matches = []

  for (const oldText of oldTexts) {
    const count = countOccurrences(source, oldText)

    if (count > 1) {
      fail(
        [
          `无法执行：${description}`,
          '某个旧代码片段出现了多次，无法安全替换。',
        ].join('\n'),
      )
    }

    if (count === 1) {
      matches.push(oldText)
    }
  }

  if (matches.length === 0) {
    fail(
      [
        `无法执行：${description}`,
        '没有找到预期的旧代码。',
        '相关文件可能已被进一步修改，请先检查当前源码。',
      ].join('\n'),
    )
  }

  if (matches.length > 1) {
    fail(
      [
        `无法执行：${description}`,
        '同时匹配到了多个旧版本片段，无法确定唯一替换目标。',
      ].join('\n'),
    )
  }

  return source.replace(matches[0], newText)
}

function removeIfPresent(source, text) {
  const count = countOccurrences(source, text)

  if (count === 0) {
    return source
  }

  if (count > 1) {
    fail(
      `待删除内容出现了 ${String(count)} 次，无法确定唯一修改位置。`,
    )
  }

  return source.replace(text, '')
}

function countOccurrences(source, target) {
  if (!target) {
    return 0
  }

  let count = 0
  let offset = 0

  while (true) {
    const index = source.indexOf(target, offset)

    if (index === -1) {
      return count
    }

    count += 1
    offset = index + target.length
  }
}

function formatCause(cause) {
  if (cause instanceof Error) {
    return cause.message
  }

  return String(cause)
}

function fail(message) {
  console.error('')
  console.error('重构失败：')
  console.error(message)
  process.exit(1)
}