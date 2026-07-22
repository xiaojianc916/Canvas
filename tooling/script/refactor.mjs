#!/usr/bin/env node

/**
 * Window surface architecture refactor
 *
 * 目标：
 * 1. 关闭主窗口透明合成，消除窗口拖动/缩放时露出桌面的根因。
 * 2. 使用 Tauri 官方 backgroundColor 能力设置原生窗口和 WebView 背景。
 * 3. 统一 native window、HTML 首帧、React root、应用 CSS 的 backing surface。
 * 4. 增加架构回归检查，禁止重新开启主窗口透明和颜色漂移。
 * 5. 记录 ADR，明确窗口表面的所有权和禁止的临时修补方案。
 *
 * 特性：
 * - 可重复执行（idempotent）
 * - 原子文件替换
 * - 修改前验证仓库结构
 * - 修改后立即执行专用架构检查
 * - 不引入 resize 监听、强制回流、requestAnimationFrame 重绘循环
 * - 不修改 tldraw Editor/TLStore 生命周期
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const REPOSITORY_ROOT = process.cwd()

const WINDOW_SURFACE = Object.freeze({
  color: '#f3f3f3',
  cssToken: '--window-backing-surface',
  mainWindowLabel: 'main',
})

const PATHS = Object.freeze({
  rootPackage: 'package.json',
  tauriConfig: 'apps/desktop/src-tauri/tauri.conf.json',
  htmlEntry: 'apps/desktop/index.html',
  applicationStyles: 'apps/desktop/src/app.css',
  architectureCheck: 'tests/architecture/check-window-surface.mjs',
  adr: 'docs/adr/ADR-003-opaque-window-surface.md',
})

const WINDOW_SURFACE_CHECK_COMMAND =
  'node tests/architecture/check-window-surface.mjs'

const WINDOW_SURFACE_BOOTSTRAP_STYLE = `    <!--
      Native window, WebView and document bootstrap surface must remain aligned.
      See docs/adr/ADR-003-opaque-window-surface.md.
    -->
    <style id="window-backing-surface">
      :root {
        --window-backing-surface: ${WINDOW_SURFACE.color};
      }

      html,
      body,
      #root {
        width: 100%;
        height: 100%;
        margin: 0;
        background: var(--window-backing-surface);
      }
    </style>`

const ARCHITECTURE_CHECK_SOURCE = `#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: CLI architecture checks intentionally write output. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const WINDOW_SURFACE = Object.freeze({
  color: '${WINDOW_SURFACE.color}',
  cssToken: '${WINDOW_SURFACE.cssToken}',
  mainWindowLabel: '${WINDOW_SURFACE.mainWindowLabel}',
})

const PATHS = Object.freeze({
  tauriConfig: 'apps/desktop/src-tauri/tauri.conf.json',
  htmlEntry: 'apps/desktop/index.html',
  applicationStyles: 'apps/desktop/src/app.css',
})

const failures = []

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath)

  if (!fs.existsSync(absolutePath)) {
    failures.push(\`缺少窗口表面契约文件：\${relativePath}\`)
    return ''
  }

  return fs.readFileSync(absolutePath, 'utf8')
}

function normalize(value) {
  return value.trim().toLowerCase()
}

function checkTauriWindowSurface() {
  const source = read(PATHS.tauriConfig)

  if (!source) {
    return
  }

  let config

  try {
    config = JSON.parse(source)
  } catch (cause) {
    failures.push(
      \`Tauri 配置不是合法 JSON：\${
        cause instanceof Error ? cause.message : String(cause)
      }\`,
    )
    return
  }

  const windows = config.app?.windows

  if (!Array.isArray(windows)) {
    failures.push('Tauri 配置缺少 app.windows')
    return
  }

  const mainWindows = windows.filter(
    (windowConfig) =>
      windowConfig?.label === WINDOW_SURFACE.mainWindowLabel,
  )

  if (mainWindows.length !== 1) {
    failures.push(
      \`必须且只能存在一个 label="\${WINDOW_SURFACE.mainWindowLabel}" 的主窗口\`,
    )
    return
  }

  const [mainWindow] = mainWindows

  if (mainWindow.transparent !== false) {
    failures.push(
      '主窗口必须显式配置 transparent: false；禁止依赖默认值或透明合成',
    )
  }

  if (
    normalize(String(mainWindow.backgroundColor ?? '')) !==
    WINDOW_SURFACE.color
  ) {
    failures.push(
      \`主窗口 backgroundColor 必须为 \${WINDOW_SURFACE.color}\`,
    )
  }

  if (mainWindow.resizable !== true) {
    failures.push('主窗口必须保持 resizable: true')
  }
}

function checkHtmlBootstrapSurface() {
  const source = read(PATHS.htmlEntry)
  const normalized = source.toLowerCase()

  if (
    !normalized.includes(
      \`content="\${WINDOW_SURFACE.color}" name="theme-color"\`,
    )
  ) {
    failures.push(
      \`HTML theme-color 必须为 \${WINDOW_SURFACE.color}\`,
    )
  }

  if (!source.includes('id="window-backing-surface"')) {
    failures.push('HTML 缺少首帧 window-backing-surface 样式')
  }

  if (
    !normalized.includes(
      \`\${WINDOW_SURFACE.cssToken}: \${WINDOW_SURFACE.color}\`,
    )
  ) {
    failures.push(
      \`HTML 首帧必须声明 \${WINDOW_SURFACE.cssToken}: \${WINDOW_SURFACE.color}\`,
    )
  }

  if (
    !normalized.includes(
      \`background: var(\${WINDOW_SURFACE.cssToken})\`,
    )
  ) {
    failures.push('HTML 首帧根节点没有使用窗口 backing surface token')
  }

  const styleIndex = normalized.indexOf(
    'id="window-backing-surface"',
  )
  const applicationScriptIndex = normalized.indexOf(
    'src="/src/main.tsx"',
  )

  if (
    styleIndex < 0 ||
    applicationScriptIndex < 0 ||
    styleIndex > applicationScriptIndex
  ) {
    failures.push('窗口 backing surface 必须在应用脚本执行前声明')
  }
}

function checkApplicationSurface() {
  const source = read(PATHS.applicationStyles)
  const normalized = source.toLowerCase()

  if (
    !normalized.includes(
      \`\${WINDOW_SURFACE.cssToken}: \${WINDOW_SURFACE.color}\`,
    )
  ) {
    failures.push(
      \`应用 CSS 必须声明 \${WINDOW_SURFACE.cssToken}: \${WINDOW_SURFACE.color}\`,
    )
  }

  if (
    !normalized.includes(
      \`background: var(\${WINDOW_SURFACE.cssToken})\`,
    )
  ) {
    failures.push('应用根节点必须使用窗口 backing surface token')
  }

  const rootSurfacePattern =
    /html\\s*,\\s*body\\s*,\\s*#root\\s*\\{[\\s\\S]*?background:\\s*var\\(--window-backing-surface\\)/i

  if (!rootSurfacePattern.test(source)) {
    failures.push(
      'html、body、#root 必须共同使用 --window-backing-surface',
    )
  }
}

checkTauriWindowSurface()
checkHtmlBootstrapSurface()
checkApplicationSurface()

if (failures.length > 0) {
  console.error(
    [
      'Window surface architecture checks failed:',
      ...failures.map((failure) => \`- \${failure}\`),
    ].join('\\n'),
  )

  process.exitCode = 1
} else {
  console.log('Window surface architecture checks passed.')
}
`

const ADR_SOURCE = `# ADR-003: Opaque window surface for resize stability

- Status: Accepted
- Date: 2026-07-22
- Owners: Desktop application composition root

## Context

Hybrid Canvas 使用 Tauri 2 承载 React、tldraw 和 WebView2。

主窗口原先同时配置了：

\`\`\`json
{
  "decorations": false,
  "transparent": true
}
\`\`\`

产品使用自绘标题栏，但并不需要让桌面内容穿透主编辑窗口。无边框窗口和透明窗口是两个不同的能力；自绘标题栏只要求关闭系统 decorations，不要求开启透明合成。

在 Windows live move/live resize 期间，以下表面可能在不同时间完成提交：

1. 操作系统原生窗口；
2. WebView2 controller surface；
3. HTML document；
4. React/tldraw 渲染内容。

当原生窗口本身透明时，WebView 尚未提交新尺寸帧的区域会直接露出桌面或后方窗口。CSS、React 和 tldraw 无法绘制尚未由 WebView 提交的原生区域，因此在前端增加 resize 监听或强制重绘不能解决该边界问题。

## Decision

主编辑窗口采用不透明 backing surface。

唯一允许的 backing surface 颜色为：

\`\`\`text
${WINDOW_SURFACE.color}
\`\`\`

该颜色必须同时存在于三个层级：

1. **Tauri WindowConfig**
   - \`transparent: false\`
   - \`backgroundColor: "${WINDOW_SURFACE.color}"\`
   - 负责原生窗口与 WebView 默认表面。

2. **HTML bootstrap surface**
   - 在应用模块脚本执行前声明。
   - 负责 CSS bundle、React 和 tldraw 初始化前的首帧。

3. **Application root surface**
   - \`html\`、\`body\`、\`#root\` 使用
     \`${WINDOW_SURFACE.cssToken}\`。
   - 负责应用运行期的根表面。

仓库必须通过
\`tests/architecture/check-window-surface.mjs\`
验证三个层级没有发生漂移。

## Explicitly rejected approaches

以下方案不得作为该问题的修复：

- 在 \`resize\` 事件中调用 React 强制更新；
- 在拖动期间反复修改 DOM 尺寸；
- 使用 \`requestAnimationFrame\` 运行持续重绘循环；
- 通过读取 \`offsetWidth\` 强制同步 layout；
- 重挂载 tldraw Editor 或 TLStore；
- 为视觉问题建立第二套 canvas 状态；
- 使用任意 Win32 hook 绕过 Tauri/WebView2；
- 通过扩大 IPC 权限让前端直接操作原生窗口句柄；
- 使用透明窗口后再用额外 DOM 层模拟不透明背景。

这些方案位于错误的所有权边界，会增加主线程工作、破坏 Editor 生命周期，或制造平台特有技术债。

## Consequences

### Positive

- 窗口拖动和缩放期间，未及时提交的区域显示稳定的
  \`${WINDOW_SURFACE.color}\`，而不是桌面内容。
- 应用启动、CSS 加载和 React 初始化阶段使用同一底色。
- 不向 tldraw Editor、TLStore 或 React 状态引入窗口生命周期逻辑。
- 架构检查可阻止后续提交重新开启主窗口透明。

### Limitations

该决策消除的是透明合成导致的桌面露出，并提供确定的 backing surface。

它不承诺消除所有 GPU、显卡驱动或 WebView2 内容重绘延迟。即使复杂画布内容暂时没有跟上窗口尺寸，用户看到的也应是规定的 backing surface，而不是后方窗口。

## Extension rule

未来若确实需要透明窗口效果，必须：

1. 使用独立窗口，而不是主编辑窗口；
2. 提交新的 ADR；
3. 明确平台兼容矩阵；
4. 提供性能基准和降级路径；
5. 不改变主窗口的不透明表面契约。

## Official references

- Tauri 2 WindowConfig:
  https://v2.tauri.app/reference/config/
- Tauri window customization:
  https://v2.tauri.app/learn/window-customization/
- Microsoft WebView2 rendering APIs:
  https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/overview-features-apis
`

function absolute(relativePath) {
  return path.join(REPOSITORY_ROOT, relativePath)
}

function assertRepositoryRoot() {
  const requiredFiles = [
    'package.json',
    'Cargo.toml',
    'apps/desktop/src-tauri/tauri.conf.json',
    'apps/desktop/index.html',
    'apps/desktop/src/app.css',
    'tests/architecture/check-ui-architecture.mjs',
  ]

  const missingFiles = requiredFiles.filter(
    (relativePath) => !fs.existsSync(absolute(relativePath)),
  )

  if (missingFiles.length > 0) {
    throw new Error(
      [
        '当前目录不是预期的 Hybrid Canvas 仓库根目录。',
        '缺少以下文件：',
        ...missingFiles.map((file) => `- ${file}`),
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

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function writeAtomic(relativePath, content) {
  const targetPath = absolute(relativePath)
  const parentDirectory = path.dirname(targetPath)
  const temporaryPath = `${targetPath}.window-surface-${process.pid}.tmp`

  fs.mkdirSync(parentDirectory, { recursive: true })
  fs.writeFileSync(temporaryPath, content, 'utf8')
  fs.renameSync(temporaryPath, targetPath)

  console.log(`updated ${relativePath}`)
}

function replaceExactlyOnce(source, search, replacement, description) {
  const firstIndex = source.indexOf(search)

  if (firstIndex < 0) {
    throw new Error(`无法定位修改点：${description}`)
  }

  if (source.indexOf(search, firstIndex + search.length) >= 0) {
    throw new Error(`修改点不是唯一的：${description}`)
  }

  return (
    source.slice(0, firstIndex) +
    replacement +
    source.slice(firstIndex + search.length)
  )
}

function refactorTauriWindowConfiguration() {
  const config = parseJson(PATHS.tauriConfig)
  const windows = config.app?.windows

  if (!Array.isArray(windows)) {
    throw new Error(`${PATHS.tauriConfig} 缺少 app.windows`)
  }

  const mainWindows = windows.filter(
    (windowConfig) =>
      windowConfig?.label === WINDOW_SURFACE.mainWindowLabel,
  )

  if (mainWindows.length !== 1) {
    throw new Error(
      `必须且只能找到一个 label="${WINDOW_SURFACE.mainWindowLabel}" 的窗口`,
    )
  }

  const [mainWindow] = mainWindows

  // 自绘标题栏与透明窗口是独立能力。
  // 保留 decorations: false，但主编辑窗口必须不透明。
  mainWindow.decorations = false
  mainWindow.transparent = false
  mainWindow.backgroundColor = WINDOW_SURFACE.color

  writeAtomic(PATHS.tauriConfig, serializeJson(config))
}

function refactorHtmlBootstrapSurface() {
  let source = readText(PATHS.htmlEntry)

  source = source.replace(
    /<meta\s+content="[^"]*"\s+name="theme-color"\s*\/>/i,
    `<meta content="${WINDOW_SURFACE.color}" name="theme-color" />`,
  )

  if (!source.includes(`name="theme-color"`)) {
    throw new Error(`${PATHS.htmlEntry} 缺少 theme-color meta`)
  }

  const existingStylePattern =
    /\s*<!--[\s\S]*?See docs\/adr\/ADR-003-opaque-window-surface\.md\.[\s\S]*?-->\s*<style id="window-backing-surface">[\s\S]*?<\/style>/i

  if (existingStylePattern.test(source)) {
    source = source.replace(
      existingStylePattern,
      `\n${WINDOW_SURFACE_BOOTSTRAP_STYLE}`,
    )
  } else {
    source = replaceExactlyOnce(
      source,
      '    <title>Hybrid Canvas</title>',
      `${WINDOW_SURFACE_BOOTSTRAP_STYLE}\n    <title>Hybrid Canvas</title>`,
      'HTML title 前的 bootstrap surface',
    )
  }

  // 同时清理已有的非规范空格，减少无关格式噪声。
  source = source.replace(
    '<script src="/src/main.tsx" type="module" ></script>',
    '<script src="/src/main.tsx" type="module"></script>',
  )

  writeAtomic(PATHS.htmlEntry, source)
}

function refactorApplicationRootSurface() {
  let source = readText(PATHS.applicationStyles)

  const hasUtf8Bom = source.charCodeAt(0) === 0xfeff
  const bom = hasUtf8Bom ? '\uFEFF' : ''

  if (hasUtf8Bom) {
    source = source.slice(1)
  }

  const rootBlockStart = source.indexOf(':root {')

  if (rootBlockStart < 0) {
    throw new Error(`${PATHS.applicationStyles} 缺少 :root token 区域`)
  }

  if (
    !source.includes(
      `${WINDOW_SURFACE.cssToken}: ${WINDOW_SURFACE.color};`,
    )
  ) {
    source =
      source.slice(0, rootBlockStart + ':root {'.length) +
      `\n  ${WINDOW_SURFACE.cssToken}: ${WINDOW_SURFACE.color};` +
      source.slice(rootBlockStart + ':root {'.length)
  }

  const rootSurfacePattern =
    /html,\s*\nbody,\s*\n#root\s*\{[\s\S]*?\n\}/

  const rootSurfaceMatch = source.match(rootSurfacePattern)

  if (!rootSurfaceMatch) {
    throw new Error(
      `${PATHS.applicationStyles} 缺少 html/body/#root 根表面规则`,
    )
  }

  const replacement = `html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
  background: var(${WINDOW_SURFACE.cssToken});
}`

  source = source.replace(rootSurfacePattern, replacement)

  // body 不再重复拥有独立的窗口底色。
  // 根表面的事实所有者是上面的 html/body/#root 组合规则。
  source = source.replace(
    /(\nbody\s*\{[\s\S]*?)\n\s*background:\s*#f3f3f3;([\s\S]*?\n\})/i,
    '$1$2',
  )

  writeAtomic(PATHS.applicationStyles, `${bom}${source}`)
}

function installArchitectureCheck() {
  writeAtomic(PATHS.architectureCheck, ARCHITECTURE_CHECK_SOURCE)
}

function registerArchitectureCheck() {
  const packageJson = parseJson(PATHS.rootPackage)
  const scripts = packageJson.scripts

  if (!scripts || typeof scripts !== 'object') {
    throw new Error(`${PATHS.rootPackage} 缺少 scripts`)
  }

  const currentCommand = scripts['test:architecture']

  if (typeof currentCommand !== 'string' || currentCommand.length === 0) {
    throw new Error(`${PATHS.rootPackage} 缺少 test:architecture`)
  }

  const commands = currentCommand
    .split('&&')
    .map((command) => command.trim())
    .filter(Boolean)

  const filteredCommands = commands.filter(
    (command) => command !== WINDOW_SURFACE_CHECK_COMMAND,
  )

  scripts['test:architecture'] = [
    ...filteredCommands,
    WINDOW_SURFACE_CHECK_COMMAND,
  ].join(' && ')

  writeAtomic(PATHS.rootPackage, serializeJson(packageJson))
}

function writeArchitectureDecisionRecord() {
  writeAtomic(PATHS.adr, ADR_SOURCE)
}

function runWindowSurfaceCheck() {
  const result = spawnSync(
    process.execPath,
    [PATHS.architectureCheck],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  )

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if (result.status !== 0) {
    throw new Error(
      `窗口表面架构检查失败，退出码：${String(result.status)}`,
    )
  }
}

function printNextSteps() {
  console.log(`
Window surface architecture refactor completed.

关键不变量：
- main.transparent = false
- main.backgroundColor = ${WINDOW_SURFACE.color}
- HTML bootstrap surface = ${WINDOW_SURFACE.color}
- application root surface = var(${WINDOW_SURFACE.cssToken})
- architecture regression check installed

请继续执行完整验证：

  pnpm format
  pnpm lint
  pnpm test:architecture
  pnpm typecheck
  pnpm test
  pnpm build:desktop
  cargo fmt --all --check
  cargo clippy --workspace --all-targets --all-features -- -D warnings
  cargo test --workspace

Windows 手工验收：

1. 快速拖动主窗口，检查四边和底部。
2. 连续快速缩放窗口，特别观察右边缘和底边。
3. 最大化、还原后立即拖动。
4. 在浅色和深色桌面背景上分别测试。
5. 在不同 DPI 显示器之间拖动并缩放。
6. 确认内容未及时重绘时只出现 ${WINDOW_SURFACE.color}，
   不出现桌面、其他窗口、白色或透明区域。
`)
}

function main() {
  assertRepositoryRoot()

  refactorTauriWindowConfiguration()
  refactorHtmlBootstrapSurface()
  refactorApplicationRootSurface()
  installArchitectureCheck()
  registerArchitectureCheck()
  writeArchitectureDecisionRecord()

  runWindowSurfaceCheck()
  printNextSteps()
}

try {
  main()
} catch (cause) {
  console.error(
    [
      'Window surface architecture refactor failed.',
      cause instanceof Error ? cause.stack ?? cause.message : String(cause),
      '',
      '脚本已停止。请先检查错误，不要在未验证的状态下提交。',
    ].join('\n'),
  )

  process.exitCode = 1
}