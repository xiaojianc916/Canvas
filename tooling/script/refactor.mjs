// fix-window-maximize-icon.mjs
// 放在仓库根目录执行：
// node fix-window-maximize-icon.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const files = {
  nativeWindow: resolve(
    'platforms/desktop-runtime/src/adapters/native-window.ts',
  ),

  appShell: resolve(
    'apps/desktop/src/presentation/AppShell.tsx',
  ),

  workspaceContainer: resolve(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  desktopTitleBar: resolve(
    'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx',
  ),
}

function replaceRequired(
  source,
  oldCode,
  newCode,
  description,
) {
  if (source.includes(newCode)) {
    console.log(`⏭️ 已存在：${description}`)
    return source
  }

  if (!source.includes(oldCode)) {
    throw new Error(
      `无法找到修改位置：${description}`,
    )
  }

  return source.replace(oldCode, newCode)
}

async function updateFile(path, transform) {
  const source = await readFile(path, 'utf8')
  const nextSource = transform(source)

  if (nextSource === source) {
    return false
  }

  await writeFile(path, nextSource, 'utf8')
  return true
}

async function updateNativeWindowController() {
  const changed = await updateFile(
    files.nativeWindow,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `  toggleMaximize(): Promise<void>
  close(): Promise<void>`,
        `  toggleMaximize(): Promise<void>
  isMaximized(): Promise<boolean>
  onResized(handler: () => void): Promise<() => void>
  close(): Promise<void>`,
        'MainWindowController 最大化状态接口',
      )

      source = replaceRequired(
        source,
        `    async toggleMaximize() {
      const window = await getMainWindow()
      await window.toggleMaximize()
    },
    close: () => invoke('window_close', { label: MAIN_WINDOW_LABEL }),`,
        `    async toggleMaximize() {
      const window = await getMainWindow()
      await window.toggleMaximize()
    },
    async isMaximized() {
      const window = await getMainWindow()
      return window.isMaximized()
    },
    async onResized(handler) {
      const window = await getMainWindow()

      return window.onResized(() => {
        handler()
      })
    },
    close: () => invoke('window_close', { label: MAIN_WINDOW_LABEL }),`,
        'MainWindowController 最大化状态实现',
      )

      return source
    },
  )

  console.log(
    changed
      ? '✅ 已更新 MainWindowController'
      : '⏭️ MainWindowController 无需修改',
  )
}

async function updateAppShell() {
  const changed = await updateFile(
    files.appShell,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `  const [isSettingsOpen, setSettingsOpen] = useState(false)

  const [failedCanvasTitle, setFailedCanvasTitle] = useState<string | null>(null)`,
        `  const [isSettingsOpen, setSettingsOpen] = useState(false)

  const isWindowMaximized = useWindowMaximizedState(runtime.mainWindow)

  const [failedCanvasTitle, setFailedCanvasTitle] = useState<string | null>(null)`,
        'AppShell 最大化状态',
      )

      source = replaceRequired(
        source,
        `        <WorkspaceContainer
          onCommandPaletteOpen={openCommandPalette}`,
        `        <WorkspaceContainer
          isWindowMaximized={isWindowMaximized}
          onCommandPaletteOpen={openCommandPalette}`,
        '向 WorkspaceContainer 传递最大化状态',
      )

      source = replaceRequired(
        source,
        `function useMainWindowCloseRequest(
  mainWindow: MainWindowController,`,
        `function useWindowMaximizedState(
  mainWindow: MainWindowController,
): boolean {
  const [isMaximized, setMaximized] = useState(false)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    let requestVersion = 0

    function synchronizeMaximizedState() {
      const currentVersion = ++requestVersion

      void mainWindow.isMaximized().then(
        (nextIsMaximized) => {
          if (
            !active ||
            currentVersion !== requestVersion
          ) {
            return
          }

          setMaximized(nextIsMaximized)
        },
        (cause: unknown) => {
          if (!active) {
            return
          }

          reportError('window maximize state query failed', {
            scope: 'app-shell',
            operation: 'query-window-maximized',
            cause,
          })
        },
      )
    }

    synchronizeMaximizedState()

    void mainWindow.onResized(
      synchronizeMaximizedState,
    ).then(
      (nextUnsubscribe) => {
        if (!active) {
          nextUnsubscribe()
          return
        }

        unsubscribe = nextUnsubscribe
      },
      (cause: unknown) => {
        if (!active) {
          return
        }

        reportError('window resize listener registration failed', {
          scope: 'app-shell',
          operation: 'register-window-resize-listener',
          cause,
        })
      },
    )

    return () => {
      active = false
      requestVersion += 1
      unsubscribe?.()
    }
  }, [mainWindow])

  return isMaximized
}

function useMainWindowCloseRequest(
  mainWindow: MainWindowController,`,
        '添加窗口最大化状态 Hook',
      )

      return source
    },
  )

  console.log(
    changed
      ? '✅ 已更新 AppShell'
      : '⏭️ AppShell 无需修改',
  )
}

async function updateWorkspaceContainer() {
  const changed = await updateFile(
    files.workspaceContainer,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `export interface WorkspaceContainerProps {
  readonly port: WorkspaceUIPort
  readonly onCommandPaletteOpen: () => void`,
        `export interface WorkspaceContainerProps {
  readonly port: WorkspaceUIPort
  readonly isWindowMaximized: boolean
  readonly onCommandPaletteOpen: () => void`,
        'WorkspaceContainerProps 最大化状态',
      )

      source = replaceRequired(
        source,
        `export function WorkspaceContainer({
  port,
  onCommandPaletteOpen,`,
        `export function WorkspaceContainer({
  port,
  isWindowMaximized,
  onCommandPaletteOpen,`,
        'WorkspaceContainer 最大化状态参数',
      )

      source = replaceRequired(
        source,
        `        <DesktopTitleBar
          isSidebarOpen={isSidebarOpen}`,
        `        <DesktopTitleBar
          isMaximized={isWindowMaximized}
          isSidebarOpen={isSidebarOpen}`,
        '向 DesktopTitleBar 传递最大化状态',
      )

      return source
    },
  )

  console.log(
    changed
      ? '✅ 已更新 WorkspaceContainer'
      : '⏭️ WorkspaceContainer 无需修改',
  )
}

async function updateDesktopTitleBar() {
  const changed = await updateFile(
    files.desktopTitleBar,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `import { Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react'`,
        `import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react'`,
        '导入窗口还原图标',
      )

      source = replaceRequired(
        source,
        `  readonly onSidebarToggle: () => void
  readonly isSidebarOpen: boolean
  readonly sidebarWidth: number`,
        `  readonly onSidebarToggle: () => void
  readonly isSidebarOpen: boolean
  readonly isMaximized: boolean
  readonly sidebarWidth: number`,
        'DesktopTitleBarProps 最大化状态',
      )

      source = replaceRequired(
        source,
        `  onSidebarToggle,
  isSidebarOpen,
}: DesktopTitleBarProps) {`,
        `  onSidebarToggle,
  isSidebarOpen,
  isMaximized,
}: DesktopTitleBarProps) {`,
        'DesktopTitleBar 最大化状态参数',
      )

      source = replaceRequired(
        source,
        `          <button
            aria-label="最大化或还原"
            className="grid w-11 place-items-center text-muted-foreground hover:bg-black/5 hover:text-foreground"
            onClick={onMaximize}
            type="button"
          >
            <Square className="size-3" />
          </button>`,
        `          <button
            aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
            className="grid w-11 place-items-center text-muted-foreground hover:bg-black/5 hover:text-foreground"
            onClick={onMaximize}
            title={isMaximized ? '还原窗口' : '最大化窗口'}
            type="button"
          >
            {isMaximized ? (
              <Copy
                aria-hidden="true"
                className="size-3.5"
              />
            ) : (
              <Square
                aria-hidden="true"
                className="size-3"
              />
            )}
          </button>`,
        '最大化与还原动态图标',
      )

      return source
    },
  )

  console.log(
    changed
      ? '✅ 已更新 DesktopTitleBar'
      : '⏭️ DesktopTitleBar 无需修改',
  )
}

async function verifyResult() {
  const [
    nativeWindowSource,
    appShellSource,
    workspaceSource,
    titleBarSource,
  ] = await Promise.all([
    readFile(files.nativeWindow, 'utf8'),
    readFile(files.appShell, 'utf8'),
    readFile(files.workspaceContainer, 'utf8'),
    readFile(files.desktopTitleBar, 'utf8'),
  ])

  const checks = [
    {
      passed: nativeWindowSource.includes(
        'isMaximized(): Promise<boolean>',
      ),
      message: 'MainWindowController 缺少 isMaximized',
    },
    {
      passed: nativeWindowSource.includes(
        'onResized(handler: () => void)',
      ),
      message: 'MainWindowController 缺少 onResized',
    },
    {
      passed: appShellSource.includes(
        'useWindowMaximizedState',
      ),
      message: 'AppShell 缺少最大化状态 Hook',
    },
    {
      passed: workspaceSource.includes(
        'isWindowMaximized',
      ),
      message: 'WorkspaceContainer 缺少最大化状态',
    },
    {
      passed: titleBarSource.includes(
        "import { Copy, Minus",
      ),
      message: 'DesktopTitleBar 缺少还原图标',
    },
    {
      passed: titleBarSource.includes(
        "isMaximized ? '还原窗口' : '最大化窗口'",
      ),
      message: '最大化按钮缺少动态标签',
    },
    {
      passed: titleBarSource.includes(
        '{isMaximized ? (',
      ),
      message: '最大化按钮缺少动态图标切换',
    },
    {
      passed: !titleBarSource.includes(
        'aria-label="最大化或还原"',
      ),
      message: '仍然残留旧的固定最大化按钮',
    },
  ]

  const failures = checks.filter(
    (check) => !check.passed,
  )

  if (failures.length > 0) {
    console.error('❌ 验证失败：')

    for (const failure of failures) {
      console.error(`   - ${failure.message}`)
    }

    process.exitCode = 1
    return
  }

  console.log('✅ 已确认旧固定图标实现删除干净')
  console.log('✅ 已确认窗口状态同步链完整')
}

async function main() {
  try {
    await updateNativeWindowController()
    await updateAppShell()
    await updateWorkspaceContainer()
    await updateDesktopTitleBar()
    await verifyResult()

    if (process.exitCode) {
      return
    }

    console.log('')
    console.log('🎉 最大化/还原图标修复完成')
    console.log('')
    console.log('请执行：')
    console.log('  pnpm format')
    console.log('  pnpm typecheck')
    console.log('  pnpm test:architecture')
    console.log('  pnpm build:desktop')
    console.log('  git diff --check')
  } catch (error) {
    console.error('❌ 修改失败')

    if (error instanceof Error) {
      console.error(error.message)
    } else {
      console.error(error)
    }

    process.exit(1)
  }
}

await main()