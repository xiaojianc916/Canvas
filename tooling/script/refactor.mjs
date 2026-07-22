// add-developer-tools-menu.mjs
// 放在仓库根目录执行：
// node add-developer-tools-menu.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const paths = {
  workspaceCargo: resolve('Cargo.toml'),

  rustWindowCommands: resolve(
    'apps/desktop/src-tauri/src/commands/window.rs',
  ),

  rustBootstrap: resolve(
    'apps/desktop/src-tauri/src/bootstrap/app.rs',
  ),

  nativeWindowAdapter: resolve(
    'platforms/desktop-runtime/src/adapters/native-window.ts',
  ),

  appShell: resolve(
    'apps/desktop/src/presentation/AppShell.tsx',
  ),

  workspaceContainer: resolve(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  shellContract: resolve(
    'features/workspace/src/contracts/shell-contract.ts',
  ),

  workspaceShell: resolve(
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ),

  activityRail: resolve(
    'features/workspace/src/presentation/shell/ActivityRail.tsx',
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

/**
 * Tauri 默认只在开发和 debug 构建中启用开发者工具。
 * 增加 devtools feature 后，正式构建也能通过菜单打开。
 */
async function enableTauriDevtools() {
  const changed = await updateFile(
    paths.workspaceCargo,
    (source) =>
      replaceRequired(
        source,
        'tauri = { version = "2.5.1", features = [] }',
        'tauri = { version = "2.5.1", features = ["devtools"] }',
        '启用 Tauri devtools feature',
      ),
  )

  console.log(
    changed
      ? '✅ 已启用 Tauri devtools feature'
      : '⏭️ Tauri devtools feature 已启用',
  )
}

async function addRustDevtoolsCommand() {
  const changed = await updateFile(
    paths.rustWindowCommands,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `#[command]
pub async fn window_set_title(app: AppHandle, label: String, title: String) -> Result<()> {`,
        `#[command]
pub async fn window_open_devtools(app: AppHandle, label: String) -> Result<()> {
    if let Some(window) = app.get_webview_window(&label) {
        window.open_devtools();
    }

    Ok(())
}

#[command]
pub async fn window_set_title(app: AppHandle, label: String, title: String) -> Result<()> {`,
        '添加 window_open_devtools Rust 命令',
      )

      return source
    },
  )

  console.log(
    changed
      ? '✅ 已添加 Rust 开发者工具命令'
      : '⏭️ Rust 开发者工具命令已存在',
  )
}

async function registerRustDevtoolsCommand() {
  const changed = await updateFile(
    paths.rustBootstrap,
    (source) =>
      replaceRequired(
        source,
        `            commands::window::window_destroy,
            commands::window::window_set_title,`,
        `            commands::window::window_destroy,
            commands::window::window_open_devtools,
            commands::window::window_set_title,`,
        '注册 window_open_devtools 命令',
      ),
  )

  console.log(
    changed
      ? '✅ 已注册开发者工具命令'
      : '⏭️ 开发者工具命令已注册',
  )
}

async function updateNativeWindowAdapter() {
  const changed = await updateFile(
    paths.nativeWindowAdapter,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `  onResized(handler: () => void): Promise<() => void>
  close(): Promise<void>`,
        `  onResized(handler: () => void): Promise<() => void>
  openDeveloperTools(): Promise<void>
  close(): Promise<void>`,
        'MainWindowController 开发者工具接口',
      )

      source = replaceRequired(
        source,
        `    close: () => invoke('window_close', { label: MAIN_WINDOW_LABEL }),`,
        `    openDeveloperTools: () =>
      invoke('window_open_devtools', {
        label: MAIN_WINDOW_LABEL,
      }),
    close: () => invoke('window_close', { label: MAIN_WINDOW_LABEL }),`,
        'MainWindowController 开发者工具实现',
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
    paths.appShell,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `  const startWindowDragging = useCallback(() => {`,
        `  const openDeveloperTools = useCallback(() => {
    void runtime.mainWindow
      .openDeveloperTools()
      .catch((cause: unknown) => {
        reportError('open developer tools failed', {
          scope: 'app-shell',
          operation: 'open-developer-tools',
          cause,
        })
      })
  }, [runtime.mainWindow])

  const startWindowDragging = useCallback(() => {`,
        'AppShell 开发者工具回调',
      )

      source = replaceRequired(
        source,
        `          isWindowMaximized={isWindowMaximized}
          onCommandPaletteOpen={openCommandPalette}`,
        `          isWindowMaximized={isWindowMaximized}
          onCommandPaletteOpen={openCommandPalette}
          onDeveloperToolsOpen={openDeveloperTools}`,
        '向 WorkspaceContainer 传递开发者工具回调',
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
    paths.workspaceContainer,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `  readonly onCommandPaletteOpen: () => void
  readonly onSettingsOpen: () => void`,
        `  readonly onCommandPaletteOpen: () => void
  readonly onDeveloperToolsOpen: () => void
  readonly onSettingsOpen: () => void`,
        'WorkspaceContainerProps 开发者工具回调',
      )

      source = replaceRequired(
        source,
        `  onCommandPaletteOpen,
  onSettingsOpen,`,
        `  onCommandPaletteOpen,
  onDeveloperToolsOpen,
  onSettingsOpen,`,
        'WorkspaceContainer 开发者工具参数',
      )

      source = replaceRequired(
        source,
        `      openCommandPalette: onCommandPaletteOpen,
      openSettingsWindow: onSettingsOpen,`,
        `      openCommandPalette: onCommandPaletteOpen,
      openDeveloperTools: onDeveloperToolsOpen,
      openSettingsWindow: onSettingsOpen,`,
        'WorkspaceShellActions 开发者工具动作',
      )

      source = replaceRequired(
        source,
        `      onCommandPaletteOpen,
      onSettingsOpen,
      pages.length,`,
        `      onCommandPaletteOpen,
      onDeveloperToolsOpen,
      onSettingsOpen,
      pages.length,`,
        'WorkspaceContainer useMemo 依赖',
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

async function updateShellContract() {
  const changed = await updateFile(
    paths.shellContract,
    (source) =>
      replaceRequired(
        source,
        `  readonly openCommandPalette: () => void
  readonly openSettingsWindow: () => void`,
        `  readonly openCommandPalette: () => void
  readonly openDeveloperTools: () => void
  readonly openSettingsWindow: () => void`,
        'WorkspaceShellActions 开发者工具契约',
      ),
  )

  console.log(
    changed
      ? '✅ 已更新 WorkspaceShellActions 契约'
      : '⏭️ WorkspaceShellActions 契约无需修改',
  )
}

async function updateWorkspaceShell() {
  const changed = await updateFile(
    paths.workspaceShell,
    (source) =>
      replaceRequired(
        source,
        `        onSettingsOpen={actions.openSettingsWindow}
      />`,
        `        onDeveloperToolsOpen={actions.openDeveloperTools}
        onSettingsOpen={actions.openSettingsWindow}
      />`,
        '向 ActivityRail 传递开发者工具动作',
      ),
  )

  console.log(
    changed
      ? '✅ 已更新 WorkspaceShell'
      : '⏭️ WorkspaceShell 无需修改',
  )
}

async function updateActivityRail() {
  const changed = await updateFile(
    paths.activityRail,
    (initialSource) => {
      let source = initialSource

      source = replaceRequired(
        source,
        `  CircleHelp,
  ExternalLink,`,
        `  CircleHelp,
  Code2,
  ExternalLink,`,
        '导入开发者工具图标',
      )

      source = replaceRequired(
        source,
        `  readonly onSettingsOpen: () => void
}`,
        `  readonly onDeveloperToolsOpen: () => void

  readonly onSettingsOpen: () => void
}`,
        'ActivityRailProps 开发者工具回调',
      )

      source = replaceRequired(
        source,
        `  onItemActivate,
  onSettingsOpen,
}: ActivityRailProps) {`,
        `  onItemActivate,
  onDeveloperToolsOpen,
  onSettingsOpen,
}: ActivityRailProps) {`,
        'ActivityRail 开发者工具参数',
      )

      source = replaceRequired(
        source,
        `        <HelpMenu />`,
        `        <HelpMenu
          onDeveloperToolsOpen={onDeveloperToolsOpen}
        />`,
        '向 HelpMenu 传递开发者工具回调',
      )

      source = replaceRequired(
        source,
        `function HelpMenu() {
  return (`,
        `function HelpMenu({
  onDeveloperToolsOpen,
}: {
  readonly onDeveloperToolsOpen: () => void
}) {
  return (`,
        'HelpMenu 开发者工具参数',
      )

      source = replaceRequired(
        source,
        `          <HelpMenuItem
            icon={MessageCircle}
            label="反馈"
          />`,
        `          <HelpMenuItem
            icon={Code2}
            label="开发者工具"
            onClick={onDeveloperToolsOpen}
          />`,
        '将反馈替换为开发者工具',
      )

      return source
    },
  )

  console.log(
    changed
      ? '✅ 已将反馈菜单改为开发者工具'
      : '⏭️ 开发者工具菜单已存在',
  )
}

async function verifyResult() {
  const [
    cargoSource,
    rustWindowSource,
    bootstrapSource,
    adapterSource,
    appShellSource,
    containerSource,
    contractSource,
    workspaceShellSource,
    activityRailSource,
  ] = await Promise.all([
    readFile(paths.workspaceCargo, 'utf8'),
    readFile(paths.rustWindowCommands, 'utf8'),
    readFile(paths.rustBootstrap, 'utf8'),
    readFile(paths.nativeWindowAdapter, 'utf8'),
    readFile(paths.appShell, 'utf8'),
    readFile(paths.workspaceContainer, 'utf8'),
    readFile(paths.shellContract, 'utf8'),
    readFile(paths.workspaceShell, 'utf8'),
    readFile(paths.activityRail, 'utf8'),
  ])

  const checks = [
    {
      passed: cargoSource.includes(
        'features = ["devtools"]',
      ),
      message: 'Tauri devtools feature 未启用',
    },
    {
      passed: rustWindowSource.includes(
        'pub async fn window_open_devtools',
      ),
      message: 'Rust 开发者工具命令不存在',
    },
    {
      passed: rustWindowSource.includes(
        'window.open_devtools()',
      ),
      message: 'Rust 命令没有打开开发者工具',
    },
    {
      passed: bootstrapSource.includes(
        'commands::window::window_open_devtools',
      ),
      message: 'Rust 命令未注册',
    },
    {
      passed: adapterSource.includes(
        'openDeveloperTools(): Promise<void>',
      ),
      message: 'MainWindowController 接口未更新',
    },
    {
      passed: adapterSource.includes(
        "invoke('window_open_devtools'",
      ),
      message: 'MainWindowController 未调用 Rust 命令',
    },
    {
      passed: appShellSource.includes(
        'const openDeveloperTools = useCallback',
      ),
      message: 'AppShell 缺少开发者工具回调',
    },
    {
      passed: containerSource.includes(
        'openDeveloperTools: onDeveloperToolsOpen',
      ),
      message: 'WorkspaceContainer 未连接开发者工具动作',
    },
    {
      passed: contractSource.includes(
        'readonly openDeveloperTools: () => void',
      ),
      message: 'WorkspaceShellActions 契约未更新',
    },
    {
      passed: workspaceShellSource.includes(
        'onDeveloperToolsOpen={actions.openDeveloperTools}',
      ),
      message: 'WorkspaceShell 未连接 ActivityRail',
    },
    {
      passed: activityRailSource.includes(
        'label="开发者工具"',
      ),
      message: '帮助菜单中不存在开发者工具',
    },
    {
      passed: activityRailSource.includes(
        'onClick={onDeveloperToolsOpen}',
      ),
      message: '开发者工具菜单没有点击行为',
    },
    {
      passed: !activityRailSource.includes(
        'label="反馈"',
      ),
      message: '旧反馈菜单仍然残留',
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

  console.log('✅ 开发者工具调用链验证完成')
  console.log('✅ 旧反馈菜单已删除干净')
}

async function main() {
  try {
    await enableTauriDevtools()
    await addRustDevtoolsCommand()
    await registerRustDevtoolsCommand()
    await updateNativeWindowAdapter()
    await updateAppShell()
    await updateWorkspaceContainer()
    await updateShellContract()
    await updateWorkspaceShell()
    await updateActivityRail()
    await verifyResult()

    if (process.exitCode) {
      return
    }

    console.log('')
    console.log('🎉 开发者工具菜单添加完成')
    console.log('')
    console.log('请执行：')
    console.log('  pnpm format')
    console.log('  pnpm typecheck')
    console.log('  cargo fmt --check')
    console.log('  cargo check --workspace --all-targets --all-features')
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