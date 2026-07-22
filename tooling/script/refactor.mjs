#!/usr/bin/env node

/**
 * 针对当前已推送 Canvas 代码的修复脚本。
 *
 * 解决：
 * 1. 修复 WorkspaceContainer.tsx 被破坏的 import。
 * 2. 修复 @hybrid-canvas/scientific-plot workspace 解析。
 * 3. 点击形状、连接、图表、文本、画笔、高亮、便签、画框时，
 *    自动打开右侧栏并显示对应工具配置。
 * 4. 选中已有对象时显示对象编辑配置。
 * 5. 滚轮上滑放大、下滑缩小。
 * 6. 创建工具保持激活，不自动返回选择。
 * 7. 选中图表后可以切换折线、柱状、面积和散点图。
 *
 * 使用：
 *   node tooling/script/repair-tool-panels.mjs --apply
 */

import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldApply = process.argv.includes('--apply')

const paths = {
  workspaceContainer: resolve(
    root,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),
  workspaceShell: resolve(
    root,
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ),
  editorCanvas: resolve(
    root,
    'editor/core/src/react/EditorCanvas.tsx',
  ),
  desktopPackage: resolve(
    root,
    'apps/desktop/package.json',
  ),
  scientificPackage: resolve(
    root,
    'features/scientific-plot/package.json',
  ),
  scientificPublicApi: resolve(
    root,
    'features/scientific-plot/src/public-api.ts',
  ),
}

async function readText(path) {
  return readFile(path, 'utf8')
}

async function writeText(path, content) {
  if (!shouldApply) {
    console.log(`[dry-run] 将修改：${path}`)
    return
  }

  await writeFile(path, content, 'utf8')
}

function replaceRequired(
  source,
  search,
  replacement,
  description,
) {
  const index = source.indexOf(search)

  if (index === -1) {
    throw new Error(`没有找到修改位置：${description}`)
  }

  return (
    source.slice(0, index) +
    replacement +
    source.slice(index + search.length)
  )
}

function replaceOptional(
  source,
  search,
  replacement = '',
) {
  const index = source.indexOf(search)

  if (index === -1) {
    return source
  }

  return (
    source.slice(0, index) +
    replacement +
    source.slice(index + search.length)
  )
}

function insertBeforeRequired(
  source,
  marker,
  content,
  description,
) {
  const index = source.indexOf(marker)

  if (index === -1) {
    throw new Error(`没有找到插入位置：${description}`)
  }

  return (
    source.slice(0, index) +
    content +
    '\n\n' +
    source.slice(index)
  )
}

async function updateJson(path, mutate) {
  const original = await readText(path)
  const hasBom = original.charCodeAt(0) === 0xfeff
  const jsonText = hasBom ? original.slice(1) : original
  const value = JSON.parse(jsonText)

  mutate(value)

  const output = `${JSON.stringify(value, null, 2)}\n`

  await writeText(
    path,
    hasBom ? `\ufeff${output}` : output,
  )
}

const workspaceImports = String.raw`import type { EditorSession } from '@hybrid-canvas/canvas/application'
import {
  EditorSessionHost,
  useEditor,
} from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'
import {
  ScientificChartTypeStyle,
  type ScientificChartType,
} from '@hybrid-canvas/scientific-plot'
import type {
  CanvasSessionId,
  WorkbenchSessionStore,
  WorkbenchTabId,
  WorkspaceShellActions,
} from '@hybrid-canvas/workspace/contracts'
import {
  NoCanvasSurface,
  WorkbenchTabs,
  WorkspaceShell,
  WorkspaceSurface,
} from '@hybrid-canvas/workspace/react'
import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  DefaultArrowheadEndStyle,
  DefaultArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  GeoShapeGeoStyle,
  type Editor,
  type TLShape,
  useValue,
} from 'tldraw'

import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'
import { DesktopTitleBar } from '../chrome/DesktopTitleBar'
import { reportUiError as reportError } from '../ui/ui-feedback'
`

async function repairWorkspaceImports() {
  const source = await readText(paths.workspaceContainer)
  const marker = 'const EMPTY_EDITOR_SESSION_SNAPSHOT'
  const markerIndex = source.indexOf(marker)

  if (markerIndex === -1) {
    throw new Error(
      'WorkspaceContainer.tsx 中没有找到 EMPTY_EDITOR_SESSION_SNAPSHOT',
    )
  }

  /*
   * 直接重建完整 import 区，不再使用脆弱的正则合并 import。
   */
  const next =
    workspaceImports +
    '\n' +
    source.slice(markerIndex)

  await writeText(paths.workspaceContainer, next)
}

async function repairWorkspaceDependencies() {
  await updateJson(paths.desktopPackage, (pkg) => {
    pkg.dependencies ??= {}

    pkg.dependencies['@hybrid-canvas/scientific-plot'] =
      'workspace:*'
  })

  await updateJson(paths.scientificPackage, (pkg) => {
    pkg.dependencies ??= {}
    pkg.devDependencies ??= {}

    pkg.dependencies['@hybrid-canvas/canvas'] =
      'workspace:*'
    pkg.dependencies['@tldraw/tlschema'] = 'catalog:'
    pkg.dependencies['@tldraw/validate'] = 'catalog:'
    pkg.dependencies.tldraw = 'catalog:'
    pkg.dependencies.react = 'catalog:'
    pkg.dependencies['react-dom'] = 'catalog:'

    pkg.devDependencies['@types/react'] = 'catalog:'
    pkg.devDependencies['@types/react-dom'] = 'catalog:'
  })
}

async function verifyScientificPublicApi() {
  let source = await readText(paths.scientificPublicApi)

  if (
    !source.includes(
      "export { scientificPlotExtension } from './extension'",
    )
  ) {
    source += `
export { scientificPlotExtension } from './extension'
`
  }

  if (
    !source.includes(
      "ScientificChartTypeStyle",
    )
  ) {
    source += `
export {
  ScientificChartTypeStyle,
  type ScientificChartType,
} from './styles/chart-styles'
`
  }

  await writeText(paths.scientificPublicApi, source)
}

async function configureEditorBehavior() {
  let source = await readText(paths.editorCanvas)

  if (!source.includes("wheelBehavior: 'zoom'")) {
    source = replaceRequired(
      source,
      'options: { maxPages: 100 },',
      `options: {
        maxPages: 100,
        cameraOptions: {
          wheelBehavior: 'zoom',
          zoomSpeed: 1,
        },
      },`,
      'tldraw cameraOptions',
    )
  }

  if (!source.includes('isToolLocked: true')) {
    source = replaceOptional(
      source,
      'editor.updateInstanceState({ isGridMode: false })',
      `editor.updateInstanceState({
        isGridMode: false,
        isToolLocked: true,
      })`,
    )

    source = replaceOptional(
      source,
      'editor.updateInstanceState({ isGridMode: true })',
      `editor.updateInstanceState({
        isGridMode: false,
        isToolLocked: true,
      })`,
    )
  }

  await writeText(paths.editorCanvas, source)
}

const activeToolPanelSource = String.raw`function CanvasActiveToolPanel({
  editor,
  toolId,
}: {
  readonly editor: Editor
  readonly toolId: string
}) {
  const applyNextStyle = (
    style: Parameters<Editor['setStyleForNextShapes']>[0],
    value: string,
  ) => {
    editor.setStyleForNextShapes(
      style,
      value as never,
    )
  }

  const colors = (
    <ShapeInspectorSection title="颜色">
      <div className="grid grid-cols-6 gap-1.5">
        {SHAPE_COLORS.map((color) => (
          <button
            aria-label={'设置默认颜色为' + color.label}
            className="size-7 rounded-md border transition-transform hover:scale-105"
            key={color.value}
            onClick={() =>
              applyNextStyle(
                DefaultColorStyle,
                color.value,
              )
            }
            style={{
              backgroundColor: color.css,
            }}
            title={color.label}
            type="button"
          />
        ))}
      </div>
    </ShapeInspectorSection>
  )

  const size = (
    <ShapeInspectorSection title="粗细">
      <ShapeInspectorSegmentedControl
        onChange={(value) =>
          applyNextStyle(DefaultSizeStyle, value)
        }
        options={[
          { value: 's', label: '细' },
          { value: 'm', label: '中' },
          { value: 'l', label: '粗' },
          { value: 'xl', label: '特粗' },
        ]}
        value={null}
      />
    </ShapeInspectorSection>
  )

  const dash = (
    <ShapeInspectorSection title="线型">
      <ShapeInspectorSegmentedControl
        onChange={(value) =>
          applyNextStyle(DefaultDashStyle, value)
        }
        options={[
          { value: 'draw', label: '手绘' },
          { value: 'solid', label: '实线' },
          { value: 'dashed', label: '虚线' },
          { value: 'dotted', label: '点线' },
        ]}
        value={null}
      />
    </ShapeInspectorSection>
  )

  if (toolId === 'geo') {
    return (
      <CanvasToolPanelHeader
        description="在画布中连续创建形状"
        title="形状"
      >
        <ShapeInspectorSection title="形状类型">
          <select
            className="h-8 w-full rounded-md border border-divider bg-background px-2 text-[11px] outline-none focus:border-primary"
            defaultValue="rectangle"
            onChange={(event) =>
              applyNextStyle(
                GeoShapeGeoStyle,
                event.target.value,
              )
            }
          >
            <option value="rectangle">矩形</option>
            <option value="ellipse">椭圆</option>
            <option value="triangle">三角形</option>
            <option value="diamond">菱形</option>
            <option value="pentagon">五边形</option>
            <option value="hexagon">六边形</option>
            <option value="octagon">八边形</option>
            <option value="star">星形</option>
            <option value="cloud">云形</option>
            <option value="rhombus">平行四边形</option>
            <option value="trapezoid">梯形</option>
            <option value="arrow-right">右箭头</option>
            <option value="arrow-left">左箭头</option>
            <option value="arrow-up">上箭头</option>
            <option value="arrow-down">下箭头</option>
          </select>
        </ShapeInspectorSection>

        {colors}

        <ShapeInspectorSection title="填充">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(
                DefaultFillStyle,
                value,
              )
            }
            options={[
              { value: 'none', label: '无' },
              { value: 'semi', label: '半透明' },
              { value: 'solid', label: '实心' },
              { value: 'pattern', label: '图案' },
            ]}
            value={null}
          />
        </ShapeInspectorSection>

        {dash}
        {size}
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'arrow') {
    return (
      <CanvasToolPanelHeader
        description="在画布中连续创建连接线"
        title="连接"
      >
        {colors}
        {dash}
        {size}

        <ShapeInspectorSection title="起点">
          <ShapeInspectorArrowheadSelect
            onChange={(value) =>
              applyNextStyle(
                DefaultArrowheadStartStyle,
                value,
              )
            }
            value="none"
          />
        </ShapeInspectorSection>

        <ShapeInspectorSection title="终点">
          <ShapeInspectorArrowheadSelect
            onChange={(value) =>
              applyNextStyle(
                DefaultArrowheadEndStyle,
                value,
              )
            }
            value="arrow"
          />
        </ShapeInspectorSection>
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'scientific-chart') {
    return (
      <CanvasToolPanelHeader
        description="拖拽创建图表"
        title="图表"
      >
        <ShapeInspectorSection title="图表类型">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(
                ScientificChartTypeStyle,
                value,
              )
            }
            options={[
              { value: 'line', label: '折线' },
              { value: 'bar', label: '柱状' },
              { value: 'area', label: '面积' },
              { value: 'scatter', label: '散点' },
            ]}
            value={null}
          />
        </ShapeInspectorSection>

        {colors}
        {size}

        <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
          在画布中按住鼠标并拖拽创建图表。图表工具会保持激活，可连续创建多个图表。
        </div>
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'text') {
    return (
      <CanvasToolPanelHeader
        description="在画布中连续创建文本"
        title="文本"
      >
        {colors}

        <ShapeInspectorSection title="字体">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(
                DefaultFontStyle,
                value,
              )
            }
            options={[
              { value: 'draw', label: '手写' },
              { value: 'sans', label: '无衬线' },
              { value: 'serif', label: '衬线' },
              { value: 'mono', label: '等宽' },
            ]}
            value={null}
          />
        </ShapeInspectorSection>

        {size}

        <ShapeInspectorSection title="对齐">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(
                DefaultTextAlignStyle,
                value,
              )
            }
            options={[
              { value: 'start', label: '左' },
              { value: 'middle', label: '中' },
              { value: 'end', label: '右' },
            ]}
            value={null}
          />
        </ShapeInspectorSection>
      </CanvasToolPanelHeader>
    )
  }

  if (
    toolId === 'draw' ||
    toolId === 'highlight'
  ) {
    return (
      <CanvasToolPanelHeader
        description={
          toolId === 'highlight'
            ? '连续绘制高亮标记'
            : '连续自由绘制'
        }
        title={
          toolId === 'highlight'
            ? '高亮'
            : '自由绘制'
        }
      >
        {colors}
        {dash}
        {size}
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'note') {
    return (
      <CanvasToolPanelHeader
        description="在画布中连续创建便签"
        title="便签"
      >
        {colors}

        <ShapeInspectorSection title="填充">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(
                DefaultFillStyle,
                value,
              )
            }
            options={[
              { value: 'semi', label: '半透明' },
              { value: 'solid', label: '实心' },
              { value: 'pattern', label: '图案' },
            ]}
            value={null}
          />
        </ShapeInspectorSection>

        <ShapeInspectorSection title="字体">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(
                DefaultFontStyle,
                value,
              )
            }
            options={[
              { value: 'draw', label: '手写' },
              { value: 'sans', label: '无衬线' },
              { value: 'serif', label: '衬线' },
              { value: 'mono', label: '等宽' },
            ]}
            value={null}
          />
        </ShapeInspectorSection>

        {size}
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'frame') {
    return (
      <CanvasToolPanelHeader
        description="在画布中连续创建画框"
        title="画框"
      >
        {colors}
        {dash}
        {size}
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'eraser') {
    return (
      <CanvasToolPanelHeader
        description="拖过对象进行删除"
        title="橡皮擦"
      >
        <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
          橡皮擦将保持激活。手动点击“选择”或切换其他工具后退出。
        </div>
      </CanvasToolPanelHeader>
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-divider px-4 py-8 text-center">
      <p className="text-xs font-medium">
        {toolId === 'hand'
          ? '移动画布'
          : '选择工具'}
      </p>

      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        {toolId === 'hand'
          ? '拖动画布进行平移，滚轮用于缩放。'
          : '选择画布中的对象以编辑对应属性。'}
      </p>
    </div>
  )
}

function CanvasToolPanelHeader({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly children: import('react').ReactNode
}) {
  return (
    <div className="space-y-4">
      <header className="border-b border-divider pb-3">
        <h2 className="text-sm font-semibold">
          {title}
        </h2>

        <p className="mt-1 text-[11px] text-muted-foreground">
          {description}
        </p>
      </header>

      {children}
    </div>
  )
}
`

async function connectInspectorToActiveTool() {
  let source = await readText(paths.workspaceContainer)

  /*
   * 让右侧属性面板同时订阅当前工具。
   */
  if (
    !source.includes(
      "'canvas inspector active tool'",
    )
  ) {
    const marker = `  const selectedShapes = useValue(
    'canvas inspector selected shapes',
    () => editor?.getSelectedShapes() ?? [],
    [editor],
  )
`

    source = replaceRequired(
      source,
      marker,
      `${marker}
  const activeToolId = useValue(
    'canvas inspector active tool',
    () => editor?.getCurrentToolId() ?? 'select',
    [editor],
  )
`,
      'CanvasInspector activeToolId',
    )
  }

  /*
   * 选区优先；没有选区时显示当前工具设置。
   */
  const emptyBlockStart =
    '  if (selectedShapes.length === 0) {'
  const emptyBlockEnd =
    '  const selectedIds = selectedShapes.map((shape) => shape.id)'

  const startIndex = source.indexOf(emptyBlockStart)
  const endIndex = source.indexOf(
    emptyBlockEnd,
    startIndex,
  )

  if (
    startIndex === -1 ||
    endIndex === -1
  ) {
    throw new Error(
      '没有找到 CanvasInspectorContent 的空选区区域',
    )
  }

  const replacement = `  if (selectedShapes.length === 0) {
    return (
      <CanvasActiveToolPanel
        editor={editor}
        toolId={activeToolId}
      />
    )
  }

`

  source =
    source.slice(0, startIndex) +
    replacement +
    source.slice(endIndex)

  /*
   * 点击顶部创建工具时也打开右侧栏。
   */
  const keyStart =
    "  const inspectorSelectionKey = useValue("
  const keyEnd =
    '\n\n  const workbench = useSyncExternalStore('

  const keyStartIndex = source.indexOf(keyStart)
  const keyEndIndex = source.indexOf(
    keyEnd,
    keyStartIndex,
  )

  if (
    keyStartIndex === -1 ||
    keyEndIndex === -1
  ) {
    throw new Error(
      '没有找到 inspectorSelectionKey 区域',
    )
  }

  const nextKeyCode = `  const inspectorSelectionKey = useValue(
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

      if (
        toolId === 'select' ||
        toolId === 'hand'
      ) {
        return ''
      }

      return 'tool:' + toolId
    },
    [editor],
  )`

  source =
    source.slice(0, keyStartIndex) +
    nextKeyCode +
    source.slice(keyEndIndex)

  if (
    !source.includes(
      'function CanvasActiveToolPanel(',
    )
  ) {
    source = insertBeforeRequired(
      source,
      'const SHAPE_COLORS',
      activeToolPanelSource,
      'CanvasActiveToolPanel',
    )
  }

  await writeText(paths.workspaceContainer, source)
}

async function addSelectedChartEditor() {
  let source = await readText(paths.workspaceContainer)

  if (
    source.includes(
      "commonType === 'scientific-chart'",
    )
  ) {
    return
  }

  const marker =
    "      {commonType === 'geo' ? ("

  const chartEditor = `      {commonType === 'scientific-chart' ? (
        <ShapeInspectorSection title="图表类型">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              editor.setStyleForSelectedShapes(
                ScientificChartTypeStyle,
                value as ScientificChartType,
              )
            }
            options={[
              { value: 'line', label: '折线' },
              { value: 'bar', label: '柱状' },
              { value: 'area', label: '面积' },
              { value: 'scatter', label: '散点' },
            ]}
            value={getCommonShapeProp(
              selectedShapes,
              'chartType',
            )}
          />
        </ShapeInspectorSection>
      ) : null}

`

  source = replaceRequired(
    source,
    marker,
    chartEditor + marker,
    '选中图表属性编辑器',
  )

  source = replaceOptional(
    source,
    "    frame: '画框',",
    `    frame: '画框',
    'scientific-chart': '图表',`,
  )

  source = replaceOptional(
    source,
    "    frame: '编辑画框样式',",
    `    frame: '编辑画框样式',
    'scientific-chart': '编辑图表类型、颜色和展示样式',`,
  )

  /*
   * 科学图表也支持颜色和粗细。
   */
  source = replaceOptional(
    source,
    `    'frame',
    'mixed',`,
    `    'frame',
    'scientific-chart',
    'mixed',`,
  )

  await writeText(paths.workspaceContainer, source)
}

async function cleanWorkspaceShellEffect() {
  let source = await readText(paths.workspaceShell)

  source = replaceOptional(
    source,
    `  }, [
    inspectorSelectionKey,
    mode,
    'workspace inspector selection changed',
  ])`,
    `  }, [inspectorSelectionKey, mode])`,
  )

  await writeText(paths.workspaceShell, source)
}

function runPnpmInstall() {
  if (!shouldApply) {
    console.log('[dry-run] 将执行 pnpm install')
    return
  }

  console.log('')
  console.log('正在刷新 pnpm workspace 链接……')

  const command =
    process.platform === 'win32'
      ? 'pnpm.cmd'
      : 'pnpm'

  const result = spawnSync(
    command,
    ['install'],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `pnpm install 失败，退出码：${String(result.status)}`,
    )
  }
}

async function main() {
  console.log(
    shouldApply
      ? '正在修复当前已推送代码……'
      : '正在预览修复内容……',
  )

  await repairWorkspaceImports()
  await repairWorkspaceDependencies()
  await verifyScientificPublicApi()
  await configureEditorBehavior()
  await connectInspectorToActiveTool()
  await addSelectedChartEditor()
  await cleanWorkspaceShellEffect()

  runPnpmInstall()

  console.log('')
  console.log('修复完成：')
  console.log('  ✓ 恢复 WorkspaceContainer 完整导入')
  console.log('  ✓ 修复 scientific-plot workspace 依赖')
  console.log('  ✓ 点击工具时自动打开右侧功能面板')
  console.log('  ✓ 选中对象时显示对象编辑功能')
  console.log('  ✓ 图表工具显示专用配置')
  console.log('  ✓ 滚轮上滑放大、下滑缩小')
  console.log('  ✓ 创建工具保持激活')
  console.log('')
  console.log('现在执行：')
  console.log(
    '  pnpm --filter @hybrid-canvas/scientific-plot typecheck',
  )
  console.log(
    '  pnpm --filter @hybrid-canvas/desktop typecheck',
  )
  console.log('  pnpm dev')
}

main().catch((error) => {
  console.error('')
  console.error('修复失败：')
  console.error(
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  )
  process.exitCode = 1
})