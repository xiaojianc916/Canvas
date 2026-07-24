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

  toolInspectorRegistry: path.join(
    root,
    'apps/desktop/src/presentation/workspace/inspector/tools/ToolInspectorRegistry.tsx',
  ),

  passiveToolInspector: path.join(
    root,
    'apps/desktop/src/presentation/workspace/inspector/tools/PassiveToolInspector.tsx',
  ),

  appCss: path.join(
    root,
    'apps/desktop/src/app.css',
  ),
}

await verifyFiles()

await write(
  files.officialUi,
  createOfficialUiSource(),
)

await write(
  files.editorCanvas,
  createEditorCanvasSource(),
)

await restoreWorkspaceInspector()
await normalizeWorkspaceShell()
await addPassiveToolInspectors()
await replaceOfficialUiCss()

console.log('')
console.log('修改完成：')
console.log('  - 工具栏恢复为 tldraw 官方默认紧凑布局')
console.log('  - 删除画布内部的官方 StylePanel')
console.log('  - 恢复原来的 Canvas Inspector')
console.log('  - Inspector 根据当前 toolId 和 shape.type 路由')
console.log('  - 补齐 asset / laser 工具说明')
console.log('')
console.log('请执行：')
console.log('  pnpm typecheck')
console.log('  pnpm build:desktop')
console.log('')

async function verifyFiles() {
  const requiredFiles = [
    files.officialUi,
    files.editorCanvas,
    files.workspaceContainer,
    files.workspaceShell,
    files.toolInspectorRegistry,
    files.appCss,
  ]

  for (const filePath of requiredFiles) {
    try {
      await access(filePath)
    } catch {
      throw new Error(
        `找不到文件：${path.relative(root, filePath)}\n` +
          '请在 Canvas 仓库根目录执行脚本。',
      )
    }
  }
}

async function restoreWorkspaceInspector() {
  let source = await readFile(
    files.workspaceContainer,
    'utf8',
  )

  source = ensureReplacement(
    source,
    "import { EditorSessionHost } from '@hybrid-canvas/canvas/react'",
    "import { EditorSessionHost, useEditor } from '@hybrid-canvas/canvas/react'",
  )

  if (!source.includes("import { useValue } from 'tldraw'")) {
    source = source.replace(
      "import { useCallback, useMemo, useSyncExternalStore } from 'react'\n",
      "import { useCallback, useMemo, useSyncExternalStore } from 'react'\n" +
        "import { useValue } from 'tldraw'\n",
    )
  }

  if (!source.includes("from './inspector/CanvasInspectorContent'")) {
    source = source.replace(
      "import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'\n",
      "import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'\n" +
        "import { CanvasInspectorContent } from './inspector/CanvasInspectorContent'\n" +
        "import { createToolInspectorRegistry } from './inspector/tools/ToolInspectorRegistry'\n",
    )
  }

  if (!source.includes('const editor = useEditor()')) {
    const functionStart = `}: WorkspaceContainerProps) {
`

    const editorState = `}: WorkspaceContainerProps) {
  const editor = useEditor()

  const inspectorSelectionKey = useValue(
    'workspace inspector selection key',
    () => {
      if (!editor) {
        return ''
      }

      const selectedIds = editor
        .getSelectedShapeIds()
        .map(String)
        .sort()

      if (selectedIds.length > 0) {
        return 'selection:' + selectedIds.join('|')
      }

      const toolId = editor.getCurrentToolId()

      /*
       * select / hand 没有需要自动展开的创建参数。
       * 其他官方工具以及 Feature 工具都可以触发相应 Inspector。
       */
      if (toolId === 'select' || toolId === 'hand') {
        return ''
      }

      return 'tool:' + toolId
    },
    [editor],
  )

`

    if (!source.includes(functionStart)) {
      throw new Error(
        '无法定位 WorkspaceContainer 函数起点。',
      )
    }

    source = source.replace(
      functionStart,
      editorState,
    )
  }

  if (!source.includes('const toolInspectorRegistry = useMemo(')) {
    const activeSessionBlock = `  const activeEditorSession = activeSessionId
    ? port.canvases.getEditorSession(activeSessionId)
    : null
`

    const registryBlock = `${activeSessionBlock}
  /*
   * Core Inspector 与 Feature Inspector 合并。
   *
   * draw / highlight 由 freehand 提供；
   * arrow 由 flowchart 提供；
   * scientific-chart 由 scientific-plot 提供。
   */
  const toolInspectorRegistry = useMemo(
    () =>
      createToolInspectorRegistry(
        activeEditorSession?.registration.toolInspectors ?? [],
      ),
    [activeEditorSession],
  )
`

    if (!source.includes(activeSessionBlock)) {
      throw new Error(
        '无法定位 activeEditorSession。',
      )
    }

    source = source.replace(
      activeSessionBlock,
      registryBlock,
    )
  }

  const inspectorJsx = `      inspector={
        <CanvasInspectorContent
          hasActiveCanvas={workbench.activeCanvas !== null}
          toolInspectorRegistry={toolInspectorRegistry}
        />
      }
      inspectorSelectionKey={inspectorSelectionKey}`

  if (source.includes('      inspector={null}')) {
    source = source.replace(
      '      inspector={null}',
      inspectorJsx,
    )
  } else if (!source.includes('<CanvasInspectorContent')) {
    source = source.replace(
      '    <WorkspaceShell\n',
      `    <WorkspaceShell
${inspectorJsx}
`,
    )
  }

  await write(
    files.workspaceContainer,
    source,
  )
}

async function normalizeWorkspaceShell() {
  let source = await readFile(
    files.workspaceShell,
    'utf8',
  )

  /*
   * Inspector 有内容时才允许打开，避免再出现空白右栏。
   */
  source = source.replace(
    'const dockInspector = isInspectorOpen && hasCanvas',
    'const dockInspector = inspector !== null && inspector !== undefined && isInspectorOpen && hasCanvas',
  )

  /*
   * 如果上一版已经修改过，则保留这个更安全的条件。
   */
  if (
    !source.includes(
      'const dockInspector = inspector !== null && inspector !== undefined && isInspectorOpen && hasCanvas',
    )
  ) {
    throw new Error(
      '无法确认 WorkspaceShell 的 dockInspector 条件。',
    )
  }

  if (
    source.includes(
      'const inspectorRegion = hasCanvas ? (',
    )
  ) {
    source = source.replace(
      'const inspectorRegion = hasCanvas ? (',
      'const inspectorRegion = hasCanvas && inspector !== null && inspector !== undefined ? (',
    )
  }

  await write(
    files.workspaceShell,
    source,
  )
}

async function addPassiveToolInspectors() {
  await write(
    files.passiveToolInspector,
    createPassiveToolInspectorSource(),
  )

  let source = await readFile(
    files.toolInspectorRegistry,
    'utf8',
  )

  if (!source.includes("from './PassiveToolInspector'")) {
    source = source.replace(
      "import { NoteToolInspector } from './NoteToolInspector'\n",
      "import { NoteToolInspector } from './NoteToolInspector'\n" +
        "import {\n" +
        "  AssetToolInspector,\n" +
        "  LaserToolInspector,\n" +
        "} from './PassiveToolInspector'\n",
    )
  }

  if (!source.includes("toolId: 'asset'")) {
    const frameContribution = `  {
    toolId: 'frame',
    owner: 'core',
    component: FrameToolInspector,
  },
`

    const additionalContributions = `${frameContribution}  {
    /*
     * asset 是官方媒体插入工具。
     * 其主要行为是打开资源选择器，没有持久的画笔样式参数。
     */
    toolId: 'asset',
    owner: 'core',
    component: AssetToolInspector,
  },
  {
    /*
     * laser 是官方临时演示工具，不创建持久 shape。
     */
    toolId: 'laser',
    owner: 'core',
    component: LaserToolInspector,
  },
`

    if (!source.includes(frameContribution)) {
      throw new Error(
        '无法定位 frame tool inspector contribution。',
      )
    }

    source = source.replace(
      frameContribution,
      additionalContributions,
    )
  }

  await write(
    files.toolInspectorRegistry,
    source,
  )
}

async function replaceOfficialUiCss() {
  let source = await readFile(files.appCss, 'utf8')

  const marker =
    '/* hybrid-canvas:tldraw-official-ui */'

  const markerIndex = source.indexOf(marker)

  if (markerIndex >= 0) {
    source = source.slice(0, markerIndex).trimEnd()
  }

  source += '\n\n' + createOfficialUiCss() + '\n'

  await write(files.appCss, source)
}

function ensureReplacement(
  source,
  before,
  after,
) {
  if (source.includes(after)) {
    return source
  }

  if (!source.includes(before)) {
    throw new Error(
      `无法定位需要替换的代码：${before}`,
    )
  }

  return source.replace(before, after)
}

async function write(filePath, content) {
  await writeFile(
    filePath,
    content.replaceAll('\r\n', '\n').trimStart(),
    'utf8',
  )

  console.log(
    `updated ${path.relative(root, filePath)}`,
  )
}

function createOfficialUiSource() {
  return `import {
  DefaultNavigationPanel,
  DefaultToolbar,
} from 'tldraw'

export interface TldrawOfficialUiProps {}

/**
 * 只在画布中放置 tldraw 官方 Toolbar 和 NavigationPanel。
 *
 * 属性检查器由 Workspace 原生 CanvasInspectorContent 负责，
 * 不再把 DefaultStylePanel 强行嵌入画布。
 */
export function TldrawOfficialUi(
  _props: TldrawOfficialUiProps = {},
) {
  return (
    <>
      <div className="hc-tldraw-toolbar">
        {/*
         * 不设置 maxItems={64}。
         *
         * 使用官方默认：
         * - minItems=4
         * - maxItems=8
         * - minSizePx=310
         * - maxSizePx=470
         *
         * 多余工具进入官方 overflow，不再全部挤成一条。
         */}
        <DefaultToolbar />
      </div>

      <div className="hc-tldraw-navigation">
        <DefaultNavigationPanel />
      </div>
    </>
  )
}
`
}

function createEditorCanvasSource() {
  return `import { useEffect, useMemo, useState } from 'react'
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

const CANVAS_COMPONENTS: TLComponents = {
  InFrontOfTheCanvas: TldrawOfficialUi,
}

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

  const tldrawProps = useMemo((): TldrawProps => {
    const base: TldrawProps = {
      /*
       * 不让 tldraw 自动生成第二套默认布局。
       * 官方 Toolbar / Navigation 由 TldrawOfficialUi 放置。
       */
      hideUi: true,
      licenseKey,
      store,
      onMount: setEditor,
      overrides,
      components: CANVAS_COMPONENTS,
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
      className="relative size-full overflow-hidden bg-canvas"
      data-document-id={session.documentId}
      data-session-id={session.sessionId}
    >
      <Tldraw {...tldrawProps} />
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

function createPassiveToolInspectorSource() {
  return `import { ToolPanelHeader } from '../common/InspectorPrimitives'

/**
 * asset 和 laser 都是 tldraw 官方工具，但没有可持久编辑的
 * stroke/fill/font 参数，因此不应生搬其他工具的 Inspector。
 */

export function AssetToolInspector() {
  return (
    <ToolPanelHeader
      description="从本地选择图片、视频或其他媒体并插入当前画布。"
      title="媒体"
    >
      <div className="rounded-lg border border-dashed border-divider px-3 py-4 text-[11px] leading-5 text-muted-foreground">
        选择工具栏中的媒体按钮后，使用系统资源选择器添加内容。
      </div>
    </ToolPanelHeader>
  )
}

export function LaserToolInspector() {
  return (
    <ToolPanelHeader
      description="用于演示和临时指示，不会在文档中创建持久图形。"
      title="激光笔"
    >
      <div className="rounded-lg border border-dashed border-divider px-3 py-4 text-[11px] leading-5 text-muted-foreground">
        激光轨迹会自动消失，因此没有对象样式或持久化参数。
      </div>
    </ToolPanelHeader>
  )
}
`
}

function createOfficialUiCss() {
  return `/* hybrid-canvas:tldraw-official-ui */

/*
 * 工具栏只负责定位。
 * 尺寸、按钮排列和 overflow 交给 DefaultToolbar 自己处理。
 */
.hc-tldraw-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 30;
  width: auto;
  max-width: calc(100% - 32px);
  transform: translateX(-50%);
  pointer-events: auto;
}

.hc-tldraw-toolbar .tlui-main-toolbar {
  position: static !important;
  inset: auto !important;
  width: auto !important;
  max-width: min(470px, calc(100vw - 64px)) !important;
  margin: 0 !important;
  transform: none !important;
}

.hc-tldraw-toolbar .tlui-main-toolbar__inner {
  width: auto !important;
  max-width: 100% !important;
  margin: 0 !important;
}

/*
 * 防止旧 CSS 再次把所有工具横向展开。
 */
.hc-tldraw-toolbar
  .tlui-main-toolbar__left {
  width: auto !important;
  max-width: 100% !important;
}

.hc-tldraw-toolbar
  .tlui-main-toolbar__tools {
  width: auto !important;
  max-width: 100% !important;
}

/*
 * 官方缩放与导航。
 */
.hc-tldraw-navigation {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 30;
  display: block !important;
  pointer-events: auto;
}

.hc-tldraw-navigation
  .tlui-navigation-panel {
  position: static !important;
  inset: auto !important;
  display: block !important;
  margin: 0 !important;
  transform: none !important;
}

/*
 * 不再在 EditorCanvas 内创建第二个 StylePanel 或侧边栏。
 */
.hc-editor-layout {
  display: block !important;
}

.hc-tldraw-style-sidebar,
.hc-tldraw-style-host,
.hc-tldraw-page-menu {
  display: none !important;
}
`
}