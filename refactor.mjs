#!/usr/bin/env node

/**
 * 将 tldraw 官方默认 Toolbar 放到画布顶部。
 *
 * 保留：
 * - tldraw 官方 DefaultToolbar
 * - tldraw 官方 QuickActions
 * - tldraw 官方 ActionsMenu
 * - tldraw 官方 overflow
 * - 原 Workspace 左右侧栏
 * - 原 CanvasInspectorContent
 * - 原 NavigationPanel
 * - 原状态栏
 *
 * 不修改：
 * - WorkspaceShell.tsx
 * - WorkspaceContainer.tsx
 * - Inspector
 * - Workspace grid
 *
 * 执行：
 *   node refactor.mjs
 *
 * 撤销本脚本：
 *   node refactor.mjs --undo
 */

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldUndo =
  process.argv.includes('--undo')

const editorCanvasPath = path.join(
  root,
  'editor/core/src/react/EditorCanvas.tsx',
)

const appCssPath = path.join(
  root,
  'apps/desktop/src/app.css',
)

const CSS_MARKER =
  '/* hybrid-canvas:official-top-toolbar */'

if (shouldUndo) {
  await undoChanges()
} else {
  await applyChanges()
}

async function applyChanges() {
  /*
   * 先在内存中完成所有转换。
   * 任一步失败都不会写入半成品。
   */
  const originalEditorCanvas =
    await readFile(editorCanvasPath, 'utf8')

  const originalAppCss =
    await readFile(appCssPath, 'utf8')

  const nextEditorCanvas =
    transformEditorCanvas(
      originalEditorCanvas,
    )

  const nextAppCss =
    transformAppCss(originalAppCss)

  await writeFile(
    editorCanvasPath,
    nextEditorCanvas,
    'utf8',
  )

  await writeFile(
    appCssPath,
    nextAppCss,
    'utf8',
  )

  console.log('')
  console.log('修改完成。')
  console.log('')
  console.log('只修改了：')
  console.log(
    '  editor/core/src/react/EditorCanvas.tsx',
  )
  console.log(
    '  apps/desktop/src/app.css',
  )
  console.log('')
  console.log('效果：')
  console.log(
    '  - tldraw 官方 DefaultToolbar 位于顶部',
  )
  console.log(
    '  - 官方撤销、重做、删除、复制/重复操作可见',
  )
  console.log(
    '  - 官方 overflow 与默认按钮样式保持不变',
  )
  console.log(
    '  - NavigationPanel 保持原位置',
  )
  console.log(
    '  - Workspace 和左右侧栏不变',
  )
  console.log('')
  console.log('请验证：')
  console.log('  pnpm typecheck')
  console.log('  pnpm build:desktop')
  console.log('')
  console.log('撤销本次修改：')
  console.log('  node refactor.mjs --undo')
}

function transformEditorCanvas(source) {
  let nextSource = source

  nextSource =
    addDefaultToolbarImport(nextSource)

  nextSource =
    addCanvasTopToolbarComponent(
      nextSource,
    )

  nextSource =
    configureTldrawComponents(nextSource)

  nextSource =
    enableOfficialQuickActions(
      nextSource,
    )

  return normalizeNewlines(nextSource)
}

function addDefaultToolbarImport(source) {
  /*
   * 只匹配 from 'tldraw' 的具名 import。
   *
   * 兼容：
   * - 单引号或双引号
   * - 任意换行
   * - 有无分号
   * - Biome / Prettier 格式
   */
  const pattern =
    /import\s*\{([^{}]*)\}\s*from\s*(['"])tldraw\2;?/

  const match = source.match(pattern)

  if (!match) {
    throw new Error(
      [
        '无法找到 tldraw 具名 import。',
        '',
        `文件：${editorCanvasPath}`,
        '',
        '文件中应该存在类似：',
        "import { Tldraw } from 'tldraw'",
        '',
        '脚本没有写入任何文件。',
      ].join('\n'),
    )
  }

  const importedNames = match[1]

  const alreadyImported =
    importedNames
      .split(',')
      .map((item) =>
        item
          .replaceAll('\n', ' ')
          .trim(),
      )
      .some(
        (item) =>
          item === 'DefaultToolbar',
      )

  if (alreadyImported) {
    return source
  }

  const quote = match[2]

  const normalizedNames =
    normalizeImportNames(importedNames)

  const replacement = `import {
  DefaultToolbar,
${normalizedNames}
} from ${quote}tldraw${quote}`

  return source.replace(
    pattern,
    replacement,
  )
}

function normalizeImportNames(importedNames) {
  return importedNames
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `  ${line}`)
    .join('\n')
}

function addCanvasTopToolbarComponent(
  source,
) {
  if (
    source.includes(
      'function CanvasTopToolbar()',
    )
  ) {
    return source
  }

  const componentsDeclaration =
    /const\s+CANVAS_COMPONENTS\s*:\s*TLComponents\s*=\s*\{/

  if (
    !componentsDeclaration.test(source)
  ) {
    throw new Error(
      [
        '无法定位 CANVAS_COMPONENTS。',
        '',
        `文件：${editorCanvasPath}`,
        '',
        '脚本没有写入任何文件。',
      ].join('\n'),
    )
  }

  const component = `function CanvasTopToolbar() {
  return (
    <div className="hc-canvas-top-toolbar">
      {/*
       * 使用 tldraw 官方 DefaultToolbar。
       *
       * 工具定义、按钮样式、激活状态、快捷键、
       * QuickActions 和 overflow 均由 tldraw 管理。
       */}
      <DefaultToolbar />
    </div>
  )
}

`

  return source.replace(
    componentsDeclaration,
    component +
      'const CANVAS_COMPONENTS: TLComponents = {',
  )
}

function configureTldrawComponents(
  source,
) {
  /*
   * 当前 CANVAS_COMPONENTS 是简单配置对象，
   * 没有嵌套对象，因此可安全匹配到第一个独立结束括号。
   */
  const pattern =
    /const\s+CANVAS_COMPONENTS\s*:\s*TLComponents\s*=\s*\{([\s\S]*?)\n\}/

  const match = source.match(pattern)

  if (!match) {
    throw new Error(
      [
        '无法读取 CANVAS_COMPONENTS。',
        '',
        `文件：${editorCanvasPath}`,
        '',
        '脚本没有写入任何文件。',
      ].join('\n'),
    )
  }

  let body = match[1]

  /*
   * 删除可能由前一次运行写入的配置，
   * 保证脚本可重复执行。
   */
  body = body
    .replace(
      /^\s*Toolbar\s*:\s*[^,\n]+,?\s*$/gm,
      '',
    )
    .replace(
      /^\s*TopPanel\s*:\s*[^,\n]+,?\s*$/gm,
      '',
    )
    .trimEnd()

  /*
   * Toolbar: null
   * 禁止默认 Toolbar 在底部重复渲染。
   *
   * TopPanel
   * 使用 tldraw 官方组件插槽放置顶部 Toolbar。
   */
  const replacement =
    `const CANVAS_COMPONENTS: TLComponents = {${body}
  Toolbar: null,
  TopPanel: CanvasTopToolbar,
}`

  return source.replace(
    pattern,
    replacement,
  )
}

function enableOfficialQuickActions(
  source,
) {
  if (
    /actionShortcutsLocation\s*:\s*['"]toolbar['"]/.test(
      source,
    )
  ) {
    return source
  }

  /*
   * 默认值为 swap：
   *
   * - 窄画布：QuickActions 在 Toolbar
   * - 宽画布：QuickActions 在 MainMenu
   *
   * 当前项目隐藏了 MainMenu，所以宽画布时官方
   * 撤销、重做、删除和复制/重复操作会消失。
   *
   * toolbar 会让官方 QuickActions 始终出现在
   * DefaultToolbar 中。
   */
  const maxPagesPattern =
    /(maxPages\s*:\s*100\s*,?)/

  if (!maxPagesPattern.test(source)) {
    throw new Error(
      [
        '无法定位 options.maxPages。',
        '',
        `文件：${editorCanvasPath}`,
        '',
        '脚本没有写入任何文件。',
      ].join('\n'),
    )
  }

  return source.replace(
    maxPagesPattern,
    `$1
        actionShortcutsLocation: 'toolbar',`,
  )
}

function transformAppCss(source) {
  /*
   * 删除上一次运行添加的同名区域，
   * 然后重新追加，保证脚本可重复执行。
   */
  const withoutOldSection =
    removeCssSection(source)

  return (
    withoutOldSection.trimEnd() +
    '\n\n' +
    createTopToolbarCss() +
    '\n'
  )
}

function removeCssSection(source) {
  const markerIndex =
    source.indexOf(CSS_MARKER)

  if (markerIndex < 0) {
    return source
  }

  /*
   * 此脚本的 CSS 始终追加在 app.css 末尾，
   * 因此从 marker 到文件末尾都是本脚本内容。
   */
  return source
    .slice(0, markerIndex)
    .trimEnd()
}

function createTopToolbarCss() {
  return `${CSS_MARKER}

/*
 * 只定位 tldraw 的 TopPanel 插槽。
 *
 * 不修改：
 * - .tlui-layout
 * - .tlui-layout__bottom
 * - .tlui-navigation-panel
 * - Workspace grid
 * - Inspector grid
 * - 状态栏
 */
.workspace-shell
  .tlui-layout__top__center {
  position: absolute;
  top: 10px;
  left: 50%;
  z-index: var(--tl-layer-panels);
  width: min(760px, calc(100% - 24px));
  min-width: 0;
  transform: translateX(-50%);
  pointer-events: none;
}

/*
 * 产品包装层只负责水平居中。
 */
.workspace-shell
  .hc-canvas-top-toolbar {
  display: flex;
  width: 100%;
  min-width: 0;
  justify-content: center;
  pointer-events: none;
}

/*
 * DefaultToolbar 原本默认显示在底部，
 * 因此带有底部 safe-area padding。
 *
 * 放入 TopPanel 后只移除这段 padding；
 * 不重写背景、圆角、阴影和按钮尺寸。
 */
.workspace-shell
  .hc-canvas-top-toolbar
  .tlui-main-toolbar--horizontal {
  width: 100%;
  max-width: 100%;
  padding-top: 0;
  padding-bottom: 0;
  pointer-events: none;
}

/*
 * 保持官方 Toolbar 按自身内容宽度居中。
 */
.workspace-shell
  .hc-canvas-top-toolbar
  .tlui-main-toolbar__inner {
  width: fit-content;
  max-width: 100%;
  margin-right: auto;
  margin-left: auto;
}

/*
 * 允许官方 Toolbar 与 QuickActions 接收交互。
 */
.workspace-shell
  .hc-canvas-top-toolbar
  .tlui-main-toolbar__tools,
.workspace-shell
  .hc-canvas-top-toolbar
  .tlui-main-toolbar__extras,
.workspace-shell
  .hc-canvas-top-toolbar
  .tlui-main-toolbar__extras__controls,
.workspace-shell
  .hc-canvas-top-toolbar
  button {
  pointer-events: auto;
}

/*
 * 确保官方 QuickActions 可见。
 *
 * QuickActions 包括 tldraw 根据当前状态提供的：
 * - Undo
 * - Redo
 * - Delete
 * - Duplicate / Copy 类操作
 * - ActionsMenu
 */
.workspace-shell
  .hc-canvas-top-toolbar
  .tlui-main-toolbar__extras {
  visibility: visible;
  opacity: 1;
}

/*
 * 窄窗口只调整 TopPanel 的可用宽度，
 * 不触碰 Workspace 的列布局。
 */
@media (max-width: 760px) {
  .workspace-shell
    .tlui-layout__top__center {
    top: 8px;
    width: calc(100% - 16px);
  }
}`
}

async function undoChanges() {
  const originalEditorCanvas =
    await readFile(editorCanvasPath, 'utf8')

  const originalAppCss =
    await readFile(appCssPath, 'utf8')

  const nextEditorCanvas =
    undoEditorCanvas(originalEditorCanvas)

  const nextAppCss =
    removeCssSection(originalAppCss)
      .trimEnd() + '\n'

  await writeFile(
    editorCanvasPath,
    nextEditorCanvas,
    'utf8',
  )

  await writeFile(
    appCssPath,
    nextAppCss,
    'utf8',
  )

  console.log('')
  console.log('已撤销本脚本的修改。')
  console.log('')
  console.log('已恢复：')
  console.log(
    '  editor/core/src/react/EditorCanvas.tsx',
  )
  console.log(
    '  apps/desktop/src/app.css',
  )
}

function undoEditorCanvas(source) {
  let nextSource = source

  /*
   * 删除 DefaultToolbar import。
   */
  nextSource = nextSource.replace(
    /^\s*DefaultToolbar,\s*\n/m,
    '',
  )

  /*
   * 删除本脚本添加的 CanvasTopToolbar。
   */
  nextSource = nextSource.replace(
    /function\s+CanvasTopToolbar\(\)\s*\{[\s\S]*?\n\}\n\n(?=const\s+CANVAS_COMPONENTS)/,
    '',
  )

  /*
   * 删除 Toolbar / TopPanel 插槽配置。
   */
  nextSource = nextSource
    .replace(
      /^\s*Toolbar\s*:\s*null,\s*\n/m,
      '',
    )
    .replace(
      /^\s*TopPanel\s*:\s*CanvasTopToolbar,\s*\n/m,
      '',
    )

  /*
   * 恢复 tldraw 默认 actionShortcutsLocation。
   */
  nextSource = nextSource.replace(
    /^\s*actionShortcutsLocation\s*:\s*['"]toolbar['"],?\s*\n/m,
    '',
  )

  return normalizeNewlines(nextSource)
}

function normalizeNewlines(source) {
  return source.replaceAll(
    '\r\n',
    '\n',
  )
}