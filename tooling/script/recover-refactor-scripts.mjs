#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const APPLY = process.argv.includes('--apply')
const ROLLBACK = process.argv.includes('--rollback')
const ALLOW_DIRTY = process.argv.includes('--allow-dirty')

const BACKUP_DIRECTORY = path.join(
  ROOT,
  '.canvas-ui-phase-2a-backup',
)

const MANIFEST_FILE = path.join(
  BACKUP_DIRECTORY,
  'manifest.json',
)

const FILES = {
  rootPackage: 'package.json',

  publicApi:
    'foundations/design-system/src/public-api.ts',

  dialog:
    'foundations/design-system/src/components/ui/dialog.tsx',

  field:
    'foundations/design-system/src/components/ui/field.tsx',

  confirmationDialog:
    'foundations/design-system/src/components/ui/confirmation-dialog.tsx',

  architectureCheck:
    'tests/architecture/check-ui-dialogs.mjs',
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

function assertRepository() {
  const packageFile = absolute(
    FILES.rootPackage,
  )

  if (!fs.existsSync(packageFile)) {
    throw new Error(
      '请在 Canvas 仓库根目录运行脚本。',
    )
  }

  const packageJson = JSON.parse(
    fs.readFileSync(packageFile, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `当前目录不是目标仓库：${packageJson.name}`,
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
      '当前 Git 工作区存在未提交修改。' +
        '请先提交，或使用 --allow-dirty。',
    )
  }
}

const DIALOG_COMPONENT = String.raw`import { X } from 'lucide-react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { Button } from './button'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface DialogProps {
  readonly open: boolean
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly className?: string
  readonly contentClassName?: string
  readonly busy?: boolean
  readonly closeLabel?: string
  readonly closeOnOverlayClick?: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  busy = false,
  closeLabel = '关闭',
  closeOnOverlayClick = true,
  onOpenChange,
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()

  const panelRef =
    useRef<HTMLDivElement>(null)

  const closeButtonRef =
    useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const previouslyFocused =
      document.activeElement

    const animationFrame =
      window.requestAnimationFrame(() => {
        closeButtonRef.current?.focus()
      })

    const handleDocumentKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !busy
      ) {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    document.addEventListener(
      'keydown',
      handleDocumentKeyDown,
    )

    return () => {
      window.cancelAnimationFrame(
        animationFrame,
      )

      document.removeEventListener(
        'keydown',
        handleDocumentKeyDown,
      )

      if (
        previouslyFocused instanceof
        HTMLElement
      ) {
        previouslyFocused.focus()
      }
    }
  }, [
    busy,
    onOpenChange,
    open,
  ])

  if (!open) {
    return null
  }

  const handlePanelKeyDown = (
    event:
      ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'Tab') {
      return
    }

    const focusableElements =
      Array.from(
        panelRef.current
          ?.querySelectorAll<HTMLElement>(
            FOCUSABLE_SELECTOR,
          ) ?? [],
      )

    const firstElement =
      focusableElements[0]

    const lastElement =
      focusableElements[
        focusableElements.length - 1
      ]

    if (!firstElement || !lastElement) {
      event.preventDefault()
      panelRef.current?.focus()
      return
    }

    if (
      event.shiftKey &&
      document.activeElement ===
        firstElement
    ) {
      event.preventDefault()
      lastElement.focus()
      return
    }

    if (
      !event.shiftKey &&
      document.activeElement ===
        lastElement
    ) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0',
        'z-[var(--ui-z-dialog)]',
        'grid place-items-center',
        'bg-black/40 p-4',
        'backdrop-blur-[2px]',
      )}
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          closeOnOverlayClick &&
          !busy
        ) {
          onOpenChange(false)
        }
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        aria-busy={
          busy || undefined
        }
        aria-describedby={
          description
            ? descriptionId
            : undefined
        }
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          'flex w-full max-w-lg',
          'max-h-[calc(100dvh-2rem)]',
          'flex-col overflow-hidden',
          'rounded-xl border',
          'border-divider',
          'bg-background',
          'text-foreground',
          'shadow-2xl outline-none',
          'max-sm:max-h-dvh',
          'max-sm:h-dvh',
          'max-sm:max-w-none',
          'max-sm:rounded-none',
          className,
        )}
        onKeyDown={
          handlePanelKeyDown
        }
        role="dialog"
        tabIndex={-1}
      >
        <header
          className={cn(
            'flex min-h-14',
            'shrink-0 items-start',
            'justify-between gap-4',
            'border-b border-divider',
            'px-5 py-4',
          )}
        >
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-base font-semibold"
            >
              {title}
            </h2>

            {description ? (
              <p
                id={descriptionId}
                className={cn(
                  'mt-1 text-sm',
                  'leading-5',
                  'text-muted-foreground',
                )}
              >
                {description}
              </p>
            ) : null}
          </div>

          <Button
            ref={closeButtonRef}
            aria-label={closeLabel}
            disabled={busy}
            onClick={() => {
              onOpenChange(false)
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X
              aria-hidden="true"
              className="size-4"
            />
          </Button>
        </header>

        <div
          className={cn(
            'min-h-0 flex-1',
            'overflow-auto',
            contentClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <footer
            className={cn(
              'shrink-0',
              'border-t border-divider',
              'px-5 py-3',
            )}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
`

const FIELD_COMPONENT = String.raw`import {
  type ReactNode,
  useId,
} from 'react'
import { cn } from '../../lib/utils'

export interface FieldControlIds {
  readonly inputId: string
  readonly descriptionId?: string
  readonly errorId?: string
  readonly describedBy?: string
}

export interface FieldProps {
  readonly label: string
  readonly description?: string
  readonly error?: string
  readonly required?: boolean
  readonly className?: string
  readonly children: (
    ids: FieldControlIds,
  ) => ReactNode
}

export function Field({
  label,
  description,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const inputId = useId()

  const descriptionId =
  description
    ? inputId + '-description'
    : undefined

  const errorId =
  error
    ? inputId + '-error'
    : undefined

  const describedBy = [
    descriptionId,
    errorId,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div
      className={cn(
        'grid gap-2',
        className,
      )}
    >
      <label
        className="text-sm font-medium"
        htmlFor={inputId}
      >
        {label}

        {required ? (
          <>
            <span
              aria-hidden="true"
              className="ml-1 text-destructive"
            >
              *
            </span>

            <span className="sr-only">
              必填
            </span>
          </>
        ) : null}
      </label>

      {description ? (
        <p
          id={descriptionId}
          className={cn(
            'text-xs leading-5',
            'text-muted-foreground',
          )}
        >
          {description}
        </p>
      ) : null}

      {children({
        inputId,
        descriptionId,
        errorId,
        describedBy,
      })}

      {error ? (
        <p
          id={errorId}
          className={cn(
            'flex items-start gap-1',
            'text-xs leading-5',
            'text-destructive',
          )}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
`

const CONFIRMATION_DIALOG_COMPONENT = String.raw`import { Button } from './button'
import { Dialog } from './dialog'

export interface ConfirmationDialogProps {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly destructive?: boolean
  readonly busy?: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      busy={busy}
      closeOnOverlayClick={!busy}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel()
        }
      }}
      footer={
        <div
          className={cnFooter()}
        >
          <Button
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="ghost"
          >
            {cancelLabel}
          </Button>

          <Button
            aria-busy={
              busy || undefined
            }
            disabled={busy}
            onClick={onConfirm}
            type="button"
            variant={
              destructive
                ? 'destructive'
                : 'default'
            }
          >
            {busy
              ? '处理中…'
              : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="sr-only">
        {description}
      </div>
    </Dialog>
  )
}

function cnFooter(): string {
  return [
    'flex flex-wrap',
    'justify-end gap-2',
  ].join(' ')
}
`

const DIALOG_ARCHITECTURE_CHECK = String.raw`#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.canvas-ui-refactor-backup',
  '.canvas-ui-phase-2a-backup',
  'dist',
  'node_modules',
  'target',
])

function walk(directory) {
  return fs
    .readdirSync(
      directory,
      {
        withFileTypes: true,
      },
    )
    .flatMap((entry) => {
      if (
        IGNORED_DIRECTORIES.has(
          entry.name,
        )
      ) {
        return []
      }

      const entryPath = path.join(
        directory,
        entry.name,
      )

      if (entry.isDirectory()) {
        return walk(entryPath)
      }

      return entry.isFile()
        ? [entryPath]
        : []
    })
}

const sourceFiles = walk(ROOT).filter(
  (filePath) =>
    filePath.endsWith('.tsx'),
)

const failures = []

for (const filePath of sourceFiles) {
  const relativePath =
    path.relative(ROOT, filePath)

  const normalizedPath =
    relativePath.split(path.sep).join('/')

  const content =
    fs.readFileSync(
      filePath,
      'utf8',
    )

  const isDesignSystemDialog =
    normalizedPath.startsWith(
      'foundations/design-system/' +
        'src/components/ui/',
    )

  if (
    !isDesignSystemDialog &&
    /role=["']dialog["']/.test(content) &&
    /fixed[\s\S]{0,300}inset-0/.test(
      content,
    )
  ) {
    failures.push(
      normalizedPath +
        ': Feature 不应自行实现 Dialog Overlay',
    )
  }

  if (
    /role=["']dialog["']/.test(content) &&
    !/aria-labelledby=/.test(content)
  ) {
    failures.push(
      normalizedPath +
        ': Dialog 缺少 aria-labelledby',
    )
  }

  if (
    /role=["']dialog["']/.test(content) &&
    !/aria-modal=/.test(content)
  ) {
    failures.push(
      normalizedPath +
        ': Dialog 缺少 aria-modal',
    )
  }
}

if (failures.length > 0) {
  console.error(

  process.exitCode = 1
} else {
  console.log(
    'Dialog architecture checks passed.',
  )
}
`

const GENERATED_FILES = new Map([
  [
    FILES.dialog,
    DIALOG_COMPONENT,
  ],
  [
    FILES.field,
    FIELD_COMPONENT,
  ],
  [
    FILES.confirmationDialog,
    CONFIRMATION_DIALOG_COMPONENT,
  ],
  [
    FILES.architectureCheck,
    DIALOG_ARCHITECTURE_CHECK,
  ],
])

function transformPublicApi(content) {
  const exportsToAdd = [
    "export { Dialog, type DialogProps } from './components/ui/dialog'",
    "export { Field, type FieldControlIds, type FieldProps } from './components/ui/field'",
    "export { ConfirmationDialog, type ConfirmationDialogProps } from './components/ui/confirmation-dialog'",
  ]

  let next = content.trimEnd()

  for (const exportLine of exportsToAdd) {
    const modulePath =
      exportLine.match(/from '([^']+)'/)?.[1]

    if (!modulePath) {
      throw new Error(
        `无法解析导出语句：${exportLine}`,
      )
    }

    const existingExportPattern =
      new RegExp(
        `export\\s+\\{[^}]*\\}\\s+from\\s+['"]${escapeRegExp(modulePath)}['"]`,
        's',
      )

    if (
      !existingExportPattern.test(next)
    ) {
      next += `\n${exportLine}`
    }
  }

  return `${next}\n`
}

function transformRootPackage(content) {
  const packageJson = JSON.parse(content)

  packageJson.scripts ??= {}

  const command =
    'node tests/architecture/check-ui-dialogs.mjs'

  const existing =
    packageJson.scripts[
      'test:architecture'
    ]

  if (!existing) {
    packageJson.scripts[
      'test:architecture'
    ] = command
  } else if (!existing.includes(command)) {
    packageJson.scripts[
      'test:architecture'
    ] = `${existing} && ${command}`
  }

  return (
    JSON.stringify(
      packageJson,
      null,
      2,
    ) + '\n'
  )
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  )
}

const TRANSFORMS = new Map([
  [
    FILES.publicApi,
    transformPublicApi,
  ],
  [
    FILES.rootPackage,
    transformRootPackage,
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

function backup(change) {
  const backupFile = path.join(
    BACKUP_DIRECTORY,
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
  if (fs.existsSync(BACKUP_DIRECTORY)) {
    throw new Error(
      'Phase 2A 备份目录已经存在。' +
        '请先执行 --rollback。',
    )
  }

  fs.mkdirSync(
    BACKUP_DIRECTORY,
    {
      recursive: true,
    },
  )

  for (const change of changes) {
    backup(change)

    write(
      change.relativePath,
      change.nextContent,
    )
  }

  const manifest = {
    createdAt:
      new Date().toISOString(),

    files: changes.map(
      (change) =>
        change.relativePath,
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
      '没有找到 Phase 2A 回滚清单。',
    )
  }

  const manifest = JSON.parse(
    fs.readFileSync(
      MANIFEST_FILE,
      'utf8',
    ),
  )

  for (
    const relativePath of manifest.files
  ) {
    const backupFile = path.join(
      BACKUP_DIRECTORY,
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
    BACKUP_DIRECTORY,
    {
      recursive: true,
      force: true,
    },
  )

  console.log(
    'Phase 2A 已回滚。',
  )
}

function printPlan(changes) {
  console.log(
    `Phase 2A 将修改 ${changes.length} 个文件：`,
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
    console.log(
      'Phase 2A 没有需要应用的修改。',
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
      '应用命令：node tooling/script/refactor-ui-phase-2a.mjs --apply',
    )

    return
  }

  applyChanges(changes)

  console.log('')
  console.log(
    'Phase 2A 已应用。',
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
  console.log('回滚命令：')
  console.log(
    'node tooling/script/refactor-ui-phase-2a.mjs --rollback --allow-dirty',
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