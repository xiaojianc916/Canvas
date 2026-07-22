#!/usr/bin/env node

/**
 * Refactor custom titlebar window dragging.
 *
 * Architecture:
 *
 * React titlebar
 *   -> MainWindowController port
 *   -> Tauri official Window API
 *   -> native window
 *
 * This removes the duplicate custom Rust IPC path for:
 * - start dragging
 * - minimize
 * - toggle maximize
 *
 * Close/destroy remains under the existing application termination boundary.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const PATHS = Object.freeze({
  capability: 'apps/desktop/src-tauri/capabilities/main-window.json',
  tauriBootstrap: 'apps/desktop/src-tauri/src/bootstrap/app.rs',
  rustWindowCommands: 'apps/desktop/src-tauri/src/commands/window.rs',
  nativeWindow:
    'platforms/desktop-runtime/src/adapters/native-window.ts',
  titleBar:
    'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx',
  architectureCheck:
    'tests/architecture/check-window-dragging.mjs',
  packageJson: 'package.json',
})

const REQUIRED_PERMISSIONS = Object.freeze([
  'core:window:allow-minimize',
  'core:window:allow-toggle-maximize',
  'core:window:allow-start-dragging',
])

const ARCHITECTURE_CHECK_COMMAND =
  'node tests/architecture/check-window-dragging.mjs'

function absolute(relativePath) {
  return path.join(ROOT, relativePath)
}

function assertRepositoryRoot() {
  const requiredFiles = [
    PATHS.capability,
    PATHS.tauriBootstrap,
    PATHS.rustWindowCommands,
    PATHS.nativeWindow,
    PATHS.titleBar,
    PATHS.packageJson,
  ]

  const missing = requiredFiles.filter(
    (relativePath) => !fs.existsSync(absolute(relativePath)),
  )

  if (missing.length > 0) {
    throw new Error(
      [
        '当前目录不是预期的 Canvas 仓库根目录。',
        ...missing.map((file) => `- 缺少 ${file}`),
      ].join('\n'),
    )
  }
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8')
}

function parseJson(relativePath) {
  const source = readText(relativePath)

  try {
    return JSON.parse(source)
  } catch (cause) {
    throw new Error(
      `${relativePath} 不是合法 JSON：${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
  }
}

function writeAtomic(relativePath, content) {
  const target = absolute(relativePath)
  const temporary = `${target}.${process.pid}.tmp`

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temporary, content, 'utf8')
  fs.renameSync(temporary, target)

  console.log(`updated ${relativePath}`)
}

function writeJson(relativePath, value) {
  writeAtomic(relativePath, `${JSON.stringify(value, null, 2)}\n`)
}

function replaceRequired(source, search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`无法定位修改点：${description}`)
  }

  return source.replace(search, replacement)
}

function removeRequired(source, search, description) {
  if (!source.includes(search)) {
    // 支持脚本重复执行。
    return source
  }

  return source.replace(search, '')
}

function updateCapability() {
  const capability = parseJson(PATHS.capability)

  if (!Array.isArray(capability.windows)) {
    throw new Error(`${PATHS.capability} 缺少 windows`)
  }

  if (!capability.windows.includes('main')) {
    throw new Error(`${PATHS.capability} 没有授权 main 窗口`)
  }

  if (!Array.isArray(capability.permissions)) {
    throw new Error(`${PATHS.capability} 缺少 permissions`)
  }

  const permissions = capability.permissions.filter(
    (permission) =>
      permission !== 'core:window:allow-maximize',
  )

  for (const permission of REQUIRED_PERMISSIONS) {
    if (!permissions.includes(permission)) {
      permissions.push(permission)
    }
  }

  capability.permissions = permissions

  writeJson(PATHS.capability, capability)
}

function refactorNativeWindowAdapter() {
  let source = readText(PATHS.nativeWindow)

  const helper = `
async function getMainWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const window = getCurrentWindow()

  if (window.label !== MAIN_WINDOW_LABEL) {
    throw new Error(
      \`Expected window "\${MAIN_WINDOW_LABEL}", received "\${window.label}".\`,
    )
  }

  return window
}
`

  if (!source.includes('async function getMainWindow()')) {
    source = replaceRequired(
      source,
      "const MAIN_WINDOW_LABEL = 'main'\n",
      `const MAIN_WINDOW_LABEL = 'main'\n${helper}`,
      'MainWindowController 官方窗口解析函数',
    )
  }

  source = source.replace(
    /minimize:\s*\(\)\s*=>\s*invoke\('window_minimize',\s*\{\s*label:\s*MAIN_WINDOW_LABEL\s*\}\),/,
    `async minimize() {
      const window = await getMainWindow()
      await window.minimize()
    },`,
  )

  source = source.replace(
    /toggleMaximize:\s*\(\)\s*=>\s*invoke\('window_maximize',\s*\{\s*label:\s*MAIN_WINDOW_LABEL\s*\}\),/,
    `async toggleMaximize() {
      const window = await getMainWindow()
      await window.toggleMaximize()
    },`,
  )

  source = source.replace(
    /startDragging:\s*\(\)\s*=>\s*invoke\('window_start_dragging',\s*\{\s*label:\s*MAIN_WINDOW_LABEL\s*\}\),/,
    `async startDragging() {
      const window = await getMainWindow()
      await window.startDragging()
    },`,
  )

  if (source.includes("invoke('window_start_dragging'")) {
    throw new Error('未能删除自建 window_start_dragging IPC')
  }

  if (source.includes("invoke('window_minimize'")) {
    throw new Error('未能删除自建 window_minimize IPC')
  }

  if (source.includes("invoke('window_maximize'")) {
    throw new Error('未能删除自建 window_maximize IPC')
  }

  writeAtomic(PATHS.nativeWindow, source)
}

function removeObsoleteRustCommandRegistration() {
  let source = readText(PATHS.tauriBootstrap)

  source = removeRequired(
    source,
    '            commands::window::window_start_dragging,\n',
    '不存在的 window_start_dragging Rust 命令注册',
  )

  source = removeRequired(
    source,
    '            commands::window::window_minimize,\n',
    '旧 window_minimize Rust 命令注册',
  )

  source = removeRequired(
    source,
    '            commands::window::window_maximize,\n',
    '旧 window_maximize Rust 命令注册',
  )

  writeAtomic(PATHS.tauriBootstrap, source)
}

function removeObsoleteRustCommands() {
  let source = readText(PATHS.rustWindowCommands)

  const minimizeCommand =
    /#\[command\]\npub async fn window_minimize\([\s\S]*?\n}\n\n/

  const maximizeCommand =
    /#\[command\]\npub async fn window_maximize\([\s\S]*?\n}\n\n/

  source = source.replace(minimizeCommand, '')
  source = source.replace(maximizeCommand, '')

  if (source.includes('pub async fn window_minimize(')) {
    throw new Error('未能删除旧 window_minimize Rust 命令')
  }

  if (source.includes('pub async fn window_maximize(')) {
    throw new Error('未能删除旧 window_maximize Rust 命令')
  }

  writeAtomic(PATHS.rustWindowCommands, source)
}

function refactorTitleBar() {
  let source = readText(PATHS.titleBar)

  const interactiveSelector = `
const WINDOW_DRAG_EXCLUSION_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[data-window-drag-exclude]',
].join(',')
`

  if (!source.includes('WINDOW_DRAG_EXCLUSION_SELECTOR')) {
    source = replaceRequired(
      source,
      "import { Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react'\n",
      `import { Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react'\n${interactiveSelector}`,
      '标题栏交互元素排除规则',
    )
  }

  const oldHandler = `  function handleDragMouseDown(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) {
      return
    }
    if (event.detail === 2) {
      onMaximize()
      return
    }
    onStartDragging()
  }`

  const newHandler = `  function handleDragMouseDown(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0) {
      return
    }

    const target = event.target

    if (
      !(target instanceof Element) ||
      target.closest(WINDOW_DRAG_EXCLUSION_SELECTOR)
    ) {
      return
    }

    // Prevent text selection and drag-image behavior before transferring
    // pointer ownership to the native window manager.
    event.preventDefault()

    if (event.detail === 2) {
      onMaximize()
      return
    }

    onStartDragging()
  }`

  if (source.includes(oldHandler)) {
    source = source.replace(oldHandler, newHandler)
  } else if (!source.includes('WINDOW_DRAG_EXCLUSION_SELECTOR)')) {
    throw new Error('无法定位 DesktopTitleBar 拖动处理器')
  }

  // 只保留手动 startDragging 这一条路径。
  // 不再同时混用 data-tauri-drag-region。
  source = source.replace(/\sdata-tauri-drag-region/g, '')

  source = source.replace(
    'onMouseDown={handleDragMouseDown}',
    'onMouseDownCapture={handleDragMouseDown}',
  )

  source = source.replace(
    '{/* Chrome owns drag behavior; only button elements opt out. */}',
    `{/*
          The titlebar owns one drag path through MainWindowController.
          Interactive descendants explicitly opt out.
        */}`,
  )

  if (source.includes('data-tauri-drag-region')) {
    throw new Error('标题栏仍残留 data-tauri-drag-region 双轨逻辑')
  }

  if (!source.includes('onMouseDownCapture={handleDragMouseDown}')) {
    throw new Error('标题栏没有在捕获阶段接管拖动事件')
  }

  writeAtomic(PATHS.titleBar, source)
}

function installArchitectureCheck() {
  const source = `#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: architecture checks intentionally write output. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const failures = []

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

const capability = JSON.parse(
  read('apps/desktop/src-tauri/capabilities/main-window.json'),
)

for (const permission of [
  'core:window:allow-minimize',
  'core:window:allow-toggle-maximize',
  'core:window:allow-start-dragging',
]) {
  if (!capability.permissions?.includes(permission)) {
    failures.push(\`main window 缺少权限：\${permission}\`)
  }
}

const adapter = read(
  'platforms/desktop-runtime/src/adapters/native-window.ts',
)

for (const officialCall of [
  'window.minimize()',
  'window.toggleMaximize()',
  'window.startDragging()',
]) {
  if (!adapter.includes(officialCall)) {
    failures.push(\`窗口适配器缺少官方调用：\${officialCall}\`)
  }
}

for (const obsoleteInvoke of [
  "invoke('window_minimize'",
  "invoke('window_maximize'",
  "invoke('window_start_dragging'",
]) {
  if (adapter.includes(obsoleteInvoke)) {
    failures.push(\`窗口适配器仍使用旧 IPC：\${obsoleteInvoke}\`)
  }
}

const titleBar = read(
  'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx',
)

if (!titleBar.includes('onMouseDownCapture={handleDragMouseDown}')) {
  failures.push('DesktopTitleBar 必须在捕获阶段处理拖动')
}

if (!titleBar.includes('WINDOW_DRAG_EXCLUSION_SELECTOR')) {
  failures.push('DesktopTitleBar 缺少交互元素排除规则')
}

if (titleBar.includes('data-tauri-drag-region')) {
  failures.push(
    'DesktopTitleBar 禁止同时混用 data-tauri-drag-region 与手动拖动',
  )
}

const bootstrap = read(
  'apps/desktop/src-tauri/src/bootstrap/app.rs',
)

for (const obsoleteCommand of [
  'window_start_dragging',
  'window_minimize',
  'window_maximize',
]) {
  if (bootstrap.includes(\`commands::window::\${obsoleteCommand}\`)) {
    failures.push(\`Rust bootstrap 仍注册旧命令：\${obsoleteCommand}\`)
  }
}

if (failures.length > 0) {
  console.error(
    [
      'Window dragging architecture checks failed:',
      ...failures.map((failure) => \`- \${failure}\`),
    ].join('\\n'),
  )

  process.exitCode = 1
} else {
  console.log('Window dragging architecture checks passed.')
}
`

  writeAtomic(PATHS.architectureCheck, source)
}

function registerArchitectureCheck() {
  const packageJson = parseJson(PATHS.packageJson)
  const currentCommand = packageJson.scripts?.['test:architecture']

  if (typeof currentCommand !== 'string') {
    throw new Error('package.json 缺少 test:architecture')
  }

  const commands = currentCommand
    .split('&&')
    .map((command) => command.trim())
    .filter(
      (command) =>
        command.length > 0 &&
        command !== ARCHITECTURE_CHECK_COMMAND,
    )

  packageJson.scripts['test:architecture'] = [
    ...commands,
    ARCHITECTURE_CHECK_COMMAND,
  ].join(' && ')

  writeJson(PATHS.packageJson, packageJson)
}

function main() {
  assertRepositoryRoot()

  updateCapability()
  refactorNativeWindowAdapter()
  removeObsoleteRustCommandRegistration()
  removeObsoleteRustCommands()
  refactorTitleBar()
  installArchitectureCheck()
  registerArchitectureCheck()

  console.log(`
Window dragging refactor completed.

新的唯一调用链：

  DesktopTitleBar
    -> MainWindowController
    -> @tauri-apps/api/window
    -> native window manager

请执行：

  pnpm format
  pnpm lint
  pnpm test:architecture
  pnpm typecheck
  pnpm build:desktop
  cargo fmt --all --check
  cargo clippy --workspace --all-targets --all-features -- -D warnings
  cargo test --workspace

手工验证：

1. 按住标题栏空白处拖动窗口。
2. 快速连续拖动。
3. 双击标题栏最大化，再次双击还原。
4. 标签页、按钮、输入框不能误触发拖动。
5. 最小化、最大化、关闭按钮正常。
6. 在未聚焦状态下单击后再次拖动。
`)
}

try {
  main()
} catch (cause) {
  console.error(
    cause instanceof Error ? cause.stack ?? cause.message : String(cause),
  )

  process.exitCode = 1
}