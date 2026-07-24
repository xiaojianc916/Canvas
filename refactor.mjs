#!/usr/bin/env node

/**
 * 将 Canvas 的自定义画布工具栏与检查器替换为 tldraw 5.2.5 官方 UI。
 *
 * 改造内容：
 * 1. 使用 DefaultToolbar / DefaultToolbarContent 作为画布工具栏。
 * 2. 使用 DefaultStylePanel / DefaultStylePanelContent 作为右侧样式栏。
 * 3. 使用 DefaultNavigationPanel 作为缩放与导航区域。
 * 4. 使用 DefaultPageMenu 作为官方页面菜单。
 * 5. 删除旧 CanvasToolbar，避免并行维护第二套工具定义。
 * 6. 停用 Workspace 原有 CanvasInspectorContent，避免出现两个右侧属性栏。
 *
 * 执行位置：
 *   Canvas 仓库根目录
 *
 * 执行命令：
 *   node scripts/apply-tldraw-official-ui.mjs
 */

import { access, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const paths = {
  packageJson: path.join(root, 'package.json'),
  workspaceConfig: path.join(root, 'pnpm-workspace.yaml'),

  editorCanvas: path.join(
    root,
    'editor/core/src/react/EditorCanvas.tsx',
  ),

  officialUi: path.join(
    root,
    'editor/core/src/react/TldrawOfficialUi.tsx',
  ),

  oldToolbar: path.join(
    root,
    'editor/core/src/react/CanvasToolbar.tsx',
  ),

  editorReactPublicApi: path.join(
    root,
    'editor/core/src/react/public-api.ts',
  ),

  workspaceContainer: path.join(
    root,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  appCss: path.join(
    root,
    'apps/desktop/src/app.css',
  ),
}

await verifyRepository()
await verifyTldrawVersion()

await writeText(paths.officialUi, createOfficialUiSource())
await writeText(paths.editorCanvas, createEditorCanvasSource())
await updateEditorReactPublicApi()
await disableLegacyWorkspaceInspector()
await appendOfficialUiStyles()
await rm(paths.oldToolbar, { force: true })

console.log('')
console.log('tldraw 官方 UI 改造已写入。')
console.log('')
console.log('已完成：')
console.log('  - DefaultToolbar')
console.log('  - DefaultStylePanel + DefaultStylePanelContent')
console.log('  - DefaultNavigationPanel')
console.log('  - DefaultPageMenu')
console.log('  - 删除旧 CanvasToolbar')
console.log('  - 停用旧 CanvasInspectorContent')
console.log('')
console.log('请继续执行：')
console.log('  pnpm typecheck')
console.log('  pnpm build:desktop')
console.log('')

async function verifyRepository() {
  for (const requiredPath of [
    paths.packageJson,
    paths.editorCanvas,
    paths.editorReactPublicApi,
    paths.workspaceContainer,
    paths.appCss,
  ]) {
    try {
      await access(requiredPath)
    } catch {
      throw new Error(
        `找不到必要文件：${path.relative(root, requiredPath)}\n` +
          '请在 Canvas 仓库根目录运行此脚本。',
      )
    }
  }

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `当前目录不是预期的 Canvas 仓库：package.json name=${String(
        packageJson.name,
      )}`,
    )
  }
}

async function verifyTldrawVersion() {
  const workspaceConfig = await readFile(
    paths.workspaceConfig,
    'utf8',
  )

  if (!workspaceConfig.includes('tldraw: "5.2.5"')) {
    throw new Error(
      [
        '此脚本按照 tldraw 5.2.5 的公开 API 编写。',
        'pnpm-workspace.yaml 中未找到 tldraw: "5.2.5"。',
        '请先确认 tldraw 版本，再调整脚本。',
      ].join('\n'),
    )
  }
}

async function updateEditorReactPublicApi() {
  let source = await readFile(
    paths.editorReactPublicApi,
    'utf8',
  )

  source = source.replace(
    "export { CanvasToolbar } from './CanvasToolbar'\n",
    '',
  )

  source = source.replace(
    "export type { CanvasToolbarProps } from './CanvasToolbar'\n",
    '',
  )

  const officialUiExport =
    "export { TldrawOfficialUi } from './TldrawOfficialUi'\n" +
    "export type { TldrawOfficialUiProps } from './TldrawOfficialUi'\n"

  if (!source.includes("from './TldrawOfficialUi'")) {
    const editorCanvasExport =
      "export { EditorCanvas, type EditorCanvasProps } from './EditorCanvas'\n"

    if (!source.includes(editorCanvasExport)) {
      throw new Error(
        '无法在 editor/core/src/react/public-api.ts 中定位 EditorCanvas 导出。',
      )
    }

    source = source.replace(
      editorCanvasExport,
      editorCanvasExport + officialUiExport,
    )
  }

  await writeText(paths.editorReactPublicApi, source)
}

async function disableLegacyWorkspaceInspector() {
  let source = await readFile(
    paths.workspaceContainer,
    'utf8',
  )

  // 脚本可重复运行。
  if (
    !source.includes('CanvasInspectorContent') &&
    source.includes('inspector={null}')
  ) {
    return
  }

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

  source = replaceRequired(
    source,
    /  const editor = useEditor\(\)\n\n  const inspectorSelectionKey = useValue\([\s\S]*?\n  \}, \[editor\]\)\n\n  const workbench =/,
    '  const workbench =',
    '旧 inspectorSelectionKey 状态',
  )

  source = replaceRequired(
    source,
    /  const toolInspectorRegistry = useMemo\([\s\S]*?\n  \)\n\n  const pages =/,
    '  const pages =',
    '旧 toolInspectorRegistry',
  )

  source = replaceRequired(
    source,
    /      inspector=\{\n        <CanvasInspectorContent[\s\S]*?      \}\n      inspectorSelectionKey=\{inspectorSelectionKey\}\n/,
    '      inspector={null}\n',
    '旧 CanvasInspectorContent JSX',
  )

  await writeText(paths.workspaceContainer, source)
}

async function appendOfficialUiStyles() {
  const marker = '/* hybrid-canvas:tldraw-official-ui */'
  let source = await readFile(paths.appCss, 'utf8')

  if (source.includes(marker)) {
    return
  }

  source = source.trimEnd() + '\n\n' + createOfficialUiCss() + '\n'
  await writeText(paths.appCss, source)
}

function replaceRequired(
  source,
  pattern,
  replacement,
  description,
) {
  const nextSource = source.replace(pattern, replacement)

  if (nextSource === source) {
    throw new Error(
      `无法定位${description}；WorkspaceContainer.tsx 可能已经发生结构变化。`,
    )
  }

  return nextSource
}

async function writeText(filePath, content) {
  await writeFile(filePath, normalize(content), 'utf8')
  console.log(`updated ${path.relative(root, filePath)}`)
}

function normalize(content) {
  return content.replaceAll('\r\n', '\n').trimStart()
}

function createOfficialUiSource() {
  return String.raw`
import {
  DefaultNavigationPanel,
  DefaultPageMenu,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DefaultToolbar,
} from 'tldraw'
import { createPortal } from 'react-dom'

export interface TldrawOfficialUiProps {
  /**
   * EditorCanvas 右侧样式栏的 DOM 挂载点。
   *
   * React portal 会保留 tldraw React context，因此官方 StylePanel
   * 仍然直接读取 Editor、selection、shared styles 和 TLStore。
   */
  readonly stylePanelHost: HTMLElement | null
}

/**
 * Canvas 只负责重新布置 tldraw 官方 UI。
 *
 * 不复制工具定义、样式状态、selection 状态、快捷键或 shape 更新逻辑。
 */
export function TldrawOfficialUi({
  stylePanelHost,
}: TldrawOfficialUiProps) {
  return (
    <>
      <div className="hc-tldraw-page-menu">
        <DefaultPageMenu />
      </div>

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

function createEditorCanvasSource() {
  return String.raw`
import { useEffect, useMemo, useState } from 'react'
import {
  type Editor,
  type TLComponents,
  type TLUiActionsContextType,
  type TLUiOverrides,
  Tldraw,
  type TldrawProps,
} from 'tldraw'

import type { EditorSession } from '../runtime/editor-session'
import { useBindEditorSession, useTldrawLicenseKey } from './editor-context'
import { TldrawOfficialUi } from './TldrawOfficialUi'

export const HYBRID_CANVAS_SAVE_ACTION_ID = 'hybrid-canvas.save'

export interface EditorCanvasProps {
  readonly session: EditorSession
  readonly isActive?: boolean
  readonly onSave?: () => void
}

export function EditorCanvas({
  session,
  isActive = true,
  onSave,
}: EditorCanvasProps) {
  const licenseKey = useTldrawLicenseKey()
  const [editor, setEditor] = useState<Editor | null>(null)

  /**
   * 官方 StylePanel 被 portal 到这个节点。
   *
   * 这样 StylePanel 在 DOM 布局上属于右侧栏，但在 React 树中仍然位于
   * Tldraw 内部，不会丢失 Editor、actions、styles、translation 等 context。
   */
  const [stylePanelHost, setStylePanelHost] =
    useState<HTMLDivElement | null>(null)

  const { registration, store } = session

  useBindEditorSession(
    isActive ? editor : null,
    isActive ? registration : null,
  )

  const hasTools = registration.tools.length > 0

  const overrides = useMemo<TLUiOverrides>(
    () => createCanvasUiOverrides(onSave),
    [onSave],
  )

  const components = useMemo<TLComponents>(
    () => ({
      InFrontOfTheCanvas: function HybridCanvasOfficialUi() {
        return (
          <TldrawOfficialUi
            stylePanelHost={stylePanelHost}
          />
        )
      },
    }),
    [stylePanelHost],
  )

  const tldrawProps = useMemo((): TldrawProps => {
    const base: TldrawProps = {
      /**
       * 禁止 tldraw 自动按照默认坐标重复放置整套 UI。
       *
       * UI context 仍然存在；官方组件由 TldrawOfficialUi 重新组合。
       */
      hideUi: true,
      licenseKey,
      store,
      onMount: setEditor,
      overrides,
      components,
      options: {
        maxPages: 100,
      },
      shapeUtils: registration.shapeUtils,
      bindingUtils: registration.bindingUtils,
    }

    if (hasTools) {
      base.tools = registration.tools
    }

    return base
  }, [
    components,
    hasTools,
    licenseKey,
    overrides,
    registration,
    store,
  ])

  useEffect(() => {
    if (!editor) {
      return
    }

    if (isActive) {
      editor.setCameraOptions({
        ...editor.getCameraOptions(),
        wheelBehavior: 'zoom',
        zoomSpeed: 1,
      })

      editor.updateInstanceState({
        isGridMode: false,
        isToolLocked: true,
      })

      session.attachEditor(editor)

      return () => session.detachEditor(editor)
    }

    session.detachEditor(editor)

    return undefined
  }, [editor, isActive, session])

  return (
    <div
      className="hc-editor-layout size-full overflow-hidden bg-canvas"
      data-document-id={session.documentId}
      data-session-id={session.sessionId}
    >
      <div className="hc-editor-canvas relative min-h-0 min-w-0 overflow-hidden">
        <Tldraw {...tldrawProps} />
      </div>

      <aside
        aria-label="样式"
        className="hc-tldraw-style-sidebar"
      >
        <header className="hc-tldraw-style-sidebar__header">
          <span>样式</span>
        </header>

        <div
          className="hc-tldraw-style-sidebar__content tl-theme__light"
          ref={setStylePanelHost}
        />
      </aside>
    </div>
  )
}

function createCanvasUiOverrides(
  onSave: (() => void) | undefined,
): TLUiOverrides {
  return {
    actions(_editor, actions): TLUiActionsContextType {
      if (!onSave) {
        return actions
      }

      return {
        ...actions,

        [HYBRID_CANVAS_SAVE_ACTION_ID]: {
          id: HYBRID_CANVAS_SAVE_ACTION_ID,
          label: '保存',
          kbd: 'cmd+s,ctrl+s',

          onSelect() {
            onSave()
          },
        },
      }
    },
  }
}

export { useEditor } from './editor-context'
`
}

function createOfficialUiCss() {
  return String.raw`
/* hybrid-canvas:tldraw-official-ui */

/*
 * tldraw 官方 UI 的产品布局层。
 *
 * 这里只改变位置、尺寸、边框和侧栏布局。
 * 工具、actions、selection、styles 和 shape 更新仍由 tldraw 管理。
 */

:root {
  --hc-tldraw-style-sidebar-width: 276px;
}

.hc-editor-layout {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    var(--hc-tldraw-style-sidebar-width);
  grid-template-rows: minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.hc-editor-canvas {
  grid-column: 1;
  grid-row: 1;
}

.hc-tldraw-style-sidebar {
  position: relative;
  z-index: 20;
  display: flex;
  grid-column: 2;
    box-shadow: none !important;
  background: transparent !important;
}

.hc-tldraw-style-sidebar__content .tlui-style-panel {
  padding: 8px !important;
}

.hc-tldraw-style-sidebar__content .tlui-style-panel__section {
  width: 100%;
}

/*
 * 官方工具栏。
 *
 * DefaultToolbar 继续负责：
 * - 官方工具定义
 * - 当前工具状态
 * - 快捷键
 * - overflow
 * - ActionsMenu
 * - QuickActions
 * - tool lock
 */
.hc-tldraw-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 30;
  width: min(1200px, calc(100% - 160px));
  min-width: 0;
  transform: translateX(-50%);
  pointer-events: auto;
}

.hc-tldraw-toolbar .tlui-main-toolbar {
  position: static !important;
  inset: auto !important;
  width: 100% !important;
  max-width: 100% !important;
  transform: none !important;
}

.hc-tldraw-toolbar .tlui-main-toolbar__inner {
  max-width: 100%;
  margin: 0 auto;
}

/*
 * 页面菜单仍然使用 tldraw DefaultPageMenu。
 */
.hc-tldraw-page-menu {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 31;
  pointer-events: auto;
}

.hc-tldraw-page-menu .tlui-page-menu {
  position: static !important;
  inset: auto !important;
  transform: none !important;
}

/*
 * 缩放、适应画布、Minimap 等使用官方 DefaultNavigationPanel。
 */
.hc-tldraw-navigation {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 30;
  pointer-events: auto;
}

.hc-tldraw-navigation .tlui-navigation-panel {
  position: static !important;
  inset: auto !important;
  transform: none !important;
}

/*
 * 原来的 app.css 隐藏了 .tlui-navigation-zone。
 * 我们直接挂载 DefaultNavigationPanel，因此只确保新容器可见。
 */
.hc-tldraw-navigation,
.hc-tldraw-navigation .tlui-navigation-panel {
  display: block;
}

/*
 * 避免 tldraw 官方浮层被 Canvas 右侧栏裁切。
 */
.hc-editor-canvas .tlui-popover__content,
.hc-editor-canvas .tlui-dropdown-menu__content,
.hc-editor-canvas [data-radix-popper-content-wrapper] {
  z-index: var(--ui-z-popover) !important;
}

/*
 * 中等尺寸窗口缩小右侧栏。
 */
@media (max-width: 1100px) {
  :root {
    --hc-tldraw-style-sidebar-width: 248px;
  }

  .hc-tldraw-toolbar {
    width: calc(100% - 112px);
  }
}

/*
 * 窄窗口仍然保留 StylePanel，但让它以画布内浮动抽屉显示，
 * 避免将画布主体压缩到不可用。
 */
@media (max-width: 760px) {
  .hc-editor-layout {
    position: relative;
    display: block;
  }

  .hc-editor-canvas {
    width: 100%;
    height: 100%;
  }

  .hc-tldraw-style-sidebar {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(276px, 82vw);
    box-shadow: -12px 0 32px rgb(0 0 0 / 12%);
  }

  .hc-tldraw-toolbar {
    right: 8px;
    left: 56px;
    width: auto;
    transform: none;
  }
}
`
}