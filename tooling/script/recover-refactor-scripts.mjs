#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const APPLY =
  process.argv.includes('--apply')
const ALLOW_DIRTY =
  process.argv.includes('--allow-dirty')

const FILES = {
  feedback:
    'apps/desktop/src/presentation/ui/ui-feedback.tsx',

  appShell:
    'apps/desktop/src/presentation/AppShell.tsx',

  workspaceContainer:
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',

  errorBoundary:
    'apps/desktop/src/bootstrap/ApplicationErrorBoundary.tsx',
}

const FEEDBACK_SOURCE = String.raw`import {
  error as reportError,
} from '@hybrid-canvas/foundations-observability'
import {
  AlertCircle,
  X,
} from 'lucide-react'
import {
  useEffect,
  useState,
} from 'react'

const EVENT_NAME =
  'hybrid-canvas:ui-feedback'

const USER_MESSAGES:
  Readonly<Record<string, string>> = {
    'canvas save failed':
      '画布保存失败，请重试。',

    'canvas open failed':
      '无法打开画布，请检查文件后重试。',

    'canvas close request failed':
      '无法关闭画布，请重试。',

    'discard and close canvas failed':
      '无法放弃更改并关闭画布。',

    'main window minimize failed':
      '窗口最小化失败。',

    'main window maximize failed':
      '窗口最大化或还原失败。',

    'main window drag failed':
      '窗口拖动暂时不可用。',

    'settings load failed':
      '设置读取失败。',
  }

interface UiNotice {
  readonly id: number
  readonly message: string
}

interface UiFeedbackEventDetail {
  readonly id: number
  readonly message: string
}

let nextNoticeId = 1

export function reportUiError(
  message: string,
  context: Record<string, unknown>,
): void {
  reportError(
    message,
    context,
  )

  if (typeof window === 'undefined') {
    return
  }

  const detail:
    UiFeedbackEventDetail = {
      id: nextNoticeId,

      message:
        USER_MESSAGES[message] ??
        '操作失败，请重试。',
    }

  nextNoticeId += 1

  window.dispatchEvent(
    new CustomEvent(
      EVENT_NAME,
      {
        detail,
      },
    ),
  )
}

export function UiFeedbackRegion() {
  const [
    notices,
    setNotices,
  ] = useState<
    readonly UiNotice[]
  >([])

  useEffect(() => {
    const timers =
      new Set<number>()

    const handleFeedback = (
      event: Event,
    ) => {
      const notice = (
        event as CustomEvent<
          UiFeedbackEventDetail
        >
      ).detail

      setNotices(
        (current) => [
          ...current.filter(
            (item) =>
              item.message !==
              notice.message,
          ),
          notice,
        ].slice(-3),
      )

      const timer =
        window.setTimeout(
          () => {
            setNotices(
              (current) =>
                current.filter(
                  (item) =>
                    item.id !==
                    notice.id,
                ),
            )

            timers.delete(timer)
          },
          5500,
        )

      timers.add(timer)
    }

    window.addEventListener(
      EVENT_NAME,
      handleFeedback,
    )

    return () => {
      window.removeEventListener(
        EVENT_NAME,
        handleFeedback,
      )

      for (
        const timer of timers
      ) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  const dismiss = (
    id: number,
  ) => {
    setNotices((current) =>
      current.filter(
        (item) =>
          item.id !== id,
      ),
    )
  }

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className={[
        'pointer-events-none',
        'fixed bottom-4 right-4',
        'z-[var(--ui-z-toast)]',
        'grid gap-2',
        'w-[min(380px,calc(100vw-32px))]',
      ].join(' ')}
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={[
            'pointer-events-auto',
            'flex items-start gap-3',
            'rounded-lg border',
            'border-destructive/30',
            'bg-background p-3',
            'text-sm shadow-xl',
          ].join(' ')}
          role="alert"
        >
          <AlertCircle
            aria-hidden="true"
            className={[
              'mt-0.5 size-4',
              'shrink-0',
              'text-destructive',
            ].join(' ')}
          />

          <span
            className={[
              'min-w-0 flex-1',
              'leading-5',
            ].join(' ')}
          >
            {notice.message}
          </span>

          <button
            aria-label="关闭提示"
            className={[
              'grid size-7',
              'place-items-center',
              'rounded-md',
              'text-muted-foreground',
              'hover:bg-accent',
              'focus-visible:outline-none',
              'focus-visible:ring-2',
              'focus-visible:ring-ring',
            ].join(' ')}
            onClick={() => {
              dismiss(notice.id)
            }}
            type="button"
          >
            <X
              aria-hidden="true"
              className="size-3.5"
            />
          </button>
        </div>
      ))}
    </div>
  )
}
`

function absolute(relativePath) {
  return path.join(
    ROOT,
    relativePath,
  )
}

function read(relativePath) {
  const filePath =
    absolute(relativePath)

  if (!fs.existsSync(filePath)) {
    return null
  }

  return fs.readFileSync(
    filePath,
    'utf8',
  )
}

function assertRepository() {
  const packageFile =
    absolute('package.json')

  if (!fs.existsSync(packageFile)) {
    throw new Error(
      '请在 Canvas 仓库根目录运行脚本。',
    )
  }

  const packageJson = JSON.parse(
    fs.readFileSync(
      packageFile,
      'utf8',
    ),
  )

  if (
    packageJson.name !==
    'hybrid-canvas'
  ) {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库。',
    )
  }

  const requiredFiles = [
    FILES.appShell,
    FILES.workspaceContainer,
    FILES.errorBoundary,
  ]

  for (
    const relativePath of
      requiredFiles
  ) {
    if (
      !fs.existsSync(
        absolute(relativePath),
      )
    ) {
      throw new Error(
        '缺少目标文件：' +
          relativePath,
      )
    }
  }

  if (ALLOW_DIRTY) {
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
      'Git 工作区不干净。' +
        '请先提交，或显式使用 --allow-dirty。',
    )
  }
}

function replaceOnce(
  content,
  search,
  replacement,
  label,
) {
  const count =
    content.split(search).length - 1

  if (count !== 1) {
    throw new Error(
      label +
        '：预期匹配 1 次，实际匹配 ' +
        count +
        ' 次。',
    )
  }

  return content.replace(
    search,
    replacement,
  )
}

function transformAppShell(content) {
  let next = content

  const oldImport =
    "import { error as reportError } from '@hybrid-canvas/foundations-observability'"

  const newImport =
    "import { reportUiError as reportError, UiFeedbackRegion } from './ui/ui-feedback'"

  if (next.includes(oldImport)) {
    next = replaceOnce(
      next,
      oldImport,
      newImport,
      'AppShell 错误导入',
    )
  } else if (
    !next.includes(newImport)
  ) {
    throw new Error(
      'AppShell 中没有找到预期的错误导入。',
    )
  }

  if (
    !next.includes(
      '<UiFeedbackRegion />',
    )
  ) {
    const anchor =
      '      <ConfirmationDialog'

    next = replaceOnce(
      next,
      anchor,
      [
        '      <UiFeedbackRegion />',
        '',
        anchor,
      ].join('\n'),
      'AppShell Feedback Region',
    )
  }

  return next
}

function transformWorkspaceContainer(
  content,
) {
  const oldImport =
    "import { error as reportError } from '@hybrid-canvas/foundations-observability'"

  const newImport =
    "import { reportUiError as reportError } from '../ui/ui-feedback'"

  if (content.includes(oldImport)) {
    return replaceOnce(
      content,
      oldImport,
      newImport,
      'WorkspaceContainer 错误导入',
    )
  }

  if (content.includes(newImport)) {
    return content
  }

  throw new Error(
    'WorkspaceContainer 中没有找到预期的错误导入。',
  )
}

function transformErrorBoundary(
  content,
) {
  if (
    content.includes('<summary') &&
    content.includes('技术详情')
  ) {
    return content
  }

  const oldBlock = [
    '<pre className="mt-4 max-h-36 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5 text-muted-foreground">',
    '            {error.message}',
    '          </pre>',
  ].join('\n')

  const newBlock = [
    '<details className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">',
    '            <summary className="cursor-pointer font-medium">技术详情</summary>',
    '            <pre className="mt-2 max-h-32 overflow-auto text-[11px] leading-5">{error.message}</pre>',
    '          </details>',
  ].join('\n')

  return replaceOnce(
    content,
    oldBlock,
    newBlock,
    'ApplicationErrorBoundary 技术详情',
  )
}

function buildChanges() {
  const changes = []

  const feedbackCurrent =
    read(FILES.feedback)

  if (
    feedbackCurrent !==
    FEEDBACK_SOURCE
  ) {
    changes.push({
      relativePath:
        FILES.feedback,

      currentContent:
        feedbackCurrent,

      nextContent:
        FEEDBACK_SOURCE,
    })
  }

  const transforms = [
    [
      FILES.appShell,
      transformAppShell,
    ],
    [
      FILES.workspaceContainer,
      transformWorkspaceContainer,
    ],
    [
      FILES.errorBoundary,
      transformErrorBoundary,
    ],
  ]

  for (
    const [
      relativePath,
      transform,
    ] of transforms
  ) {
    const currentContent =
      read(relativePath)

    if (currentContent === null) {
      throw new Error(
        '缺少目标文件：' +
          relativePath,
      )
    }

    const nextContent =
      transform(currentContent)

    if (
      currentContent !==
      nextContent
    ) {
      changes.push({
        relativePath,
        currentContent,
        nextContent,
      })
    }
  }

  return changes
}

function applyChanges(changes) {
  for (const change of changes) {
    const filePath =
      absolute(
        change.relativePath,
      )

    fs.mkdirSync(
      path.dirname(filePath),
      {
        recursive: true,
      },
    )

    fs.writeFileSync(
      filePath,
      change.nextContent,
      'utf8',
    )
  }

  execFileSync(
    'git',
    ['diff', '--check'],
    {
      cwd: ROOT,
      stdio: 'inherit',
    },
  )
}

function printPlan(changes) {
  console.log(
    'Phase 5A 将修改 ' +
      changes.length +
      ' 个文件：',
  )

  for (const change of changes) {
    console.log(
      '- ' + change.relativePath,
    )
  }
}

function main() {
  assertRepository()

  const changes =
    buildChanges()

  if (changes.length === 0) {
    console.log(
      'Phase 5A 没有需要应用的修改。',
    )

    return
  }

  printPlan(changes)

  if (!APPLY) {
    console.log('')
    console.log(
      '当前为预检模式，没有写入文件。',
    )

    console.log(
      '应用命令：',
    )

    console.log(
      'node tooling/script/refactor-ui-phase-5a.mjs --apply',
    )

    return
  }

  applyChanges(changes)

  console.log('')
  console.log(
    'Phase 5A 用户可见错误反馈已写入。',
  )

  console.log('')
  console.log('请执行：')
  console.log('pnpm format')
  console.log('pnpm lint')
  console.log('pnpm typecheck')
  console.log('pnpm test:architecture')
  console.log('pnpm test')
  console.log('pnpm build:desktop')

  console.log('')
  console.log(
    '放弃本阶段修改：',
  )

  console.log(
    'git restore -- ' +
      changes
        .map(
          (change) =>
            change.relativePath,
        )
        .join(' '),
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