#!/usr/bin/env node

import {
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldWrite = process.argv.includes('--write')

const writes = new Map()
const deletions = new Set()
const moves = []

function absolute(relativePath) {
  return resolve(root, relativePath)
}

async function exists(relativePath) {
  try {
    await stat(absolute(relativePath))
    return true
  } catch {
    return false
  }
}

async function read(relativePath) {
  return readFile(absolute(relativePath), 'utf8')
}

function replaceOnce(content, oldText, newText, description) {
  const firstIndex = content.indexOf(oldText)

  if (firstIndex < 0) {
    throw new Error(`找不到待修改内容：${description}`)
  }

  const secondIndex = content.indexOf(
    oldText,
    firstIndex + oldText.length,
  )

  if (secondIndex >= 0) {
    throw new Error(`待修改内容不唯一：${description}`)
  }

  return (
    content.slice(0, firstIndex) +
    newText +
    content.slice(firstIndex + oldText.length)
  )
}

function replaceRange(
  content,
  startMarker,
  endMarker,
  replacement,
  description,
) {
  const startIndex = content.indexOf(startMarker)

  if (startIndex < 0) {
    throw new Error(`找不到范围起点：${description}`)
  }

  const endIndex = content.indexOf(
    endMarker,
    startIndex + startMarker.length,
  )

  if (endIndex < 0) {
    throw new Error(`找不到范围终点：${description}`)
  }

  return (
    content.slice(0, startIndex) +
    replacement +
    content.slice(endIndex)
  )
}

async function edit(relativePath, transform) {
  const original = await read(relativePath)
  const updated = transform(original)

  if (updated === original) {
    throw new Error(`文件没有产生修改：${relativePath}`)
  }

  writes.set(relativePath, updated)
}

function create(relativePath, content) {
  writes.set(relativePath, content)
}

function remove(relativePath) {
  deletions.add(relativePath)
}

function move(from, to) {
  moves.push({ from, to })
}

function updateJson(relativePath, transform) {
  return edit(relativePath, (content) => {
    const hasBom = content.startsWith('\uFEFF')
    const json = JSON.parse(hasBom ? content.slice(1) : content)
    const updated = transform(json) ?? json
    return `${hasBom ? '\uFEFF' : ''}${JSON.stringify(updated, null, 2)}\n`
  })
}

async function createConfirmationDialog() {
  create(
    'foundations/design-system/src/components/ui/confirmation-dialog.tsx',
    `import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
} from 'react'

import { Button } from './button'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

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
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const previouslyFocused = document.activeElement
    cancelButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)

      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus()
      }
    }
  }, [busy, onCancel, open])

  if (!open) {
    return null
  }

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        FOCUSABLE_SELECTOR,
      ) ?? [],
    )

    if (focusableElements.length === 0) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }

    const first = focusableElements[0]
    const last = focusableElements.at(-1)

    if (!first || !last) {
      return
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
      return
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/35 p-6 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !busy
        ) {
          onCancel()
        }
      }}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-divider bg-background p-5 shadow-2xl outline-none"
        onKeyDown={trapFocus}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <h2
          className="text-base font-semibold"
          id={titleId}
        >
          {title}
        </h2>

        <p
          className="mt-2 text-sm leading-6 text-muted-foreground"
          id={descriptionId}
        >
          {description}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            disabled={busy}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
            variant="ghost"
          >
            {cancelLabel}
          </Button>

          <Button
            disabled={busy}
            onClick={onConfirm}
            type="button"
            variant={destructive ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
`,
  )

  await edit(
    'foundations/design-system/src/public-api.ts',
    (content) =>
      replaceOnce(
        content,
        `export { Button, type ButtonProps, buttonVariants } from './components/ui/button'\n`,
        `export { Button, type ButtonProps, buttonVariants } from './components/ui/button'\nexport {\n  ConfirmationDialog,\n  type ConfirmationDialogProps,\n} from './components/ui/confirmation-dialog'\n`,
        '导出 ConfirmationDialog',
      ),
  )
}

async function moveDesktopTitleBar() {
  const oldPath =
    'features/workspace/src/presentation/shell/DesktopTitleBar.tsx'
  const newPath =
    'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx'

  if (!(await exists(oldPath))) {
    throw new Error(`找不到 DesktopTitleBar：${oldPath}`)
  }

  move(oldPath, newPath)
}

async function refactorWorkspaceContracts() {
  await edit(
    'features/workspace/src/contracts/shell-contract.ts',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `import type { CanvasSessionId, WorkbenchViewModel } from './public-api'`,
        `import type {
  CanvasSessionId,
  CanvasTabViewModel,
  WorkbenchViewModel,
} from './public-api'`,
        '扩展 Workspace chrome render 类型导入',
      )

      updated = replaceOnce(
        updated,
        `  readonly openSettingsWindow: () => void
  readonly minimizeWindow: () => void
  readonly maximizeWindow: () => void
  readonly closeWindow: () => void
  readonly startWindowDragging: () => void
}

export interface WorkspaceShellProps {`,
        `  readonly openSettingsWindow: () => void
}

export interface WorkspaceChromeRenderProps {
  readonly isSidebarOpen: boolean
  readonly sidebarWidth: number
  readonly tabs: readonly CanvasTabViewModel[]
  readonly onSidebarToggle: () => void
  readonly onActivateCanvas: (sessionId: CanvasSessionId) => void
  readonly onCloseCanvas: (sessionId: CanvasSessionId) => void
  readonly onCreateCanvas: () => void
}

export interface WorkspaceShellProps {`,
        '移除 Workspace action 中的 Desktop window 语义',
      )

      updated = replaceOnce(
        updated,
        `  readonly pages: readonly CanvasPageViewModel[]
  readonly editor: ReactNode`,
        `  readonly pages: readonly CanvasPageViewModel[]
  readonly renderChrome: (
    props: WorkspaceChromeRenderProps,
  ) => ReactNode
  readonly editor: ReactNode`,
        '添加平台无关的 chrome render prop',
      )

      updated = replaceOnce(
        updated,
        `  readonly statusRight?: ReactNode
  readonly overlays?: ReactNode`,
        `  readonly statusRight?: ReactNode
  readonly assistantOverlay?: ReactNode
  readonly overlays?: ReactNode`,
        '添加可选 assistant overlay 插槽',
      )

      return updated
    },
  )

  await edit(
    'features/workspace/src/contracts-entry.ts',
    (content) =>
      replaceOnce(
        content,
        `  CanvasPageViewModel,
  WorkspaceShellActions,
  WorkspaceShellProps,`,
        `  CanvasPageViewModel,
  WorkspaceChromeRenderProps,
  WorkspaceShellActions,
  WorkspaceShellProps,`,
        '导出 WorkspaceChromeRenderProps',
      ),
  )
}

async function refactorWorkspaceFrame() {
  await edit(
    'features/workspace/src/presentation/shell/WorkspaceFrame.tsx',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `import type { ReactNode } from 'react'`,
        `import type { ReactNode, Ref } from 'react'`,
        '导入 WorkspaceFrame ref 类型',
      )

      updated = replaceOnce(
        updated,
        `export interface WorkspaceFrameProps {
  readonly chrome: ReactNode`,
        `export interface WorkspaceFrameProps {
  readonly rootRef?: Ref<HTMLDivElement>
  readonly chrome: ReactNode`,
        'WorkspaceFrame 接收根 DOM ref',
      )

      updated = replaceOnce(
        updated,
        `export function WorkspaceFrame({
  chrome,`,
        `export function WorkspaceFrame({
  rootRef,
  chrome,`,
        '解构 WorkspaceFrame rootRef',
      )

      updated = replaceOnce(
        updated,
        `    <div
      className="workspace-shell`,
        `    <div
      ref={rootRef}
      className="workspace-shell`,
        '将 rootRef 挂载到 Workspace 根元素',
      )

      return updated
    },
  )
}

async function refactorWorkspaceShell() {
  await edit(
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `import { Button, TooltipProvider } from '@hybrid-canvas/design-system'
import { BotMessageSquare, PanelRightClose, PanelRightOpen, Sparkles, X } from 'lucide-react'`,
        `import { Button, TooltipProvider } from '@hybrid-canvas/design-system'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'`,
        '移除 Workspace 中硬编码 AI Chat 图标',
      )

      updated = replaceOnce(
        updated,
        `import { DesktopTitleBar } from './DesktopTitleBar'
import { CanvasTabs } from './CanvasTabs'
`,
        '',
        '移除 Workspace 对 DesktopTitleBar 和 CanvasTabs 的直接组合',
      )

      updated = replaceOnce(
        updated,
        `  pages,
  editor,`,
        `  pages,
  renderChrome,
  editor,`,
        '解构 renderChrome',
      )

      updated = replaceOnce(
        updated,
        `  statusRight,
  overlays,`,
        `  statusRight,
  assistantOverlay,
  overlays,`,
        '解构 assistantOverlay',
      )

      updated = replaceOnce(
        updated,
        `  const [isInspectorOpen, setInspectorOpen] = useState(true)
  const [isAiChatOpen, setAiChatOpen] = useState(false)
  const [activeNavigationItem`,
        `  const [isInspectorOpen, setInspectorOpen] = useState(true)
  const [activeNavigationItem`,
        '删除硬编码 AI Chat 本地状态',
      )

      const chromeStart = `  const chrome = (
    <header`
      const chromeEnd = `  const rail = (`

      updated = replaceRange(
        updated,
        chromeStart,
        chromeEnd,
        `  const chrome = (
    <header
      className={
        hasActiveCanvas
          ? 'col-span-full row-1 min-h-0 min-w-0 bg-chrome'
          : 'col-span-full row-1 min-h-0 min-w-0 border-b border-divider bg-chrome'
      }
    >
      {renderChrome({
        isSidebarOpen,
        sidebarWidth,
        tabs: model.tabs,
        onSidebarToggle: () => setSidebarOpen((open) => !open),
        onActivateCanvas: actions.activateCanvas,
        onCloseCanvas: actions.closeCanvas,
        onCreateCanvas: actions.createCanvas,
      })}
    </header>
  )

  const rail = (`,
        '使用 renderChrome 替代 DesktopTitleBar',
      )

      updated = replaceOnce(
        updated,
        `      <WorkspaceFrame
        chrome={chrome}`,
        `      <WorkspaceFrame
        rootRef={rootRef}
        chrome={chrome}`,
        '把 Workspace rootRef 传给 WorkspaceFrame',
      )

      updated = replaceOnce(
        updated,
        `        overlays={
          <>
            <AiChatWidget open={isAiChatOpen} onOpenChange={setAiChatOpen} />
            {overlays}
          </>
        }`,
        `        overlays={
          <>
            {assistantOverlay}
            {overlays}
          </>
        }`,
        '使用 assistant overlay 插槽',
      )

      const aiFunctionStart = `\nfunction AiChatWidget(`

      if (!updated.includes(aiFunctionStart)) {
        throw new Error('找不到 WorkspaceShell 中的 AiChatWidget')
      }

      updated = updated.slice(0, updated.indexOf(aiFunctionStart))
      updated = `${updated.trimEnd()}\n`

      return updated
    },
  )
}

async function refactorWorkspaceContainer() {
  await edit(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `import type { EditorSession } from '@hybrid-canvas/canvas/application'
import { EditorSessionHost } from '@hybrid-canvas/canvas/react'`,
        `import type { EditorSession } from '@hybrid-canvas/canvas/application'
import { EditorSessionHost } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'`,
        '导入 ConfirmationDialog',
      )

      updated = replaceOnce(
        updated,
        `import { WorkspaceShell } from '@hybrid-canvas/workspace/react'`,
        `import { CanvasTabs, WorkspaceShell } from '@hybrid-canvas/workspace/react'`,
        '导入 CanvasTabs',
      )

      updated = replaceOnce(
        updated,
        `import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'`,
        `import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'
import { DesktopTitleBar } from '../chrome/DesktopTitleBar'`,
        '导入 Desktop app 自己的 DesktopTitleBar',
      )

      updated = replaceOnce(
        updated,
        `      openCommandPalette: onCommandPaletteOpen,
      openSettingsWindow: onSettingsOpen,
      minimizeWindow: onWindowMinimize,
      maximizeWindow: onWindowMaximize,
      closeWindow: onWindowClose,
      startWindowDragging: onWindowStartDragging,`,
        `      openCommandPalette: onCommandPaletteOpen,
      openSettingsWindow: onSettingsOpen,`,
        '从 Workspace actions 移除原生窗口操作',
      )

      updated = replaceOnce(
        updated,
        `      pages={pages}
      statusLeft=`,
        `      pages={pages}
      renderChrome={({
        isSidebarOpen,
        sidebarWidth,
        tabs,
        onSidebarToggle,
        onActivateCanvas,
        onCloseCanvas,
        onCreateCanvas,
      }) => (
        <DesktopTitleBar
          isSidebarOpen={isSidebarOpen}
          onClose={onWindowClose}
          onMaximize={onWindowMaximize}
          onMinimize={onWindowMinimize}
          onSidebarToggle={onSidebarToggle}
          onStartDragging={onWindowStartDragging}
          sidebarWidth={sidebarWidth}
        >
          <CanvasTabs
            onActivate={onActivateCanvas}
            onClose={onCloseCanvas}
            onCreate={onCreateCanvas}
            tabs={tabs}
          />
        </DesktopTitleBar>
      )}
      statusLeft=`,
        '在 Desktop composition 层组装窗口 chrome',
      )

      const overlaysStart = `      overlays={
        pendingCloseSessionId ? (`
      const overlaysEnd = `      }
    />`

      updated = replaceRange(
        updated,
        overlaysStart,
        overlaysEnd,
        `      overlays={
        <ConfirmationDialog
          confirmLabel="放弃并关闭"
          description="关闭画布会丢失自上次保存后的更改，此操作无法撤销。"
          destructive
          onCancel={() => setPendingCloseSessionId(null)}
          onConfirm={() => {
            if (!pendingCloseSessionId) {
              return
            }

            port.canvases.discardAndClose(pendingCloseSessionId)
            setPendingCloseSessionId(null)
          }}
          open={pendingCloseSessionId !== null}
          title="放弃未保存的更改？"
        />
      }
    />`,
        '使用统一 ConfirmationDialog 替换画布关闭弹窗',
      )

      return updated
    },
  )
}

async function migrateSettingsPresentation() {
  const oldPath =
    'apps/desktop/src/presentation/settings/SettingsDialog.tsx'
  const newPath =
    'features/settings/src/presentation/SettingsDialog.tsx'

  if (!(await exists(oldPath))) {
    throw new Error(`找不到待迁移的 SettingsDialog：${oldPath}`)
  }

  move(oldPath, newPath)

  create(
    'features/settings/src/presentation/public-api.ts',
    `export {
  SettingsDialog,
  type SettingsDialogProps,
} from './SettingsDialog'
`,
  )

  await updateJson('features/settings/package.json', (json) => {
    json.exports ??= {}

    json.exports['./react'] = {
      types: './src/presentation/public-api.ts',
      default: './src/presentation/public-api.ts',
    }

    return json
  })

  await updateJson('apps/desktop/package.json', (json) => {
    json.dependencies ??= {}
    json.dependencies['@hybrid-canvas/settings'] = 'workspace:*'

    json.dependencies = Object.fromEntries(
      Object.entries(json.dependencies).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    )

    return json
  })

  await edit(
    'apps/desktop/src/presentation/AppShell.tsx',
    (content) =>
      replaceOnce(
        content,
        `import { SettingsDialog } from './settings/SettingsDialog'`,
        `import { SettingsDialog } from '@hybrid-canvas/settings/react'`,
        '从 settings feature 导入 SettingsDialog',
      ),
  )
}

async function refactorTerminationCoordinator() {
  await edit(
    'apps/desktop/src/application/termination/application-termination-coordinator.ts',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `  | {
      readonly state: 'terminating'
      readonly intent: ApplicationTerminationIntent
    }

export interface ApplicationTerminator`,
        `  | {
      readonly state: 'terminating'
      readonly intent: ApplicationTerminationIntent
    }
  | {
      readonly state: 'termination-failed'
      readonly intent: ApplicationTerminationIntent
      readonly message: string
    }

export interface ApplicationTerminator`,
        '增加 termination-failed 状态',
      )

      updated = replaceOnce(
        updated,
        `  readonly confirmDiscard: () => void
  readonly getSnapshot`,
        `  readonly confirmDiscard: () => void
  readonly retry: () => void
  readonly getSnapshot`,
        '增加 termination retry API',
      )

      updated = replaceOnce(
        updated,
        `  function request(intent: ApplicationTerminationIntent): void {
    if (disposed || snapshot.state === 'terminating') {
      return
    }

    evaluate(intent, canvases.planApplicationClose())
  }

  function evaluate`,
        `  function request(intent: ApplicationTerminationIntent): void {
    if (disposed || snapshot.state === 'terminating') {
      return
    }

    evaluate(intent, canvases.planApplicationClose())
  }

  function beginTermination(intent: ApplicationTerminationIntent): void {
    const currentGeneration = ++generation

    emit({
      state: 'terminating',
      intent,
    })

    void terminator.terminate(intent).catch((error: unknown) => {
      if (disposed || currentGeneration !== generation) {
        return
      }

      emit({
        state: 'termination-failed',
        intent,
        message:
          error instanceof Error
            ? error.message
            : 'UNKNOWN_TERMINATION_ERROR',
      })
    })
  }

  function evaluate`,
        '增加可恢复的原生终止操作',
      )

      updated = replaceOnce(
        updated,
        `    if (plan.kind === 'close-now') {
      emit({
        state: 'terminating',
        intent,
      })

      void terminator.terminate(intent)
      return
    }`,
        `    if (plan.kind === 'close-now') {
      beginTermination(intent)
      return
    }`,
        '统一通过 beginTermination 执行退出',
      )

      updated = replaceOnce(
        updated,
        `    confirmDiscard() {
      if (snapshot.state !== 'confirmation-required') {
        return
      }

      const { intent, sessionIds } = snapshot

      canvases.discardAllAndClose(sessionIds)
      request(intent)
    },

    getSnapshot: () => snapshot,`,
        `    confirmDiscard() {
      if (snapshot.state !== 'confirmation-required') {
        return
      }

      const { intent, sessionIds } = snapshot

      canvases.discardAllAndClose(sessionIds)
      request(intent)
    },

    retry() {
      if (snapshot.state !== 'termination-failed') {
        return
      }

      beginTermination(snapshot.intent)
    },

    getSnapshot: () => snapshot,`,
        '实现退出失败重试',
      )

      return updated
    },
  )
}

async function refactorAppShellDialogs() {
  await edit(
    'apps/desktop/src/presentation/AppShell.tsx',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `import { EditorProvider } from '@hybrid-canvas/canvas/react'`,
        `import { EditorProvider } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'`,
        '导入应用级 ConfirmationDialog',
      )

      const startMarker = `      {termination.state === 'confirmation-required' ? (`
      const endMarker = `    </EditorProvider>`

      updated = replaceRange(
        updated,
        startMarker,
        endMarker,
        `      <ConfirmationDialog
        confirmLabel="放弃全部并退出"
        description={
          termination.state === 'confirmation-required'
            ? \`有 \${termination.sessionIds.length} 个画布包含未保存的更改。\`
            : ''
        }
        destructive
        onCancel={runtime.termination.cancel}
        onConfirm={runtime.termination.confirmDiscard}
        open={termination.state === 'confirmation-required'}
        title="退出并放弃未保存的更改？"
      />

      <ConfirmationDialog
        cancelLabel="返回应用"
        confirmLabel="重试退出"
        description={
          termination.state === 'termination-failed'
            ? \`原生窗口未能完成退出：\${termination.message}\`
            : ''
        }
        onCancel={runtime.termination.cancel}
        onConfirm={runtime.termination.retry}
        open={termination.state === 'termination-failed'}
        title="应用退出失败"
      />
    </EditorProvider>`,
        '统一应用退出和退出失败弹窗',
      )

      return updated
    },
  )
}

async function addTerminationTests() {
  create(
    'apps/desktop/src/application/termination/application-termination-coordinator.test.ts',
    `import { describe, expect, it, vi } from 'vitest'

import {
  createApplicationTerminationCoordinator,
  type ApplicationTerminationSnapshot,
} from './application-termination-coordinator'

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve))
}

describe('ApplicationTerminationCoordinator', () => {
  it('enters a recoverable failure state when native termination fails', async () => {
    const terminate = vi.fn().mockRejectedValue(
      new Error('NATIVE_CLOSE_FAILED'),
    )

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.request('window-close')
    await flushMicrotasks()

    expect(coordinator.getSnapshot()).toEqual({
      state: 'termination-failed',
      intent: 'window-close',
      message: 'NATIVE_CLOSE_FAILED',
    })
  })

  it('retries the original termination intent', async () => {
    const terminate = vi
      .fn()
      .mockRejectedValueOnce(new Error('FIRST_FAILURE'))
      .mockResolvedValueOnce(undefined)

    const snapshots: ApplicationTerminationSnapshot[] = []

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.subscribe(() => {
      snapshots.push(coordinator.getSnapshot())
    })

    coordinator.request('update-restart')
    await flushMicrotasks()

    expect(coordinator.getSnapshot().state).toBe(
      'termination-failed',
    )

    coordinator.retry()
    await flushMicrotasks()

    expect(terminate).toHaveBeenNthCalledWith(
      1,
      'update-restart',
    )
    expect(terminate).toHaveBeenNthCalledWith(
      2,
      'update-restart',
    )
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.state === 'terminating' &&
          snapshot.intent === 'update-restart',
      ),
    ).toBe(true)
  })

  it('ignores a stale failure after cancellation', async () => {
    let rejectTermination:
      | ((reason?: unknown) => void)
      | undefined

    const terminate = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectTermination = reject
        }),
    )

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.cancel()
    rejectTermination?.(new Error('STALE_FAILURE'))
    await flushMicrotasks()

    expect(coordinator.getSnapshot()).toEqual({
      state: 'idle',
    })
  })
})
`,
  )
}

async function strengthenArchitectureChecks() {
  await edit(
    'tests/architecture/check.mjs',
    (content) =>
      replaceOnce(
        content,
        `  if (/from\\s+['"]\\.\\.\\/\\.\\.\\/(?:apps|editor|features|foundations|platforms)\\//.test(text)) {
    violations.push(\`\${rel}: 使用相对路径跨越顶层包边界\`)
  }
}`,
        `  if (/from\\s+['"]\\.\\.\\/\\.\\.\\/(?:apps|editor|features|foundations|platforms)\\//.test(text)) {
    violations.push(\`\${rel}: 使用相对路径跨越顶层包边界\`)
  }

  if (
    rel.startsWith('features/workspace/src/contracts/') &&
    /\\b(?:minimizeWindow|maximizeWindow|closeWindow|startWindowDragging|MainWindow)\\b/.test(text)
  ) {
    violations.push(
      \`\${rel}: Workspace contract 暴露 Desktop window 平台语义\`,
    )
  }

  if (
    rel.startsWith('features/workspace/src/') &&
    /(?:data-tauri-drag-region|@tauri-apps\\/)/.test(text)
  ) {
    violations.push(
      \`\${rel}: Workspace feature 包含 Desktop/Tauri 专属实现\`,
    )
  }

  if (
    rel === 'features/workspace/src/presentation/shell/WorkspaceShell.tsx' &&
    /\\bAiChatWidget\\b|AI Chat/.test(text)
  ) {
    violations.push(
      \`\${rel}: WorkspaceShell 不得硬编码未接入的 AI 产品能力，应使用 feature slot\`,
    )
  }

  if (
    rel.startsWith('apps/desktop/src/presentation/') &&
    /<section[^>]+role=["']dialog["']/.test(text)
  ) {
    violations.push(
      \`\${rel}: Desktop presentation 不得复制手写 Dialog，应使用 design-system ConfirmationDialog\`,
    )
  }
}`,
        '增加平台语义、AI slot 和 Dialog 架构守卫',
      ),
  )
}

async function addCiWorkflow() {
  create(
    '.github/workflows/quality.yml',
    `name: Quality

on:
  pull_request:
  push:
    branches:
      - main

concurrency:
  group: quality-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  frontend:
    name: Frontend quality
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11.15.0
          run_install: false

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Format check
        run: pnpm format:check

      - name: Lint
        run: pnpm lint

      - name: Architecture
        run: pnpm test:architecture

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm turbo run test --filter='!@hybrid-canvas/desktop-e2e'

      - name: Build
        run: pnpm build

  rust:
    name: Rust quality
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          toolchain: stable
          components: rustfmt, clippy

      - name: Cache Rust
        uses: Swatinem/rust-cache@v2

      - name: Format check
        run: cargo fmt --check

      - name: Cargo check
        run: cargo check --workspace --all-targets --all-features

      - name: Clippy
        run: cargo clippy --workspace --all-targets --all-features -- -D warnings

      - name: Tests
        run: cargo test --workspace --all-features
`,
  )
}

async function createBackup() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = absolute(
    `.refactor-backup/${stamp}`,
  )

  const pathsToBackup = new Set([
    ...writes.keys(),
    ...deletions,
    ...moves.map((entry) => entry.from),
  ])

  for (const relativePath of pathsToBackup) {
    if (!(await exists(relativePath))) {
      continue
    }

    const backupPath = resolve(
      backupRoot,
      relativePath,
    )

    await mkdir(dirname(backupPath), {
      recursive: true,
    })

    await cp(
      absolute(relativePath),
      backupPath,
      { recursive: true },
    )
  }

  return backupRoot
}

async function applyMoves() {
  for (const { from, to } of moves) {
    await mkdir(dirname(absolute(to)), {
      recursive: true,
    })

    await rename(
      absolute(from),
      absolute(to),
    )
  }
}

async function applyWrites() {
  for (const [relativePath, content] of writes) {
    await mkdir(dirname(absolute(relativePath)), {
      recursive: true,
    })

    await writeFile(
      absolute(relativePath),
      content,
      'utf8',
    )
  }
}

async function applyDeletions() {
  for (const relativePath of deletions) {
    await rm(absolute(relativePath), {
      recursive: true,
      force: true,
    })
  }
}

function printPlan() {
  console.log('')
  console.log(
    shouldWrite
      ? '结构性重构计划：'
      : '结构性重构预览（尚未写入）：',
  )

  for (const { from, to } of moves) {
    console.log(`  MOVE   ${from}`)
    console.log(`      -> ${to}`)
  }

  for (const relativePath of writes.keys()) {
    console.log(`  WRITE  ${relativePath}`)
  }

  for (const relativePath of deletions) {
    console.log(`  DELETE ${relativePath}`)
  }

  console.log('')
}

async function main() {
  await createConfirmationDialog()
  await moveDesktopTitleBar()
  await refactorWorkspaceContracts()
  await refactorWorkspaceFrame()
  await refactorWorkspaceShell()
  await refactorWorkspaceContainer()
  await migrateSettingsPresentation()
  await refactorTerminationCoordinator()
  await refactorAppShellDialogs()
  await addTerminationTests()
  await strengthenArchitectureChecks()
  await addCiWorkflow()

  printPlan()

  if (!shouldWrite) {
    console.log('所有目标代码片段均匹配。')
    console.log('')
    console.log('执行以下命令实际写入：')
    console.log('')
    console.log(
      '  node scripts/refactor-architecture-phase2.mjs --write',
    )
    console.log('')
    return
  }

  const backupRoot = await createBackup()

  await applyMoves()
  await applyWrites()
  await applyDeletions()

  console.log(
    `备份目录：${relative(root, backupRoot)}`,
  )
  console.log('')
  console.log('修改完成，请依次执行：')
  console.log('')
  console.log('  pnpm install')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm test:architecture')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm build')
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error('结构性重构脚本执行失败。')
  console.error(
    '如果尚未使用 --write，仓库不会发生变化。',
  )
  console.error(error)
  process.exitCode = 1
})