#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const write = process.argv.includes('--write')
const rollback = process.argv.includes('--rollback')
const backupRoot = path.join(root, '.ui-refactor-backup')
const manifestPath = path.join(backupRoot, 'manifest.json')

const files = {
  appCss: 'apps/desktop/src/app.css',
  canvasTabs:
    'features/workspace/src/presentation/shell/CanvasTabs.tsx',
  documentTabs:
    'features/workspace/src/presentation/shell/DocumentTabs.tsx',
  activityRail:
    'features/workspace/src/presentation/shell/ActivityRail.tsx',
}

function absolute(relativePath) {
  return path.join(root, relativePath)
}

function assertRepository() {
  const packagePath = absolute('package.json')

  if (!fs.existsSync(packagePath)) {
    throw new Error(
      '未找到 package.json。请在 Canvas 仓库根目录执行脚本。',
    )
  }

  const packageJson = JSON.parse(
    fs.readFileSync(packagePath, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `当前仓库不是预期的 hybrid-canvas：${packageJson.name}`,
    )
  }

  for (const relativePath of Object.values(files)) {
    if (!fs.existsSync(absolute(relativePath))) {
      throw new Error(`缺少目标文件：${relativePath}`)
    }
  }
}

function backup(relativePath, content) {
  const destination = path.join(backupRoot, relativePath)

  fs.mkdirSync(path.dirname(destination), {
    recursive: true,
  })

  fs.writeFileSync(destination, content, 'utf8')
}

function replaceExactly(
  content,
  search,
  replacement,
  label,
) {
  const occurrences = content.split(search).length - 1

  if (occurrences !== 1) {
    throw new Error(
      `${label}：预期匹配 1 次，实际匹配 ${occurrences} 次。` +
        ' 文件可能已经变化，请人工检查后更新脚本。',
    )
  }

  return content.replace(search, replacement)
}

function refactorTabs(content, relativePath) {
  let next = content

  next = replaceExactly(
    next,
    'useRef(new Map<CanvasSessionId, HTMLButtonElement>())',
    'useRef(new Map<CanvasSessionId, HTMLDivElement>())',
    `${relativePath} tab ref 类型`,
  )

  next = replaceExactly(
    next,
    'const DocumentTab = forwardRef<HTMLButtonElement, DocumentTabProps>',
    'const DocumentTab = forwardRef<HTMLDivElement, DocumentTabProps>',
    `${relativePath} forwardRef 类型`,
  )

  next = replaceExactly(
    next,
    `    <button
      ref={ref}
      aria-selected={model.isActive}`,
    `    <div
      ref={ref}
      aria-selected={model.isActive}`,
    `${relativePath} 外层 tab 元素`,
  )

  next = replaceExactly(
    next,
    `      onClick={() => onActivate(model.sessionId)}
      role="tab"`,
    `      onClick={() => onActivate(model.sessionId)}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault()
          onActivate(model.sessionId)
        }
      }}
      role="tab"`,
    `${relativePath} 键盘激活行为`,
  )

  next = replaceExactly(
    next,
    `      type="button"
    >
      <DocumentIcon />`,
    `    >
      <DocumentIcon />`,
    `${relativePath} 移除 div 上的 button type`,
  )

  next = replaceExactly(
    next,
    `      ) : null}
    </button>
  )
})`,
    `      ) : null}
    </div>
  )
})`,
    `${relativePath} 关闭外层 tab`,
  )

  return next
}

const tokenBaseline = String.raw`

/*
 * UI architecture baseline.
 * Keep semantic product colors here until they are moved into
 * foundations/design-system/src/styles/tokens.css.
 */
:root {
  --ui-color-primary: oklch(0.55 0.2 255);
  --ui-color-primary-foreground: oklch(0.99 0 0);
  --ui-color-secondary: oklch(0.95 0.005 90);
  --ui-color-secondary-foreground: oklch(0.22 0.01 90);
  --ui-color-muted: oklch(0.955 0.004 90);
  --ui-color-muted-foreground: oklch(0.48 0.012 90);
  --ui-color-accent: oklch(0.93 0.008 90);
  --ui-color-accent-foreground: oklch(0.2 0.01 90);
  --ui-color-input: oklch(0.86 0.006 90);
  --ui-color-ring: oklch(0.55 0.2 255);
  --ui-color-destructive: oklch(0.56 0.22 28);
  --ui-color-destructive-foreground: oklch(0.99 0 0);

  --ui-z-canvas: 0;
  --ui-z-chrome: 20;
  --ui-z-popover: 60;
  --ui-z-dialog: 100;
  --ui-z-toast: 120;

  --ui-duration-fast: 120ms;
  --ui-duration-normal: 180ms;
  --ui-ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

@theme {
  --color-primary: var(--ui-color-primary);
  --color-primary-foreground:
    var(--ui-color-primary-foreground);
  --color-secondary: var(--ui-color-secondary);
  --color-secondary-foreground:
    var(--ui-color-secondary-foreground);
  --color-muted: var(--ui-color-muted);
  --color-muted-foreground:
    var(--ui-color-muted-foreground);
  --color-accent: var(--ui-color-accent);
  --color-accent-foreground:
    var(--ui-color-accent-foreground);
  --color-input: var(--ui-color-input);
  --color-ring: var(--ui-color-ring);
  --color-destructive: var(--ui-color-destructive);
  --color-destructive-foreground:
    var(--ui-color-destructive-foreground);
}

@media (prefers-reduced-motion: reduce) {
  :where(
    button,
    input,
    select,
    [role="dialog"],
    [role="menu"],
    [role="tab"]
  ) {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`

function refactorAppCss(content) {
  if (
    content.includes(
      'UI architecture baseline.',
    )
  ) {
    return content
  }

  return `${content.trimEnd()}${tokenBaseline}\n`
}

function refactorActivityRail(content) {
  let next = content

  next = replaceExactly(
    next,
    `    <div className="absolute bottom-0 left-10 z-50 w-60 rounded-2xl border border-black/5 bg-white p-3 text-foreground shadow-2xl shadow-black/15">`,
    `    <div
      aria-label="帮助"
      className="absolute bottom-0 left-10 z-50 w-60 rounded-xl border border-divider bg-background p-2 text-foreground shadow-2xl"
      role="menu"
    >`,
    'ActivityRail HelpMenu 容器',
  )

  next = replaceExactly(
    next,
    `            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-xl leading-none hover:bg-sidebar-accent"`,
    `            className="flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm leading-5 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"`,
    'ActivityRail HelpMenu item 样式',
  )

  next = replaceExactly(
    next,
    `            key={label}
            type="button"`,
    `            key={label}
            role="menuitem"
            type="button"`,
    'ActivityRail HelpMenu item 语义',
  )

  next = next.replaceAll(
    'stroke-[2.2] text-black',
    'stroke-[2.2] text-foreground',
  )

  return next
}

function createChanges() {
  const transforms = new Map([
    [
      files.appCss,
      refactorAppCss,
    ],
    [
      files.canvasTabs,
      (content) =>
        refactorTabs(content, files.canvasTabs),
    ],
    [
      files.documentTabs,
      (content) =>
        refactorTabs(content, files.documentTabs),
    ],
    [
      files.activityRail,
      refactorActivityRail,
    ],
  ])

  const changes = []

  for (const [relativePath, transform] of transforms) {
    const source = fs.readFileSync(
      absolute(relativePath),
      'utf8',
    )

    const result = transform(source)

    if (source !== result) {
      changes.push({
        relativePath,
        source,
        result,
      })
    }
  }

  return changes
}

function applyChanges(changes) {
  if (fs.existsSync(backupRoot)) {
    throw new Error(
      `${backupRoot} 已存在。请先执行 --rollback，` +
        '或确认后手动删除备份目录。',
    )
  }

  fs.mkdirSync(backupRoot, {
    recursive: true,
  })

  for (const change of changes) {
    backup(change.relativePath, change.source)

    fs.writeFileSync(
      absolute(change.relativePath),
      change.result,
      'utf8',
    )
  }

  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        files: changes.map(
          ({ relativePath }) => relativePath,
        ),
      },
      null,
      2,
    ),
    'utf8',
  )
}

function rollbackChanges() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      '没有找到可回滚的 .ui-refactor-backup/manifest.json',
    )
  }

  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  )

  for (const relativePath of manifest.files) {
    const backupPath = path.join(
      backupRoot,
      relativePath,
    )

    if (!fs.existsSync(backupPath)) {
      throw new Error(
        `备份文件缺失：${backupPath}`,
      )
    }

    fs.copyFileSync(
      backupPath,
      absolute(relativePath),
    )

    console.log(`已恢复 ${relativePath}`)
  }

  fs.rmSync(backupRoot, {
    recursive: true,
    force: true,
  })

  console.log('UI baseline 重构已回滚。')
}

function main() {
  assertRepository()

  if (rollback) {
    rollbackChanges()
    return
  }

  const changes = createChanges()

  if (changes.length === 0) {
    console.log('没有需要修改的文件。')
    return
  }

  console.log('计划修改：')

  for (const change of changes) {
    console.log(`- ${change.relativePath}`)
  }

  if (!write) {
    console.log('')
    console.log(
      '当前为 dry-run，未写入文件。',
    )
    console.log(
      '确认后执行：node tooling/refactor-ui-baseline.mjs --write',
    )
    return
  }

  applyChanges(changes)

  console.log('')
  console.log('修改完成。建议执行：')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log('  pnpm build:desktop')
  console.log('')
  console.log('如需回滚：')
  console.log(
    '  node tooling/refactor-ui-baseline.mjs --rollback',
  )
}

try {
  main()
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  )
  process.exitCode = 1
}