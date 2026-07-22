#!/usr/bin/env node

/**
 * 工具预设面板、滚轮缩放、工具锁定与科学图表扩展
 *
 * 使用：
 *   保存为 scripts/add-tool-panels-and-chart.mjs
 *   node scripts/add-tool-panels-and-chart.mjs
 *
 * 建议随后执行：
 *   pnpm install
 *   pnpm format
 *   pnpm typecheck
 *   pnpm test:architecture
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const paths = {
  canvasContract: resolve(
    root,
    'editor/core/src/contracts/canvas-contract.ts',
  ),
  editorCanvas: resolve(
    root,
    'editor/core/src/react/EditorCanvas.tsx',
  ),
  toolbar: resolve(
    root,
    'editor/core/src/react/CanvasToolbar.tsx',
  ),
  workspaceContainer: resolve(
    root,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),
  desktopPackage: resolve(root, 'apps/desktop/package.json'),
  bootstrapApplication: resolve(
    root,
    'apps/desktop/src/bootstrap/application.ts',
  ),
  scientificPackage: resolve(
    root,
    'features/scientific-plot/package.json',
  ),
  scientificPublicApi: resolve(
    root,
    'features/scientific-plot/src/public-api.ts',
  ),
  scientificExtension: resolve(
    root,
    'features/scientific-plot/src/extension.ts',
  ),
  chartShape: resolve(
    root,
    'features/scientific-plot/src/shapes/ScientificChartShapeUtil.tsx',
  ),
  chartTool: resolve(
    root,
    'features/scientific-plot/src/tools/ScientificChartTool.ts',
  ),
  chartStyle: resolve(
    root,
    'features/scientific-plot/src/styles/chart-styles.ts',
  ),
}

async function readText(path) {
  return readFile(path, 'utf8')
}

async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

function replaceRequired(source, search, replacement, description) {
  const index = source.indexOf(search)

  if (index === -1) {
    throw new Error(`没有找到修改位置：${description}`)
  }

  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

function replaceOptional(source, search, replacement = '') {
  const index = source.indexOf(search)

  if (index === -1) {
    return source
  }

  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

function insertBeforeRequired(source, marker, content, description) {
  const index = source.indexOf(marker)

  if (index === -1) {
    throw new Error(`没有找到插入位置：${description}`)
  }

  return source.slice(0, index) + content + '\n\n' + source.slice(index)
}

async function updateJson(path, mutate) {
  const original = await readText(path)
  const hasBom = original.charCodeAt(0) === 0xfeff
  const jsonText = hasBom ? original.slice(1) : original
  const value = JSON.parse(jsonText)

  mutate(value)

  const next = `${JSON.stringify(value, null, 2)}\n`

  await writeText(path, hasBom ? `\ufeff${next}` : next)
}

const chartStylesSource = String.raw`import { StyleProp } from 'tldraw'

export type ScientificChartType =
  | 'line'
  | 'bar'
  | 'area'
  | 'scatter'

export const ScientificChartTypeStyle =
  StyleProp.defineEnum<ScientificChartType>(
    'hybrid-canvas:scientific-chart-type',
    {
      defaultValue: 'line',
      values: ['line', 'bar', 'area', 'scatter'],
    },
  )
`

const chartToolSource = String.raw`import { BaseBoxShapeTool } from 'tldraw'

export class ScientificChartTool extends BaseBoxShapeTool {
  static override id = 'scientific-chart'
  static override initial = 'idle'

  override shapeType = 'scientific-chart'
}
`

const chartShapeSource = String.raw`import { T } from '@tldraw/validate'
import type { CSSProperties, ReactElement } from 'react'
import {
  DefaultColorStyle,
  DefaultSizeStyle,
  Rectangle2d,
  ShapeUtil,
  type TLBaseShape,
  type TLDefaultColor,
  type TLDefaultSize,
  type TLIndicatorPath,
} from 'tldraw'

import {
  ScientificChartTypeStyle,
  type ScientificChartType,
} from '../styles/chart-styles'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'scientific-chart': ScientificChartShapeProps
  }
}

export interface ScientificChartShapeProps {
  readonly w: number
  readonly h: number
  readonly chartType: ScientificChartType
  readonly color: TLDefaultColor
  readonly size: TLDefaultSize
  readonly showAxes: boolean
  readonly showGrid: boolean
  readonly showLegend: boolean
}

export type ScientificChartShape = TLBaseShape<
  'scientific-chart',
  ScientificChartShapeProps
>

const COLOR_VALUES: Record<TLDefaultColor, string> = {
  black: '#1d1d1d',
  grey: '#6b7280',
  'light-violet': '#a78bfa',
  violet: '#7c3aed',
  blue: '#2563eb',
  'light-blue': '#60a5fa',
  yellow: '#eab308',
  orange: '#f97316',
  green: '#16a34a',
  'light-green': '#4ade80',
  'light-red': '#f87171',
  red: '#dc2626',
  white: '#ffffff',
}

const STROKE_WIDTHS: Record<TLDefaultSize, number> = {
  s: 2,
  m: 3,
  l: 4,
  xl: 6,
}

export class ScientificChartShapeUtil extends ShapeUtil<ScientificChartShape> {
  static override type = 'scientific-chart' as const

  static override props = {
    w: T.number,
    h: T.number,
    chartType: ScientificChartTypeStyle,
    color: DefaultColorStyle,
    size: DefaultSizeStyle,
    showAxes: T.boolean,
    showGrid: T.boolean,
    showLegend: T.boolean,
  }

  getDefaultProps(): ScientificChartShape['props'] {
    return {
      w: 420,
      h: 260,
      chartType: 'line',
      color: 'blue',
      size: 'm',
      showAxes: true,
      showGrid: true,
      showLegend: true,
    }
  }

  getGeometry(shape: ScientificChartShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override component(
    shape: ScientificChartShape,
  ): ReactElement | null {
    return <ScientificChartView shape={shape} />
  }

  override getIndicatorPath(
    shape: ScientificChartShape,
  ): TLIndicatorPath | undefined {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  override toSvg(
    shape: ScientificChartShape,
  ): ReactElement | null {
    const { w, h } = shape.props

    return (
      <foreignObject height={h} width={w} x={0} y={0}>
        <ScientificChartView shape={shape} />
      </foreignObject>
    )
  }
}

function ScientificChartView({
  shape,
}: {
  readonly shape: ScientificChartShape
}) {
  const {
    w,
    h,
    chartType,
    color,
    size,
    showAxes,
    showGrid,
    showLegend,
  } = shape.props

  const stroke = COLOR_VALUES[color]
  const strokeWidth = STROKE_WIDTHS[size]

  const padding = 34
  const chartWidth = Math.max(1, w - padding * 2)
  const chartHeight = Math.max(1, h - padding * 2)

  const values = [0.25, 0.52, 0.4, 0.76, 0.61, 0.88, 0.72]
  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(1, values.length - 1)) * chartWidth
      const y = padding + (1 - value) * chartHeight

      return String(x) + ',' + String(y)
    })
    .join(' ')

  const rootStyle: CSSProperties = {
    width: w,
    height: h,
    background: '#ffffff',
    border: '1px solid #d9dde3',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    userSelect: 'none',
  }

  return (
    <div style={rootStyle}>
      <svg
        aria-label="科学图表"
        height={h}
        role="img"
        viewBox={'0 0 ' + String(w) + ' ' + String(h)}
        width={w}
      >
        {showGrid
          ? [0.25, 0.5, 0.75].map((ratio) => {
              const y = padding + chartHeight * ratio

              return (
                <line
                  key={ratio}
                  stroke="#e8ebef"
                  strokeDasharray="4 4"
                  x1={padding}
                  x2={w - padding}
                  y1={y}
                  y2={y}
                />
              )
            })
          : null}

        {showAxes ? (
          <>
            <line
              stroke="#4b5563"
              strokeWidth="1.5"
              x1={padding}
              x2={padding}
              y1={padding}
              y2={h - padding}
            />
            <line
              stroke="#4b5563"
              strokeWidth="1.5"
              x1={padding}
              x2={w - padding}
              y1={h - padding}
              y2={h - padding}
            />
          </>
        ) : null}

        {chartType === 'bar'
          ? values.map((value, index) => {
              const slotWidth = chartWidth / values.length
              const barWidth = Math.max(4, slotWidth * 0.58)
              const barHeight = value * chartHeight
              const x =
                padding +
                index * slotWidth +
                (slotWidth - barWidth) / 2
              const y = h - padding - barHeight

              return (
                <rect
                  fill={stroke}
                  height={barHeight}
                  key={String(index)}
                  rx="2"
                  width={barWidth}
                  x={x}
                  y={y}
                />
              )
            })
          : null}

        {chartType === 'area' ? (
          <polygon
            fill={stroke}
            fillOpacity="0.2"
            points={
              String(padding) +
              ',' +
              String(h - padding) +
              ' ' +
              points +
              ' ' +
              String(w - padding) +
              ',' +
              String(h - padding)
            }
            stroke={stroke}
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
        ) : null}

        {chartType === 'line' ? (
          <polyline
            fill="none"
            points={points}
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
        ) : null}

        {chartType === 'scatter'
          ? values.map((value, index) => {
              const x =
                padding +
                (index / Math.max(1, values.length - 1)) *
                  chartWidth
              const y = padding + (1 - value) * chartHeight

              return (
                <circle
                  cx={x}
                  cy={y}
                  fill={stroke}
                  key={String(index)}
                  r={strokeWidth + 2}
                />
              )
            })
          : null}

        {showLegend ? (
          <>
            <circle
              cx={w - 92}
              cy={18}
              fill={stroke}
              r="4"
            />
            <text
              fill="#4b5563"
              fontFamily="sans-serif"
              fontSize="11"
              x={w - 82}
              y={22}
            >
              数据系列
            </text>
          </>
        ) : null}
      </svg>
    </div>
  )
}
`

const scientificExtensionSource = String.raw`import type { HybridCanvasExtension } from '@hybrid-canvas/canvas/extensions'

import { ScientificChartShapeUtil } from './shapes/ScientificChartShapeUtil'
import { ScientificChartTool } from './tools/ScientificChartTool'

export const scientificPlotExtension: HybridCanvasExtension = {
  id: '@hybrid-canvas/scientific-plot',
  version: '0.1.0',
  apiVersion: '1',
  shapeUtils: [ScientificChartShapeUtil],
  tools: [ScientificChartTool],
  shapeLabels: {
    'scientific-chart': '图表',
  },
}
`

async function createScientificChartExtension() {
  await writeText(paths.chartStyle, chartStylesSource)
  await writeText(paths.chartTool, chartToolSource)
  await writeText(paths.chartShape, chartShapeSource)
  await writeText(paths.scientificExtension, scientificExtensionSource)

  let publicApi = await readText(paths.scientificPublicApi)

  if (!publicApi.includes('scientificPlotExtension')) {
    publicApi += `
export { scientificPlotExtension } from './extension'
export {
  type ScientificChartShape,
  type ScientificChartShapeProps,
  ScientificChartShapeUtil,
} from './shapes/ScientificChartShapeUtil'
export {
  ScientificChartTypeStyle,
  type ScientificChartType,
} from './styles/chart-styles'
export { ScientificChartTool } from './tools/ScientificChartTool'
`
  }

  await writeText(paths.scientificPublicApi, publicApi)

  await updateJson(paths.scientificPackage, (pkg) => {
    pkg.dependencies ??= {}

    pkg.dependencies['@hybrid-canvas/canvas'] = 'workspace:*'
    pkg.dependencies['@tldraw/tlschema'] = 'catalog:'
    pkg.dependencies['@tldraw/validate'] = 'catalog:'
    pkg.dependencies.tldraw = 'catalog:'
    pkg.dependencies.react = 'catalog:'
    pkg.dependencies['react-dom'] = 'catalog:'

    pkg.devDependencies ??= {}
    pkg.devDependencies['@types/react'] = 'catalog:'
    pkg.devDependencies['@types/react-dom'] = 'catalog:'
  })

  await updateJson(paths.desktopPackage, (pkg) => {
    pkg.dependencies ??= {}
    pkg.dependencies['@hybrid-canvas/scientific-plot'] =
      'workspace:*'
  })
}

async function registerScientificChartExtension() {
  let source = await readText(paths.bootstrapApplication)

  if (
    !source.includes(
      "import { scientificPlotExtension } from '@hybrid-canvas/scientific-plot'",
    )
  ) {
    source = source.replace(
      "import { flowchartExtension } from '@hybrid-canvas/flowchart'\n",
      `import { flowchartExtension } from '@hybrid-canvas/flowchart'
import { scientificPlotExtension } from '@hybrid-canvas/scientific-plot'
`,
    )
  }

  source = replaceOptional(
    source,
    'extensions: [flowchartExtension],',
    'extensions: [flowchartExtension, scientificPlotExtension],',
  )

  await writeText(paths.bootstrapApplication, source)
}

async function updateCanvasToolIds() {
  let source = await readText(paths.canvasContract)

  source = source.replace(
    /export type CanvasToolId =[\s\S]*?\n\nexport interface CanvasBoundsViewModel/,
    `export type CanvasToolId =
  | 'select'
  | 'hand'
  | 'geo'
  | 'arrow'
  | 'scientific-chart'
  | 'text'
  | 'draw'
  | 'highlight'
  | 'eraser'
  | 'note'
  | 'frame'

export interface CanvasBoundsViewModel`,
  )

  await writeText(paths.canvasContract, source)
}

async function configureWheelAndToolLock() {
  let source = await readText(paths.editorCanvas)

  source = replaceOptional(
    source,
    'options: { maxPages: 100 },',
    `options: {
        maxPages: 100,
        cameraOptions: {
          wheelBehavior: 'zoom',
          zoomSpeed: 1,
        },
      },`,
  )

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

  await writeText(paths.editorCanvas, source)
}

async function replaceLineWithChartTool() {
  let source = await readText(paths.toolbar)

  if (!source.includes('ChartNoAxes,')) {
    source = source.replace(
      '  BringToFront,\n',
      `  BringToFront,
  ChartNoAxes,
`,
    )
  }

  source = source.replace(
    /\{\s*id: 'line',\s*label: '直线',\s*shortcut: 'L',\s*icon: LineChart,?\s*\},?/,
    `{
    id: 'scientific-chart',
    label: '图表',
    shortcut: 'C',
    icon: ChartNoAxes,
  },`,
  )

  source = source.replace(
    /\n\s*LineChart,/,
    '',
  )

  /*
   * 如果前面的脚本尚未添加过 line，则在连接工具后插入图表。
   */
  if (!source.includes("id: 'scientific-chart'")) {
    const arrowBlock = `  {
    id: 'arrow',
    label: '连接',
    shortcut: 'A',
    icon: ArrowRight,
  },
`

    source = replaceRequired(
      source,
      arrowBlock,
      `${arrowBlock}  {
    id: 'scientific-chart',
    label: '图表',
    shortcut: 'C',
    icon: ChartNoAxes,
  },
`,
      '连接工具',
    )
  }

  await writeText(paths.toolbar, source)
}

function ensureWorkspaceImports(source) {
  if (
    !source.includes(
      "from '@hybrid-canvas/scientific-plot'",
    )
  ) {
    const marker =
      "import { ConfirmationDialog } from '@hybrid-canvas/design-system'\n"

    source = replaceRequired(
      source,
      marker,
      `${marker}import {
  ScientificChartTypeStyle,
  type ScientificChartType,
} from '@hybrid-canvas/scientific-plot'
`,
      'scientific plot import',
    )
  }

  const tldrawImportPattern =
    /import\s*\{([\s\S]*?)\}\s*from 'tldraw'/

  const match = source.match(tldrawImportPattern)

  if (!match) {
    throw new Error('没有找到 WorkspaceContainer 的 tldraw import')
  }

  const requiredNames = [
    'DefaultArrowheadEndStyle',
    'DefaultArrowheadStartStyle',
    'DefaultColorStyle',
    'DefaultDashStyle',
    'DefaultFillStyle',
    'DefaultFontStyle',
    'DefaultSizeStyle',
    'DefaultTextAlignStyle',
    'GeoShapeGeoStyle',
    'type Editor',
    'type TLShape',
    'useValue',
  ]

  const current = match[1] ?? ''
  const names = new Set(
    current
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )

  for (const name of requiredNames) {
    names.add(name)
  }

  const replacement = `import {
  ${Array.from(names).sort().join(',\n  ')},
} from 'tldraw'`

  return source.replace(tldrawImportPattern, replacement)
}

const toolInspectorSource = String.raw`function CanvasActiveToolInspector({
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
    editor.setStyleForNextShapes(style, value as never)
  }

  const commonColorPanel = (
    <ShapeInspectorSection title="颜色">
      <div className="grid grid-cols-6 gap-1.5">
        {SHAPE_COLORS.map((color) => (
          <button
            aria-label={'设置默认颜色为' + color.label}
            className="size-7 rounded-md border transition-transform hover:scale-105"
            key={color.value}
            onClick={() =>
              applyNextStyle(DefaultColorStyle, color.value)
            }
            style={{ backgroundColor: color.css }}
            title={color.label}
            type="button"
          />
        ))}
      </div>
    </ShapeInspectorSection>
  )

  const sizePanel = (
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

  const dashPanel = (
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
      <ToolPanel title="形状" description="连续创建形状">
        <ShapeInspectorSection title="形状类型">
          <select
            className="h-8 w-full rounded-md border border-divider bg-background px-2 text-[11px]"
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
            <option value="star">星形</option>
            <option value="cloud">云形</option>
            <option value="arrow-right">右箭头</option>
            <option value="arrow-left">左箭头</option>
          </select>
        </ShapeInspectorSection>

        {commonColorPanel}

        <ShapeInspectorSection title="填充">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(DefaultFillStyle, value)
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

        {dashPanel}
        {sizePanel}
      </ToolPanel>
    )
  }

  if (toolId === 'arrow') {
    return (
      <ToolPanel title="连接" description="连续创建连接线">
        {commonColorPanel}
        {dashPanel}
        {sizePanel}

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
      </ToolPanel>
    )
  }

  if (toolId === 'scientific-chart') {
    return (
      <ToolPanel title="图表" description="拖拽创建科学图表">
        <ShapeInspectorSection title="图表类型">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(
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
            value={null}
          />
        </ShapeInspectorSection>

        {commonColorPanel}
        {sizePanel}

        <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
          在画布中按住鼠标拖拽创建图表。创建后选中图表，可继续编辑类型、颜色和尺寸。
        </div>
      </ToolPanel>
    )
  }

  if (toolId === 'text') {
    return (
      <ToolPanel title="文本" description="连续创建文本">
        {commonColorPanel}

        <ShapeInspectorSection title="字体">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(DefaultFontStyle, value)
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

        {sizePanel}

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
      </ToolPanel>
    )
  }

  if (toolId === 'draw' || toolId === 'highlight') {
    return (
      <ToolPanel
        title={toolId === 'highlight' ? '高亮' : '自由绘制'}
        description={
          toolId === 'highlight'
            ? '连续绘制高亮标记'
            : '连续自由绘制'
        }
      >
        {commonColorPanel}
        {dashPanel}
        {sizePanel}
      </ToolPanel>
    )
  }

  if (toolId === 'note') {
    return (
      <ToolPanel title="便签" description="连续创建便签">
        {commonColorPanel}

        <ShapeInspectorSection title="填充">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyNextStyle(DefaultFillStyle, value)
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
              applyNextStyle(DefaultFontStyle, value)
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

        {sizePanel}
      </ToolPanel>
    )
  }

  if (toolId === 'frame') {
    return (
      <ToolPanel title="画框" description="连续创建画框">
        {commonColorPanel}
        {dashPanel}
        {sizePanel}
      </ToolPanel>
    )
  }

  if (toolId === 'eraser') {
    return (
      <ToolPanel title="橡皮擦" description="拖动以删除对象">
        <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
          按住鼠标拖过对象进行删除。橡皮擦会保持激活，直到手动切换工具或按 Esc。
        </div>
      </ToolPanel>
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-divider px-4 py-8 text-center">
      <p className="text-xs font-medium">
        {toolId === 'hand' ? '移动画布' : '选择工具'}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        {toolId === 'hand'
          ? '拖动画布进行平移，滚轮用于缩放。'
          : '选择画布中的对象以编辑对应属性。'}
      </p>
    </div>
  )
}

function ToolPanel({
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
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {description}
        </p>
      </header>
      {children}
    </div>
  )
}
`

async function connectActiveToolInspector() {
  let source = await readText(paths.workspaceContainer)

  source = ensureWorkspaceImports(source)

  /*
   * 让属性栏订阅当前工具。
   */
  const selectedShapesMarker = `  const selectedShapes = useValue(
    'canvas inspector selected shapes',
    () => editor?.getSelectedShapes() ?? [],
    [editor],
  )
`

  if (
    source.includes(selectedShapesMarker) &&
    !source.includes("'canvas inspector active tool'")
  ) {
    source = replaceRequired(
      source,
      selectedShapesMarker,
      `${selectedShapesMarker}
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
   * 未选对象时显示当前工具配置，而不是只显示空状态。
   */
  const emptySelectionStart = `  if (selectedShapes.length === 0) {
    return (
      <div className="space-y-4">`

  const emptySelectionEnd = `      </div>
    )
  }

  const selectedIds = selectedShapes.map((shape) => shape.id)`

  const startIndex = source.indexOf(emptySelectionStart)
  const endIndex = source.indexOf(
    emptySelectionEnd,
    startIndex,
  )

  if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `  if (selectedShapes.length === 0) {
    return (
      <CanvasActiveToolInspector
        editor={editor}
        toolId={activeToolId}
      />
    )
  }

  const selectedIds = selectedShapes.map((shape) => shape.id)`

    source =
      source.slice(0, startIndex) +
      replacement +
      source.slice(endIndex + emptySelectionEnd.length)
  }

  /*
   * 工具切换也触发右侧栏自动打开。
   * select / hand 不强制打开；其他创建工具会打开。
   */
  source = source.replace(
    /const inspectorSelectionKey = useValue\([\s\S]*?\n  \)\n/,
    `const inspectorSelectionKey = useValue(
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

      if (toolId === 'select' || toolId === 'hand') {
        return ''
      }

      return 'tool:' + toolId
    },
    [editor],
  )
`,
  )

  if (!source.includes('function CanvasActiveToolInspector(')) {
    const marker = source.includes('const SHAPE_COLORS')
      ? 'const SHAPE_COLORS'
      : 'function CanvasSelectionGeometryStatus('

    source = insertBeforeRequired(
      source,
      marker,
      toolInspectorSource,
      'CanvasActiveToolInspector',
    )
  }

  /*
   * 图表对象选中后显示图表类型设置。
   */
  source = replaceOptional(
    source,
    `{commonType === 'geo' ? (`,
    `{commonType === 'scientific-chart' ? (
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

      {commonType === 'geo' ? (`,
  )

  source = replaceOptional(
    source,
    `    frame: '画框',
`,
    `    frame: '画框',
    'scientific-chart': '图表',
`,
  )

  source = replaceOptional(
    source,
    `    frame: '编辑画框样式',
`,
    `    frame: '编辑画框样式',
    'scientific-chart': '编辑图表类型、颜色和数据展示',
`,
  )

  await writeText(paths.workspaceContainer, source)
}

async function main() {
  console.log('正在接入工具预设面板和科学图表……')

  await createScientificChartExtension()
  await registerScientificChartExtension()
  await updateCanvasToolIds()
  await configureWheelAndToolLock()
  await replaceLineWithChartTool()
  await connectActiveToolInspector()

  console.log('')
  console.log('完成：')
  console.log('  ✓ 点击创建工具时自动打开对应右侧面板')
  console.log('  ✓ 形状、连接、文本、高亮等显示专属配置')
  console.log('  ✓ “直线”已替换为真正的“图表”工具')
  console.log('  ✓ 支持折线、柱状、面积和散点图')
  console.log('  ✓ 滚轮上滑放大、下滑缩小')
  console.log('  ✓ 缩放中心跟随鼠标位置')
  console.log('  ✓ 创建工具保持激活，不再自动切回选择')
  console.log('')
  console.log('接下来执行：')
  console.log('  pnpm install')
  console.log('  pnpm format')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
}

main().catch((error) => {
  console.error('')
  console.error('修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})