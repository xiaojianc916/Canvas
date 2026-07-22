#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const APPLY = process.argv.includes('--apply')
const ROLLBACK = process.argv.includes('--rollback')
const ALLOW_DIRTY = process.argv.includes('--allow-dirty')

const BACKUP_DIR = path.join(ROOT, '.canvas-ui-refactor-backup')
const MANIFEST_FILE = path.join(BACKUP_DIR, 'manifest.json')

const FILES = {
  rootPackage: 'package.json',
  appCss: 'apps/desktop/src/app.css',
  designSystemPackage: 'foundations/design-system/package.json',
  designSystemPublicApi: 'foundations/design-system/src/public-api.ts',
  tokens: 'foundations/design-system/src/styles/index.css',
  themeController: 'foundations/design-system/src/theme-controller.ts',
  select: 'foundations/design-system/src/components/ui/select.tsx',
  feedback: 'foundations/design-system/src/components/ui/feedback.tsx',
  workspaceLayout:
    'features/workspace/src/presentation/shell/useWorkspaceLayout.ts',
  tldrawOverrides: 'apps/desktop/src/styles/tldraw-overrides.css',
  architectureCheck: 'tests/architecture/check-ui-architecture.mjs',
  canvasTabs:
    'features/workspace/src/presentation/shell/CanvasTabs.tsx',
  documentTabs:
    'features/workspace/src/presentation/shell/DocumentTabs.tsx',
  activityRail:
    'features/workspace/src/presentation/shell/ActivityRail.tsx',
}

function absolute(relativePath) {
  return path.join(ROOT, relativePath)
}

function read(relativePath) {
  const filePath = absolute(relativePath)

  if (!fs.existsSync(filePath)) {
    return null
  }

  return fs.readFileSync(filePath, 'utf8')
}

function write(relativePath, content) {
  const filePath = absolute(relativePath)

  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  })

  fs.writeFileSync(filePath, content, 'utf8')
}

function countOccurrences(content, search) {
  return content.split(search).length - 1
}

function replaceExactlyOnce(content, search, replacement, label) {
  const count = countOccurrences(content, search)

  if (count !== 1) {
    throw new Error(
      `${label}：预期匹配 1 次，实际匹配 ${count} 次。` +
        '仓库代码可能已变化，已停止执行。',
    )
  }

  return content.replace(search, replacement)
}

function assertRepository() {
  const packageFile = absolute(FILES.rootPackage)

  if (!fs.existsSync(packageFile)) {
    throw new Error('请在 Canvas 仓库根目录运行脚本。')
  }

  const packageJson = JSON.parse(
    fs.readFileSync(packageFile, 'utf8'),
  )

  const workspaceFile = absolute('pnpm-workspace.yaml')

  if (
    packageJson.name !== 'hybrid-canvas' ||
    !fs.existsSync(workspaceFile)
  ) {
    throw new Error(
      `当前目录不是目标 Canvas 仓库：${ROOT}`,
    )
  }

  if (ROLLBACK || ALLOW_DIRTY) {
    return
  }

  const status = execFileSync(
    'git',
    ['status', '--porcelain'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  ).trim()

  if (status.length > 0) {
    throw new Error(
      '当前 Git 工作区不干净。请先提交修改，' +
        '或确认风险后添加 --allow-dirty。',
    )
  }
}

const TOKENS_CSS = String.raw`@theme {
  --color-background: var(--ui-background);
  --color-foreground: var(--ui-foreground);
  --color-surface: var(--ui-surface);
  --color-chrome: var(--ui-chrome);
  --color-canvas: var(--ui-canvas);
  --color-sidebar: var(--ui-sidebar);
  --color-sidebar-accent: var(--ui-sidebar-accent);
  --color-sidebar-accent-foreground: var(--ui-sidebar-accent-foreground);
  --color-divider: var(--ui-divider);
  --color-border: var(--ui-border);
  --color-input: var(--ui-input);
  --color-ring: var(--ui-ring);
  --color-primary: var(--ui-primary);
  --color-primary-foreground: var(--ui-primary-foreground);
  --color-secondary: var(--ui-secondary);
  --color-secondary-foreground: var(--ui-secondary-foreground);
  --color-muted: var(--ui-muted);
  --color-muted-foreground: var(--ui-muted-foreground);
  --color-accent: var(--ui-accent);
  --color-accent-foreground: var(--ui-accent-foreground);
  --color-popover: var(--ui-popover);
  --color-popover-foreground: var(--ui-popover-foreground);
  --color-destructive: var(--ui-destructive);
  --color-destructive-foreground: var(--ui-destructive-foreground);
  --font-family-sans: var(--ui-font-sans);
}

:root {
  color-scheme: light;

  --ui-background: oklch(0.994 0.001 90);
  --ui-foreground: oklch(0.19 0.01 90);
  --ui-surface: oklch(1 0 0);
  --ui-chrome: oklch(0.962 0.002 90);
  --ui-canvas: oklch(0.985 0.001 90);

  --ui-sidebar: oklch(0.962 0.002 90);
  --ui-sidebar-accent: oklch(0.925 0.007 90);
  --ui-sidebar-accent-foreground: oklch(0.18 0.01 90);

  --ui-divider: oklch(0.885 0.004 90);
  --ui-border: var(--ui-divider);
  --ui-input: oklch(0.84 0.006 90);
  --ui-ring: oklch(0.55 0.19 255);

  --ui-primary: oklch(0.55 0.19 255);
  --ui-primary-foreground: oklch(0.99 0 0);

  --ui-secondary: oklch(0.945 0.005 90);
  --ui-secondary-foreground: oklch(0.22 0.01 90);

  --ui-muted: oklch(0.95 0.004 90);
  --ui-muted-foreground: oklch(0.47 0.012 90);

  --ui-accent: oklch(0.925 0.007 90);
  --ui-accent-foreground: oklch(0.2 0.01 90);

  --ui-popover: var(--ui-surface);
  --ui-popover-foreground: var(--ui-foreground);

  --ui-destructive: oklch(0.56 0.22 28);
  --ui-destructive-foreground: oklch(0.99 0 0);

  --ui-font-sans:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  --activity-rail-width: 48px;
  --workspace-sidebar-min: 220px;
  --workspace-sidebar-max: 420px;
  --workspace-sidebar-default: 280px;
  --inspector-width: 276px;
  --chrome-height: 36px;
  --status-height: 30px;

  --ui-z-canvas: 0;
  --ui-z-chrome: 20;
  --ui-z-popover: 60;
  --ui-z-dialog: 100;
  --ui-z-toast: 120;

  --ui-duration-fast: 120ms;
  --ui-duration-normal: 180ms;
  --ui-ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

:root[data-theme='dark'] {
  color-scheme: dark;

  --ui-background: #191919;
  --ui-foreground: #ffffff;
  --ui-surface: #202020;
  --ui-chrome: #242424;
  --ui-canvas: #1d1d1d;

  --ui-sidebar: #242424;
  --ui-sidebar-accent: #383836;
  --ui-sidebar-accent-foreground: #ffffff;

  --ui-divider: rgb(255 255 255 / 16%);
  --ui-border: var(--ui-divider);
  --ui-input: rgb(255 255 255 / 24%);
  --ui-ring: #5e9fe8;

  --ui-primary: #5e9fe8;
  --ui-primary-foreground: #111111;

  --ui-secondary: #30302f;
  --ui-secondary-foreground: #ffffff;

  --ui-muted: #30302f;
  --ui-muted-foreground: rgb(255 255 255 / 65%);

  --ui-accent: #383836;
  --ui-accent-foreground: #ffffff;

  --ui-popover: #242424;
  --ui-popover-foreground: #ffffff;

  --ui-destructive: #e97366;
  --ui-destructive-foreground: #111111;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`

const THEME_CONTROLLER = String.raw`export type ThemePreference =
  | 'light'
  | 'dark'
  | 'system'

const DARK_QUERY = '(prefers-color-scheme: dark)'

let removeSystemListener: (() => void) | undefined

export function applyThemePreference(
  theme: ThemePreference,
): void {
  removeSystemListener?.()
  removeSystemListener = undefined

  const root = document.documentElement

  const apply = (dark: boolean) => {
    root.dataset.theme = dark ? 'dark' : 'light'
  }

  if (theme === 'light' || theme === 'dark') {
    apply(theme === 'dark')
    return
  }

  const query = window.matchMedia(DARK_QUERY)
  const synchronize = () => apply(query.matches)

  query.addEventListener('change', synchronize)

  removeSystemListener = () => {
    query.removeEventListener('change', synchronize)
  }

  synchronize()
}
`

const SELECT_COMPONENT = String.raw`import {
  forwardRef,
  type SelectHTMLAttributes,
} from 'react'
import { cn } from '../../lib/utils'

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectProps
>(function Select(
  {
    className,
    ...props
  },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-input',
        'bg-background px-3 text-sm text-foreground',
        'shadow-sm outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
})
`

const FEEDBACK_COMPONENTS = String.raw`import {
  AlertCircle,
  Inbox,
  LoaderCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './button'

export function LoadingState({
  label = '正在加载…',
}: {
  readonly label?: string
}) {
  return (
    <div
      className="grid min-h-32 place-items-center text-sm text-muted-foreground"
      role="status"
    >
      <span className="flex items-center gap-2">
        <LoaderCircle
          aria-hidden="true"
          className="size-4 animate-spin"
        />
        {label}
      </span>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
}) {
  return (
    <section className="grid min-h-40 place-items-center px-6 text-center">
      <div>
        <Inbox
          aria-hidden="true"
          className="mx-auto size-5 text-muted-foreground"
        />

        <h3 className="mt-3 text-sm font-semibold">
          {title}
        </h3>

        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          {description}
        </p>

        {action ? (
          <div className="mt-4">
            {action}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ErrorState({
  title = '暂时无法完成操作',
  message,
  onRetry,
}: {
  readonly title?: string
  readonly message: string
  readonly onRetry?: () => void
}) {
  return (
    <section
      className="grid min-h-40 place-items-center px-6 text-center"
      role="alert"
    >
      <div>
        <AlertCircle
          aria-hidden="true"
          className="mx-auto size-5 text-destructive"
        />

        <h3 className="mt-3 text-sm font-semibold">
          {title}
        </h3>

        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          {message}
        </p>

        {onRetry ? (
          <Button
            className="mt-4"
            onClick={onRetry}
            size="sm"
            type="button"
            variant="outline"
          >
            重试
          </Button>
        ) : null}
      </div>
    </section>
  )
}
`

const WORKSPACE_LAYOUT = String.raw`import {
  useSyncExternalStore,
} from 'react'

export type WorkspaceLayoutMode =
  | 'wide'
  | 'compact'
  | 'narrow'

function getSnapshot(): WorkspaceLayoutMode {
  if (window.innerWidth >= 1280) {
    return 'wide'
  }

  if (window.innerWidth >= 900) {
    return 'compact'
  }

  return 'narrow'
}

function getServerSnapshot(): WorkspaceLayoutMode {
  return 'wide'
}

function subscribe(
  listener: () => void,
): () => void {
  window.addEventListener(
    'resize',
    listener,
    {
      passive: true,
    },
  )

  return () => {
    window.removeEventListener(
      'resize',
      listener,
    )
  }
}

export function useWorkspaceLayoutMode():
  WorkspaceLayoutMode {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
}
`

const TLDRAW_OVERRIDES = String.raw`/*
 * tldraw 5.2.5 UI override boundary.
 * Revalidate these selectors when upgrading tldraw.
 */

.tl-canvas,
.tl-background {
  background-color: var(--color-canvas);
}

.tlui-help-menu,
.tlui-menu-zone,
.tlui-navigation-zone,
.tlui-debug-panel {
  display: none;
}

.tlui-toolbar__tools {
  border-radius: 10px;
}

.tlui-page-menu {
  --tl-page-menu-y: auto;
}

[data-workbench-state='empty'] .tl-container {
  display: none;
}

.workspace-shell .tl-container,
.workspace-shell .tlui-layout {
  width: 100%;
  height: 100%;
}

.workspace-shell .tlui-layout {
  overflow: hidden;
}
`

const ARCHITECTURE_CHECK = String.raw`#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.canvas-ui-refactor-backup',
  'dist',
  'node_modules',
  'target',
])

function walk(directory) {
  return fs
    .readdirSync(directory, {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        return []
      }

      const filePath = path.join(
        directory,
        entry.name,
      )

      if (entry.isDirectory()) {
        return walk(filePath)
      }

      return entry.isFile()
        ? [filePath]
        : []
    })
}

const sourceFiles = walk(ROOT).filter(
  (filePath) =>
    filePath.endsWith('.tsx') ||
    filePath.endsWith('.css'),
)

const failures = []

for (const filePath of sourceFiles) {
  const relativePath =
    path.relative(ROOT, filePath)

  const content =
    fs.readFileSync(filePath, 'utf8')

  if (
    filePath.endsWith('.tsx') &&
    /<button\b[^>]*>[\s\S]*?<button\b/.test(content)
  ) {
    failures.push(
      relativePath +
        ': 可能存在嵌套 button',
    )
  }

  if (
    filePath.endsWith('.tsx') &&
    /\b(bg-white|text-black)\b/.test(content)
  ) {
    failures.push(
      relativePath +
        ': 使用硬编码主题颜色',
    )
  }

  if (
    filePath.endsWith('.tsx') &&
    /fixed\s+inset-0[\s\S]{0,300}role=["']dialog["']/.test(
      content,
    ) &&
    !relativePath.includes(
      'foundations' +
        path.sep +
        'design-system',
    )
  ) {
    failures.push(
      relativePath +
        ': Feature 自行实现 Dialog Overlay',
    )
  }
}

const tokenFile = path.join(
  ROOT,
  'foundations/design-system/src/styles/index.css',
)

if (!fs.existsSync(tokenFile)) {
  failures.push(
    '缺少 Design System Token 文件',
  )
} else {
  const tokenContent =
    fs.readFileSync(tokenFile, 'utf8')

  const requiredTokens = [
    '--ui-primary',
    '--ui-destructive',
    '--ui-ring',
    '--ui-z-dialog',
    'prefers-reduced-motion',
  ]

  for (const token of requiredTokens) {
    if (!tokenContent.includes(token)) {
      failures.push(
        '缺少 Design Token：' + token,
      )
    }
  }
}

if (failures.length > 0) {
  console.error(
    failures
      .map((failure) => '- ' + failure)
      .join('\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'UI architecture checks passed.',
  )
}
`

const GENERATED_FILES = new Map([
  [FILES.tokens, TOKENS_CSS],
  [FILES.themeController, THEME_CONTROLLER],
  [FILES.select, SELECT_COMPONENT],
  [FILES.feedback, FEEDBACK_COMPONENTS],
  [FILES.workspaceLayout, WORKSPACE_LAYOUT],
  [FILES.tldrawOverrides, TLDRAW_OVERRIDES],
  [FILES.architectureCheck, ARCHITECTURE_CHECK],
])

function transformAppCss(content) {
  const designSystemImport =
    '@import "@hybrid-canvas/design-system/styles.css";'

  const overrideImport =
    '@import "./styles/tldraw-overrides.css";'

  let next = content

  if (!next.includes(designSystemImport)) {
    const tldrawImport =
      '@import "tldraw/tldraw.css";'

    if (!next.includes(tldrawImport)) {
      throw new Error(
        'app.css 中没有找到 tldraw CSS import。',
      )
    }

    next = next.replace(
      tldrawImport,
      [
        tldrawImport,
        designSystemImport,
      ].join('\n'),
    )
  }

  if (!next.includes(overrideImport)) {
    const tailwindImportPattern =
      /@import\s+"tailwindcss"[^;]*;/

    const match = next.match(
      tailwindImportPattern,
    )

    if (!match) {
      throw new Error(
        'app.css 中没有找到 Tailwind CSS import。',
      )
    }

    next = next.replace(
      match[0],
      [
        match[0],
        overrideImport,
      ].join('\n'),
    )
  }

  return next
}

function transformDesignSystemPackage(content) {
  const packageJson = JSON.parse(content)

  packageJson.exports ??= {}

  packageJson.exports['./styles.css'] =
    './src/styles/index.css'

  return (
    JSON.stringify(
      packageJson,
      null,
      2,
    ) + '\n'
  )
}

function transformRootPackage(content) {
  const packageJson = JSON.parse(content)

  packageJson.scripts ??= {}

  const checkCommand =
    'node tests/architecture/check-ui-architecture.mjs'

  const existing =
    packageJson.scripts['test:architecture']

  if (!existing) {
    packageJson.scripts['test:architecture'] =
      checkCommand
  } else if (!existing.includes(checkCommand)) {
    packageJson.scripts['test:architecture'] =
      `${existing} && ${checkCommand}`
  }

  return (
    JSON.stringify(
      packageJson,
      null,
      2,
    ) + '\n'
  )
}

function transformDesignSystemPublicApi(content) {
  const exportsToAdd = [
    "export { Select, type SelectProps } from './components/ui/select'",
    "export { EmptyState, ErrorState, LoadingState } from './components/ui/feedback'",
    "export { applyThemePreference, type ThemePreference } from './theme-controller'",
  ]

  let next = content.trimEnd()

  for (const exportLine of exportsToAdd) {
    if (!next.includes(exportLine)) {
      next += `\n${exportLine}`
    }
  }

  return `${next}\n`
}

function transformTabs(content, label) {
  let next = content

  const buttonMap =
    'useRef(new Map<CanvasSessionId, HTMLButtonElement>())'

  if (next.includes(buttonMap)) {
    next = replaceExactlyOnce(
      next,
      buttonMap,
      'useRef(new Map<CanvasSessionId, HTMLDivElement>())',
      `${label} tab refs`,
    )
  }

  const forwardRefDeclaration =
    'const DocumentTab = forwardRef<HTMLButtonElement, DocumentTabProps>'

  if (next.includes(forwardRefDeclaration)) {
    next = replaceExactlyOnce(
      next,
      forwardRefDeclaration,
      'const DocumentTab = forwardRef<HTMLDivElement, DocumentTabProps>',
      `${label} forwardRef`,
    )
  }

  const openingButton = [
    '    <button',
    '      ref={ref}',
    '      aria-selected={model.isActive}',
  ].join('\n')

  const openingDiv = [
    '    <div',
    '      ref={ref}',
    '      aria-selected={model.isActive}',
  ].join('\n')

  if (next.includes(openingButton)) {
    next = replaceExactlyOnce(
      next,
      openingButton,
      openingDiv,
      `${label} outer tab element`,
    )
  }

  const clickAndRole = [
    '      onClick={() => onActivate(model.sessionId)}',
    '      role="tab"',
  ].join('\n')

  const keyboardActivation = [
    '      onClick={() => onActivate(model.sessionId)}',
    '      onKeyDown={(event) => {',
    "        if (event.key === 'Enter' || event.key === ' ') {",
    '          event.preventDefault()',
    '          onActivate(model.sessionId)',
    '        }',
    '      }}',
    '      role="tab"',
  ].join('\n')

  if (next.includes(clickAndRole)) {
    next = replaceExactlyOnce(
      next,
      clickAndRole,
      keyboardActivation,
      `${label} keyboard activation`,
    )
  }

  const divTypeAttribute = [
    '      type="button"',
    '    >',
    '      <DocumentIcon />',
  ].join('\n')

  const divWithoutType = [
    '    >',
    '      <DocumentIcon />',
  ].join('\n')

  if (next.includes(divTypeAttribute)) {
    next = replaceExactlyOnce(
      next,
      divTypeAttribute,
      divWithoutType,
      `${label} invalid div type attribute`,
    )
  }

  const closingButton = [
    '      ) : null}',
    '    </button>',
    '  )',
    '})',
  ].join('\n')

  const closingDiv = [
    '      ) : null}',
    '    </div>',
    '  )',
    '})',
  ].join('\n')

  if (next.includes(closingButton)) {
    next = replaceExactlyOnce(
      next,
      closingButton,
      closingDiv,
      `${label} outer closing element`,
    )
  }

  return next
}

function transformActivityRail(content) {
  return content
    .replaceAll('bg-white', 'bg-popover')
    .replaceAll('text-black', 'text-foreground')
    .replaceAll(
      'border-black/5',
      'border-divider',
    )
}

const TRANSFORMS = new Map([
  [FILES.appCss, transformAppCss],
  [
    FILES.designSystemPackage,
    transformDesignSystemPackage,
  ],
  [
    FILES.designSystemPublicApi,
    transformDesignSystemPublicApi,
  ],
  [
    FILES.rootPackage,
    transformRootPackage,
  ],
  [
    FILES.canvasTabs,
    (content) =>
      transformTabs(content, 'CanvasTabs'),
  ],
  [
    FILES.documentTabs,
    (content) =>
      transformTabs(content, 'DocumentTabs'),
  ],
  [
    FILES.activityRail,
    transformActivityRail,
  ],
])

function buildChanges() {
  const changes = []

  for (
    const [
      relativePath,
      nextContent,
    ] of GENERATED_FILES
  ) {
    const originalContent =
      read(relativePath)

    if (originalContent !== nextContent) {
      changes.push({
        relativePath,
        originalContent,
        nextContent,
      })
    }
  }

  for (
    const [
      relativePath,
      transform,
    ] of TRANSFORMS
  ) {
    const originalContent =
      read(relativePath)

    if (originalContent === null) {
      throw new Error(
        `缺少目标文件：${relativePath}`,
      )
    }

    const nextContent =
      transform(originalContent)

    if (originalContent !== nextContent) {
      changes.push({
        relativePath,
        originalContent,
        nextContent,
      })
    }
  }

  return changes
}

function backupChange(change) {
  const backupFile = path.join(
    BACKUP_DIR,
    change.relativePath,
  )

  fs.mkdirSync(
    path.dirname(backupFile),
    {
      recursive: true,
    },
  )

  if (change.originalContent === null) {
    fs.writeFileSync(
      `${backupFile}.missing`,
      '',
      'utf8',
    )

    return
  }

  fs.writeFileSync(
    backupFile,
    change.originalContent,
    'utf8',
  )
}

function applyChanges(changes) {
  if (fs.existsSync(BACKUP_DIR)) {
    throw new Error(
      '备份目录已经存在。请先执行 --rollback，' +
        '或手动检查 .canvas-ui-refactor-backup。',
    )
  }

  fs.mkdirSync(BACKUP_DIR, {
    recursive: true,
  })

  for (const change of changes) {
    backupChange(change)

    write(
      change.relativePath,
      change.nextContent,
    )
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    files: changes.map(
      (change) => change.relativePath,
    ),
  }

  fs.writeFileSync(
    MANIFEST_FILE,
    JSON.stringify(
      manifest,
      null,
      2,
    ),
    'utf8',
  )
}

function rollbackChanges() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    throw new Error(
      '没有找到回滚清单：' +
        MANIFEST_FILE,
    )
  }

  const manifest = JSON.parse(
    fs.readFileSync(
      MANIFEST_FILE,
      'utf8',
    ),
  )

  for (const relativePath of manifest.files) {
    const backupFile = path.join(
      BACKUP_DIR,
      relativePath,
    )

    const missingMarker =
      `${backupFile}.missing`

    if (fs.existsSync(missingMarker)) {
      fs.rmSync(
        absolute(relativePath),
        {
          force: true,
          recursive: true,
        },
      )

      continue
    }

    if (!fs.existsSync(backupFile)) {
      throw new Error(
        `备份文件缺失：${relativePath}`,
      )
    }

    const destination =
      absolute(relativePath)

    fs.mkdirSync(
      path.dirname(destination),
      {
        recursive: true,
      },
    )

    fs.copyFileSync(
      backupFile,
      destination,
    )
  }

  fs.rmSync(
    BACKUP_DIR,
    {
      force: true,
      recursive: true,
    },
  )

  console.log('已回滚 UI 重构。')
}

function printPlan(changes) {
  console.log(
    `将修改 ${changes.length} 个文件：`,
  )

  for (const change of changes) {
    const operation =
      change.originalContent === null
        ? '创建'
        : '修改'

    console.log(
      `- [${operation}] ${change.relativePath}`,
    )
  }
}

function main() {
  assertRepository()

  if (ROLLBACK) {
    rollbackChanges()
    return
  }

  const changes = buildChanges()

  if (changes.length === 0) {
    console.log('没有需要应用的修改。')
    return
  }

  printPlan(changes)

  if (!APPLY) {
    console.log('')
    console.log('当前为预检模式，未写入文件。')
    console.log(
      '应用修改：node tooling/script/recover-refactor-scripts.mjs --apply',
    )
    return
  }

  applyChanges(changes)

  console.log('')
  console.log('UI 重构已应用。')
  console.log('')
  console.log('请继续执行：')
  console.log('pnpm format')
  console.log('pnpm lint')
  console.log('pnpm typecheck')
  console.log('pnpm test:architecture')
  console.log('pnpm test')
  console.log('pnpm build:desktop')
  console.log('')
  console.log('需要回滚时执行：')
  console.log(
    'node tooling/script/recover-refactor-scripts.mjs --rollback --allow-dirty',
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