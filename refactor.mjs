#!/usr/bin/env node

import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const files = {
  officialUi: path.join(
    root,
    'editor/core/src/react/TldrawOfficialUi.tsx',
  ),

  editorCanvas: path.join(
    root,
    'editor/core/src/react/EditorCanvas.tsx',
  ),

  workspaceContainer: path.join(
    root,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  workspaceShell: path.join(
    root,
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ),

  appCss: path.join(
    root,
    'apps/desktop/src/app.css',
  ),
}

await verifyFiles()

await writeFile(
  files.officialUi,
  createOfficialUiSource(),
  'utf8',
)

await removeVisibleStyleTitle()
await disableLegacyInspector()
await patchWorkspaceShell()
await replaceOfficialUiCss()

console.log('')
console.log('修正完成：')
console.log('  - 已删除 Page 1 页面菜单')
console.log('  - 已删除“样式”可见标题')
console.log('  - 已将官方样式内容固定到右侧栏')
console.log('  - 已停用旧 Workspace 检查器')
console.log('  - 颜色使用 tldraw 官方 StylePanelColorPicker')
console.log('')
console.log('请执行：')
console.log('  pnpm typecheck')
console.log('  pnpm build:desktop')
console.log('')

async function verifyFiles() {
  for (const filePath of Object.values(files)) {
    try {
      await access(filePath)
    } catch {
      throw new Error(
        `找不到文件：${path.relative(root, filePath)}\n` +
          '请先执行上一版 apply-tldraw-official-ui.mjs，再执行本脚本。',
      )
    }
  }
}

async function removeVisibleStyleTitle() {
  let source = await readFile(files.editorCanvas, 'utf8')

  /*
   * 删除：
   *
   * <header className="hc-tldraw-style-sidebar__header">
   *   <span>样式</span>
   * </header>
   */
  source = source.replace(
    /\n\s*<header className="hc-tldraw-style-sidebar__header">[\s\S]*?<\/header>\n/,
    '\n',
  )

  source = source.replace(
    'className="hc-tldraw-style-sidebar__content tl-theme__light"',
    'className="hc-tldraw-style-host tl-theme__light"',
  )

  source = source.replace(
    'aria-label="样式"',
    'aria-label="对象属性"',
  )

  await writeFile(files.editorCanvas, source, 'utf8')
}

async function disableLegacyInspector() {
  let source = await readFile(
    files.workspaceContainer,
    'utf8',
  )

  source = source.replace(
    "import { EditorSessionHost, useEditor } from '@hybrid-canvas/canvas/react'",
    "import { EditorSessionHost } from '@hybrid-canvas/canvas/react'",
  )

  source = source.replace(
    "import { useValue } from 'tldraw'\n",
    '',
  )

  source = source.replace(
    "import { CanvasInspectorContent } from './inspector/CanvasInspectorContent'\n",
    '',
  )

  source = source.replace(
    "import { createToolInspectorRegistry } from './inspector/tools/ToolInspectorRegistry'\n",
    '',
  )

  source = source.replace(
    /\n\s*const editor = useEditor\(\)\n\n\s*const inspectorSelectionKey = useValue\([\s\S]*?\}, \[editor\]\)\n/,
    '\n',
  )

  source = source.replace(
    /\n\s*const toolInspectorRegistry = useMemo\([\s\S]*?\[activeEditorSession\],\n\s*\)\n/,
    '\n',
  )

  source = source.replace(
    /\s*inspector=\{\s*<CanvasInspectorContent[\s\S]*?\/>\s*\}\s*inspectorSelectionKey=\{inspectorSelectionKey\}/,
    '\n      inspector={null}',
  )

  source = source.replace(
    /\s*inspectorSelectionKey=\{inspectorSelectionKey\}/,
    '',
  )

  if (
    source.includes('<WorkspaceShell') &&
    !source.includes('inspector={null}')
  ) {
    source = source.replace(
      '<WorkspaceShell\n',
      '<WorkspaceShell\n      inspector={null}\n',
    )
  }

  await writeFile(
    files.workspaceContainer,
    source,
    'utf8',
  )
}

async function patchWorkspaceShell() {
  let source = await readFile(
    files.workspaceShell,
    'utf8',
  )

  /*
   * 即使某些旧状态还保留 isInspectorOpen=true，
   * inspector 为 null 时也绝不能创建右侧空栏。
   */
  source = source.replace(
    'const dockInspector = isInspectorOpen && hasCanvas',
    'const dockInspector = inspector !== null && inspector !== undefined && isInspectorOpen && hasCanvas',
  )

  /*
   * inspector 为 null 时不显示“展开属性面板”按钮。
   */
  source = source.replace(
    'const inspectorRegion = hasCanvas ? (',
    'const inspectorRegion = hasCanvas && inspector !== null && inspector !== undefined ? (',
  )

  await writeFile(
    files.workspaceShell,
    source,
    'utf8',
  )
}

async function replaceOfficialUiCss() {
  let source = await readFile(files.appCss, 'utf8')

  const startMarker =
    '/* hybrid-canvas:tldraw-official-ui */'

  const markerIndex = source.indexOf(startMarker)

  if (markerIndex >= 0) {
    source = source.slice(0, markerIndex).trimEnd()
  }

  source += '\n\n' + createOfficialUiCss() + '\n'

  await writeFile(files.appCss, source, 'utf8')
}

function createOfficialUiSource() {
  return `import {
  DefaultNavigationPanel,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DefaultToolbar,
} from 'tldraw'
import { createPortal } from 'react-dom'

export interface TldrawOfficialUiProps {
  readonly stylePanelHost: HTMLElement | null
}

/**
 * tldraw 官方 UI 的 Canvas 布局适配层。
 *
 * Canvas 只重新安排 UI 位置，不复制：
 * - 工具注册表
 * - selection 状态
 * - 样式状态
 * - 快捷键
 * - Undo/Redo
 * - shape 写入逻辑
 */
export function TldrawOfficialUi({
  stylePanelHost,
}: TldrawOfficialUiProps) {
  return (
    <>
      <div className="hc-tldraw-toolbar">
        <DefaultToolbar
          maxItems={64}
          maxSizePx={1600}
          minItems={8}
          minSizePx={520}
          orientation="horizontal"
        />
      </div>

      <div className="hc-tldraw-navigation">
        <DefaultNavigationPanel />
      </div>

      {stylePanelHost
        ? createPortal(
            <DefaultStylePanel>
              {/*
               * DefaultStylePanelContent 内部包含官方：
               * - StylePanelColorPicker
               * - StylePanelOpacityPicker
               * - StylePanelFillPicker
               * - StylePanelDashPicker
               * - StylePanelSizePicker
               * - StylePanelFontPicker
               * - 文本和标签对齐
               * - Geo / Arrow / Spline 样式
               *
               * StylePanelColorPicker 的选项来自：
               * editor.getCurrentTheme().colors
               *
               * Canvas 不维护硬编码颜色数组。
               */}
              <DefaultStylePanelContent />
            </DefaultStylePanel>,
            stylePanelHost,
          )
        : null}
    </>
  )
}
`
}

function createOfficialUiCss() {
  return `/* hybrid-canvas:tldraw-official-ui */

:root {
  --hc-tldraw-style-sidebar-width: 276px;
}

/*
 * EditorCanvas 自己预留右侧栏空间。
 * StylePanel 不再覆盖画布。
 */
.hc-editor-layout {
  display: grid !important;
  grid-template-columns:
    minmax(0, 1fr)
    var(--hc-tldraw-style-sidebar-width) !important;
  grid-template-rows: minmax(0, 1fr) !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.hc-editor-canvas {
  position: relative;
  grid-column: 1;
  grid-row: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/*
 * 真正的右侧 docked sidebar。
 */
.hc-tldraw-style-sidebar {
  position: relative !important;
  inset: auto !important;
  z-index: 20;
  display: flex;
  grid-column: 2;
  grid-row: 1;
  flex-direction: column;
  width: var(--hc-tldraw-style-sidebar-width);
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--color-divider);
  background: var(--color-background);
  box-shadow: none;
}

/*
 * 不显示额外“样式”标题。
 * 官方内容直接从侧栏顶部开始。
 */
.hc-tldraw-style-sidebar__header {
  display: none !important;
}

.hc-tldraw-style-host {
  position: relative !important;
  inset: auto !important;
  display: block;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--color-background);
}

/*
 * DefaultStylePanel 原本是浮动面板。
 *
 * 同时指定两个 class，覆盖 tldraw 的浮动定位规则，
 * 让它严格服从右侧 host 的普通文档流。
 */
.hc-tldraw-style-host
  > .tlui-style-panel.tlui-style-panel__wrapper {
  position: relative !important;
  inset: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-height: 100%;
  max-width: none !important;
  margin: 0 !important;
  padding: 10px !important;
  overflow: visible !important;
  transform: none !important;
  translate: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

/*
 * 覆盖可能由 tldraw 子选择器添加的浮动尺寸。
 */
.hc-tldraw-style-host .tlui-style-panel {
  position: static !important;
  inset: auto !important;
  width: 100% !important;
  max-width: none !important;
  transform: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.hc-tldraw-style-host .tlui-style-panel__section {
  width: 100%;
  padding-inline: 0;
}

/*
 * 官方颜色区域使用完整侧栏宽度。
 *
 * 颜色项仍由 tldraw StylePanelColorPicker 根据当前主题生成，
 * 此处不声明任何固定颜色值。
 */
.hc-tldraw-style-host
  [data-testid^="style.color"] {
  max-width: none;
}

.hc-tldraw-style-host
  .tlui-button-grid {
  width: 100%;
}

/*
 * 官方 Toolbar。
 */
.hc-tldraw-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 30;
  width: min(1200px, calc(100% - 48px));
  min-width: 0;
  transform: translateX(-50%);
  pointer-events: auto;
}

.hc-tldraw-toolbar .tlui-main-toolbar {
  position: static !important;
  inset: auto !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  transform: none !important;
}

.hc-tldraw-toolbar .tlui-main-toolbar__inner {
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
}

/*
 * 官方 NavigationPanel。
 */
.hc-tldraw-navigation {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 30;
  display: block !important;
  pointer-events: auto;
}

.hc-tldraw-navigation .tlui-navigation-panel {
  position: static !important;
  inset: auto !important;
  display: block !important;
  margin: 0 !important;
  transform: none !important;
}

/*
 * PageMenu 已经从 React 树删除。
 * 额外隐藏旧残留，防止热更新期间继续显示 Page 1。
 */
.hc-tldraw-page-menu,
.hc-editor-canvas .tlui-page-menu {
  display: none !important;
}

/*
 * 中等窗口。
 */
@media (max-width: 1100px) {
  :root {
    --hc-tldraw-style-sidebar-width: 248px;
  }

  .hc-tldraw-toolbar {
    width: calc(100% - 32px);
  }
}

/*
 * 窄窗口将右侧栏改为贴右抽屉，但它仍然是 sidebar，
 * 不再恢复成 DefaultStylePanel 的小型浮动卡片。
 */
@media (max-width: 760px) {
  .hc-editor-layout {
    position: relative;
    display: block !important;
  }

  .hc-editor-canvas {
    width: 100%;
    height: 100%;
  }

  .hc-tldraw-style-sidebar {
    position: absolute !important;
    top: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    left: auto !important;
    width: min(276px, 82vw);
    height: 100%;
    border-left: 1px solid var(--color-divider);
    box-shadow: -12px 0 32px rgb(0 0 0 / 12%);
  }

  .hc-tldraw-toolbar {
    right: 8px;
    left: 8px;
    width: auto;
    transform: none;
  }
}
`
}