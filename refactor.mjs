#!/usr/bin/env node

/**
 * Hybrid Canvas — Tool Inspector Refactor / Phase 2
 *
 * 前提：
 *   已执行 tool-inspector-refactor-phase1.mjs
 *
 * 本阶段：
 * 1. 从 CanvasInspectorContent 中移除 CanvasActiveToolPanel。
 * 2. 建立 ToolInspectorRouter。
 * 3. 建立可复用的检查器控件。
 * 4. 将形状、自由绘制/高亮、科学图表拆成独立文件。
 * 5. 其余工具迁移到 BasicToolInspectors，保持现有能力。
 *
 * 使用：
 *   node tool-inspector-refactor-phase2.mjs
 *
 * 检查：
 *   node tool-inspector-refactor-phase2.mjs --dry-run
 */

import {
  access,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const ROOT_DIR = path.dirname(SCRIPT_PATH)
const DRY_RUN = process.argv.includes('--dry-run')

const INSPECTOR_ROOT = path.join(
  ROOT_DIR,
  'apps/desktop/src/presentation/workspace/inspector',
)

const PATHS = {
  packageJson: path.join(ROOT_DIR, 'package.json'),

  canvasInspector: path.join(
    INSPECTOR_ROOT,
    'CanvasInspectorContent.tsx',
  ),

  commonDirectory: path.join(INSPECTOR_ROOT, 'common'),
  toolsDirectory: path.join(INSPECTOR_ROOT, 'tools'),

  primitives: path.join(
    INSPECTOR_ROOT,
    'common/InspectorPrimitives.tsx',
  ),

  toolTypes: path.join(
    INSPECTOR_ROOT,
    'tools/types.ts',
  ),

  shapeTool: path.join(
    INSPECTOR_ROOT,
    'tools/ShapeToolInspector.tsx',
  ),

  drawTool: path.join(
    INSPECTOR_ROOT,
    'tools/DrawToolInspector.tsx',
  ),

  chartTool: path.join(
    INSPECTOR_ROOT,
    'tools/ScientificChartToolInspector.tsx',
  ),

  basicTools: path.join(
    INSPECTOR_ROOT,
    'tools/BasicToolInspectors.tsx',
  ),

  router: path.join(
    INSPECTOR_ROOT,
    'tools/ToolInspectorRouter.tsx',
  ),

  toolsIndex: path.join(
    INSPECTOR_ROOT,
    'tools/index.ts',
  ),
}

const ACTIVE_TOOL_START = 'function CanvasActiveToolPanel('
const ACTIVE_TOOL_END = 'function getCommonShapeProp('

const PRIMITIVES_SOURCE = `import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectList,
  type SelectOption,
  SelectTrigger,
} from '@hybrid-canvas/design-system'
import { useState } from 'react'
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  type Editor,
} from 'tldraw'

export const GEO_SHAPE_OPTIONS = [
  { value: 'rectangle', label: '矩形' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'triangle', label: '三角形' },
  { value: 'diamond', label: '菱形' },
  { value: 'pentagon', label: '五边形' },
  { value: 'hexagon', label: '六边形' },
  { value: 'octagon', label: '八边形' },
  { value: 'star', label: '星形' },
  { value: 'cloud', label: '云形' },
  { value: 'rhombus', label: '平行四边形' },
  { value: 'trapezoid', label: '梯形' },
  { value: 'arrow-right', label: '右箭头' },
  { value: 'arrow-left', label: '左箭头' },
  { value: 'arrow-up', label: '上箭头' },
  { value: 'arrow-down', label: '下箭头' },
] satisfies readonly SelectOption[]

export const ARROWHEAD_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'arrow', label: '箭头' },
  { value: 'triangle', label: '实心三角' },
  { value: 'square', label: '方形' },
  { value: 'dot', label: '圆点' },
  { value: 'diamond', label: '菱形' },
  { value: 'inverted', label: '反向三角' },
  { value: 'bar', label: '横线' },
] satisfies readonly SelectOption[]

export const SHAPE_COLORS = [
  { value: 'black', label: '黑色', css: '#1d1d1d' },
  { value: 'grey', label: '灰色', css: '#9ca3af' },
  { value: 'red', label: '红色', css: '#ef4444' },
  { value: 'orange', label: '橙色', css: '#f97316' },
  { value: 'yellow', label: '黄色', css: '#eab308' },
  { value: 'green', label: '绿色', css: '#22c55e' },
  { value: 'blue', label: '蓝色', css: '#3b82f6' },
  { value: 'violet', label: '紫色', css: '#8b5cf6' },
  { value: 'light-red', label: '浅红', css: '#fca5a5' },
  { value: 'light-green', label: '浅绿', css: '#86efac' },
  { value: 'light-blue', label: '浅蓝', css: '#93c5fd' },
  { value: 'light-violet', label: '浅紫', css: '#c4b5fd' },
] as const

export interface InspectorSectionProps {
  readonly title: string
  readonly description?: string
  readonly children: import('react').ReactNode
}

export function ShapeInspectorSection({
  title,
  description,
  children,
}: InspectorSectionProps) {
  return (
    <section className="space-y-2.5 border-b border-divider pb-4 last:border-b-0">
      <header className="space-y-0.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>

        {description ? (
          <p className="text-[10px] leading-4 text-muted-foreground/80">
            {description}
          </p>
        ) : null}
      </header>

      {children}
    </section>
  )
}

export function ToolPanelHeader({
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
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          {description}
        </p>
      </header>

      {children}
    </div>
  )
}

export function ShapeInspectorButton({
  children,
  onClick,
  className = '',
  disabled = false,
}: {
  readonly children: import('react').ReactNode
  readonly onClick: () => void
  readonly className?: string
  readonly disabled?: boolean
}) {
  return (
    <button
      className={
        'min-h-8 rounded-md border border-divider bg-background px-2 text-[11px] ' +
        'transition-colors hover:bg-accent disabled:cursor-not-allowed ' +
        'disabled:opacity-50 ' +
        className
      }
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function ShapeInspectorSegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  readonly options: readonly {
    readonly value: string
    readonly label: string
  }[]
  readonly value: string | null
  readonly onChange: (value: string) => void
  readonly ariaLabel?: string
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="grid gap-1.5"
      role="group"
      style={{
        gridTemplateColumns:
          'repeat(' + String(options.length) + ', minmax(0, 1fr))',
      }}
    >
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={
            'min-h-8 rounded-md border px-1 text-[10px] transition-colors ' +
            (value === option.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-divider bg-background hover:bg-accent')
          }
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export interface ShapeInspectorSelectProps {
  readonly type: string
  readonly options: readonly SelectOption[]
  readonly value: string
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}

export function ShapeInspectorSelect({
  type,
  options,
  value,
  disabled = false,
  onChange,
}: ShapeInspectorSelectProps) {
  const [open, setOpen] = useState(false)

  return (
    <Select
      data={options}
      disabled={disabled}
      onOpenChange={setOpen}
      onValueChange={onChange}
      open={open}
      type={type}
      value={value}
    >
      <SelectTrigger />

      <SelectContent>
        <SelectList>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectList>
      </SelectContent>
    </Select>
  )
}

export function ShapeInspectorArrowheadSelect({
  value,
  onChange,
}: {
  readonly value: string | null
  readonly onChange: (value: string) => void
}) {
  return (
    <ShapeInspectorSelect
      onChange={onChange}
      options={ARROWHEAD_OPTIONS}
      type="箭头端点"
      value={value ?? 'none'}
    />
  )
}

export function ToolColorSection({
  editor,
}: {
  readonly editor: Editor
}) {
  return (
    <ShapeInspectorSection title="颜色">
      <div className="grid grid-cols-6 gap-1.5">
        {SHAPE_COLORS.map((color) => (
          <button
            aria-label={'设置默认颜色为' + color.label}
            className="size-7 rounded-md border border-divider transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            key={color.value}
            onClick={() =>
              editor.setStyleForNextShapes(
                DefaultColorStyle,
                color.value,
              )
            }
            style={{ backgroundColor: color.css }}
            title={color.label}
            type="button"
          />
        ))}
      </div>
    </ShapeInspectorSection>
  )
}

export function ToolStrokeSizeSection({
  editor,
}: {
  readonly editor: Editor
}) {
  return (
    <ShapeInspectorSection
      description="快捷档位；后续阶段增加精确数值与滑杆。"
      title="粗细"
    >
      <ShapeInspectorSegmentedControl
        ariaLabel="默认线条粗细"
        onChange={(value) =>
          editor.setStyleForNextShapes(DefaultSizeStyle, value as never)
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
}

export function ToolDashSection({
  editor,
}: {
  readonly editor: Editor
}) {
  return (
    <ShapeInspectorSection title="线型">
      <ShapeInspectorSegmentedControl
        ariaLabel="默认线型"
        onChange={(value) =>
          editor.setStyleForNextShapes(DefaultDashStyle, value as never)
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
}

export function ToolFillSection({
  editor,
  includeNone = true,
}: {
  readonly editor: Editor
  readonly includeNone?: boolean
}) {
  const options = includeNone
    ? [
        { value: 'none', label: '无' },
        { value: 'semi', label: '半透明' },
        { value: 'solid', label: '实心' },
        { value: 'pattern', label: '图案' },
      ]
    : [
        { value: 'semi', label: '半透明' },
        { value: 'solid', label: '实心' },
        { value: 'pattern', label: '图案' },
      ]

  return (
    <ShapeInspectorSection title="填充">
      <ShapeInspectorSegmentedControl
        ariaLabel="默认填充"
        onChange={(value) =>
          editor.setStyleForNextShapes(DefaultFillStyle, value as never)
        }
        options={options}
        value={null}
      />
    </ShapeInspectorSection>
  )
}

export function InspectorHint({
  children,
}: {
  readonly children: import('react').ReactNode
}) {
  return (
    <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
      {children}
    </div>
  )
}
`

const TOOL_TYPES_SOURCE = `import type { Editor } from 'tldraw'

export interface ToolInspectorProps {
  readonly editor: Editor
}

export interface ToolInspectorRouterProps extends ToolInspectorProps {
  readonly toolId: string
}
`

const SHAPE_TOOL_SOURCE = `import { GeoShapeGeoStyle } from 'tldraw'
import {
  GEO_SHAPE_OPTIONS,
  ShapeInspectorSection,
  ShapeInspectorSelect,
  ToolColorSection,
  ToolDashSection,
  ToolFillSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function ShapeToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="在画布中拖动创建形状；以下参数用于下一个新形状。"
      title="形状"
    >
      <ShapeInspectorSection title="形状类型">
        <ShapeInspectorSelect
          onChange={(value) =>
            editor.setStyleForNextShapes(
              GeoShapeGeoStyle,
              value as never,
            )
          }
          options={GEO_SHAPE_OPTIONS}
          type="形状"
          value="rectangle"
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolFillSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />
    </ToolPanelHeader>
  )
}
`

const DRAW_TOOL_SOURCE = `import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolDashSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export interface DrawToolInspectorProps extends ToolInspectorProps {
  readonly variant: 'draw' | 'highlight'
}

export function DrawToolInspector({
  editor,
  variant,
}: DrawToolInspectorProps) {
  const isHighlight = variant === 'highlight'

  return (
    <ToolPanelHeader
      description={
        isHighlight
          ? '连续绘制高亮标记；以下参数用于下一条高亮笔触。'
          : '连续自由绘制；以下参数用于下一条笔触。'
      }
      title={isHighlight ? '高亮' : '自由绘制'}
    >
      <ToolColorSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      {isHighlight ? (
        <ShapeInspectorSection title="高亮外观">
          <ShapeInspectorSegmentedControl
            ariaLabel="高亮透明度"
            onChange={() => {
              // 高亮透明度需要独立 StyleProp，后续由 freehand feature 提供。
            }}
            options={[
              { value: 'light', label: '浅' },
              { value: 'medium', label: '中' },
              { value: 'strong', label: '深' },
            ]}
            value="medium"
          />
        </ShapeInspectorSection>
      ) : (
        <ToolDashSection editor={editor} />
      )}

      <ShapeInspectorSection
        description="当前阶段保留 tldraw 原生绘制行为。"
        title="平滑与稳定"
      >
        <ShapeInspectorSegmentedControl
          ariaLabel="笔触平滑方式"
          onChange={() => {
            // 后续接入 freehand extension 的 smoothing record/style。
          }}
          options={[
            { value: 'none', label: '关闭' },
            { value: 'basic', label: '基础' },
            { value: 'weighted', label: '加权' },
            { value: 'stabilizer', label: '稳定器' },
          ]}
          value="basic"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        下一阶段将接入精确笔刷尺寸、不透明度、流量、压感映射、稳定器和笔刷预设。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const CHART_TOOL_SOURCE = `import {
  type ScientificChartType,
  ScientificChartTypeStyle,
} from '@hybrid-canvas/scientific-plot'
import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function ScientificChartToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="选择图表类型并拖动创建；创建后可配置数据、系列和坐标轴。"
      title="图表"
    >
      <ShapeInspectorSection title="图表类型">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认图表类型"
          onChange={(value) =>
            editor.setStyleForNextShapes(
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

      <ShapeInspectorSection
        description="第一阶段使用示例数据；后续接入 CSV、粘贴和工作区数据集。"
        title="数据来源"
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-9 rounded-md border border-divider bg-background px-2 text-[11px] hover:bg-accent"
            type="button"
          >
            示例数据
          </button>

          <button
            className="min-h-9 rounded-md border border-divider bg-background px-2 text-[11px] text-muted-foreground hover:bg-accent"
            disabled
            type="button"
          >
            导入数据
          </button>
        </div>
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <InspectorHint>
        创建图表后，右栏将切换为图表对象属性：数据、系列、X/Y
        轴、图例、标签、注释、主题和导出。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const BASIC_TOOLS_SOURCE = `import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultFontStyle,
  DefaultTextAlignStyle,
} from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorArrowheadSelect,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolDashSection,
  ToolFillSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function ArrowToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="在对象之间创建连接线；以下参数用于下一条连接线。"
      title="连接"
    >
      <ShapeInspectorSection title="路由">
        <ShapeInspectorSegmentedControl
          ariaLabel="连接线路由"
          onChange={() => {
            // 后续由 flowchart feature 提供路由 StyleProp。
          }}
          options={[
            { value: 'straight', label: '直线' },
            { value: 'curved', label: '曲线' },
            { value: 'orthogonal', label: '正交' },
          ]}
          value="straight"
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="起点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForNextShapes(
              ArrowShapeArrowheadStartStyle,
              value as never,
            )
          }
          value="none"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="终点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForNextShapes(
              ArrowShapeArrowheadEndStyle,
              value as never,
            )
          }
          value="arrow"
        />
      </ShapeInspectorSection>
    </ToolPanelHeader>
  )
}

export function TextToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="单击创建自动宽度文本，拖动创建固定宽度文本框。"
      title="文本"
    >
      <ToolColorSection editor={editor} />

      <ShapeInspectorSection title="字体分类">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认字体分类"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              DefaultFontStyle,
              value as never,
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

      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="对齐">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认文本对齐"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              DefaultTextAlignStyle,
              value as never,
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
    </ToolPanelHeader>
  )
}

export function NoteToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="在画布中创建便签并立即输入内容。"
      title="便签"
    >
      <ToolColorSection editor={editor} />
      <ToolFillSection editor={editor} includeNone={false} />

      <ShapeInspectorSection title="字体">
        <ShapeInspectorSegmentedControl
          ariaLabel="便签字体"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              DefaultFontStyle,
              value as never,
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

      <ToolStrokeSizeSection editor={editor} />
    </ToolPanelHeader>
  )
}

export function FrameToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="拖动创建用于组织内容和导出的画框。"
      title="画框"
    >
      <ShapeInspectorSection title="尺寸预设">
        <ShapeInspectorSegmentedControl
          ariaLabel="画框尺寸预设"
          onChange={() => {
            // 后续由 workspace/frame extension 提供尺寸预设。
          }}
          options={[
            { value: 'custom', label: '自定义' },
            { value: 'screen', label: '屏幕' },
            { value: 'paper', label: '纸张' },
            { value: 'slide', label: '演示' },
          ]}
          value="custom"
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <InspectorHint>
        下一阶段增加精确尺寸、裁剪内容、内边距、布局网格和导出区域。
      </InspectorHint>
    </ToolPanelHeader>
  )
}

export function EraserToolInspector() {
  return (
    <ToolPanelHeader
      description="拖过对象或笔触进行擦除。"
      title="橡皮擦"
    >
      <ShapeInspectorSection title="擦除方式">
        <ShapeInspectorSegmentedControl
          ariaLabel="擦除方式"
          onChange={() => {
            // 后续接入 eraser tool state。
          }}
          options={[
            { value: 'object', label: '对象' },
            { value: 'stroke', label: '笔画' },
            { value: 'partial', label: '局部' },
          ]}
          value="object"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        当前实现使用对象擦除。笔画擦除和局部路径切割需要独立工具状态支持。
      </InspectorHint>
    </ToolPanelHeader>
  )
}

export function HandToolInspector() {
  return (
    <ToolPanelHeader
      description="拖动画布进行平移，滚轮或触控板用于缩放。"
      title="移动画布"
    >
      <ShapeInspectorSection title="快速视图">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-8 rounded-md border border-divider bg-background px-2 text-[11px] hover:bg-accent"
            type="button"
          >
            适合内容
          </button>

          <button
            className="min-h-8 rounded-md border border-divider bg-background px-2 text-[11px] hover:bg-accent"
            type="button"
          >
            100%
          </button>
        </div>
      </ShapeInspectorSection>
    </ToolPanelHeader>
  )
}

export function SelectToolInspector() {
  return (
    <ToolPanelHeader
      description="选择画布中的对象以编辑属性。"
      title="选择"
    >
      <ShapeInspectorSection title="选择辅助">
        <ShapeInspectorSegmentedControl
          ariaLabel="框选方式"
          onChange={() => {
            // 后续接入 selection tool preferences。
          }}
          options={[
            { value: 'contain', label: '完全包含' },
            { value: 'intersect', label: '相交即选' },
          ]}
          value="intersect"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        按住 Shift 可多选；Alt 拖动可复制；双击对象可进入专用编辑。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const ROUTER_SOURCE = `import { DrawToolInspector } from './DrawToolInspector'
import {
  ArrowToolInspector,
  EraserToolInspector,
  FrameToolInspector,
  HandToolInspector,
  NoteToolInspector,
  SelectToolInspector,
  TextToolInspector,
} from './BasicToolInspectors'
import { ScientificChartToolInspector } from './ScientificChartToolInspector'
import { ShapeToolInspector } from './ShapeToolInspector'
import type { ToolInspectorRouterProps } from './types'

export function ToolInspectorRouter({
  editor,
  toolId,
}: ToolInspectorRouterProps) {
  switch (toolId) {
    case 'geo':
      return <ShapeToolInspector editor={editor} />

    case 'draw':
      return (
        <DrawToolInspector
          editor={editor}
          variant="draw"
        />
      )

    case 'highlight':
      return (
        <DrawToolInspector
          editor={editor}
          variant="highlight"
        />
      )

    case 'scientific-chart':
      return <ScientificChartToolInspector editor={editor} />

    case 'arrow':
      return <ArrowToolInspector editor={editor} />

    case 'text':
      return <TextToolInspector editor={editor} />

    case 'note':
      return <NoteToolInspector editor={editor} />

    case 'frame':
      return <FrameToolInspector editor={editor} />

    case 'eraser':
      return <EraserToolInspector />

    case 'hand':
      return <HandToolInspector />

    case 'select':
    default:
      return <SelectToolInspector />
  }
}
`

const TOOLS_INDEX_SOURCE = `export { ToolInspectorRouter } from './ToolInspectorRouter'
export type {
  ToolInspectorProps,
  ToolInspectorRouterProps,
} from './types'
`

async function main() {
  console.log('')
  console.log('Hybrid Canvas — Tool Inspector Refactor / Phase 2')
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'write'}`)
  console.log('')

  await assertFile(PATHS.packageJson)
  await assertFile(PATHS.canvasInspector)

  const originalCanvasInspector = await readUtf8(
    PATHS.canvasInspector,
  )

  const transformedCanvasInspector =
    transformCanvasInspector(originalCanvasInspector)

  if (DRY_RUN) {
    console.log('✓ Phase 1 output detected')
    console.log('✓ CanvasActiveToolPanel can be extracted')
    console.log('✓ CanvasInspectorContent can be patched safely')
    console.log('')
    return
  }

  const backupDirectory = await createBackupDirectory()

  await backupFile(
    PATHS.canvasInspector,
    path.join(
      backupDirectory,
      'CanvasInspectorContent.tsx',
    ),
  )

  await mkdir(PATHS.commonDirectory, { recursive: true })
  await mkdir(PATHS.toolsDirectory, { recursive: true })

  await writeUtf8(PATHS.primitives, PRIMITIVES_SOURCE)
  await writeUtf8(PATHS.toolTypes, TOOL_TYPES_SOURCE)
  await writeUtf8(PATHS.shapeTool, SHAPE_TOOL_SOURCE)
  await writeUtf8(PATHS.drawTool, DRAW_TOOL_SOURCE)
  await writeUtf8(PATHS.chartTool, CHART_TOOL_SOURCE)
  await writeUtf8(PATHS.basicTools, BASIC_TOOLS_SOURCE)
  await writeUtf8(PATHS.router, ROUTER_SOURCE)
  await writeUtf8(PATHS.toolsIndex, TOOLS_INDEX_SOURCE)
  await writeUtf8(
    PATHS.canvasInspector,
    transformedCanvasInspector,
  )

  console.log('')
  console.log(`Backup: ${relative(backupDirectory)}`)
  console.log('')
  console.log('Phase 2 complete:')
  console.log('  ✓ ToolInspectorRouter created')
  console.log('  ✓ Shape tool inspector extracted')
  console.log('  ✓ Draw and highlight inspectors extracted')
  console.log('  ✓ Scientific chart tool inspector extracted')
  console.log('  ✓ Remaining tool inspectors preserved')
  console.log('  ✓ Shared inspector primitives created')
  console.log('')
  console.log('Run:')
  console.log(
    '  pnpm exec biome check --write apps/desktop/src/presentation/workspace/inspector',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
}

function transformCanvasInspector(source) {
  const startIndex = source.indexOf(ACTIVE_TOOL_START)
  const endIndex = source.indexOf(ACTIVE_TOOL_END)

  if (startIndex === -1) {
    if (source.includes('<ToolInspectorRouter')) {
      console.log(
        'ToolInspectorRouter is already present; no second transformation is needed.',
      )
      return source
    }

    throw new Error(
      `Could not find ${ACTIVE_TOOL_START}. ` +
        'Run phase 1 first or inspect the source manually.',
    )
  }

  if (endIndex === -1 || endIndex <= startIndex) {
    throw new Error(
      `Could not find valid end marker ${ACTIVE_TOOL_END}. ` +
        'Refusing an unsafe partial edit.',
    )
  }

  let nextSource =
    source.slice(0, startIndex) + source.slice(endIndex)

  nextSource = nextSource.replace(
    '<CanvasActiveToolPanel editor={editor} toolId={activeToolId} />',
    '<ToolInspectorRouter editor={editor} toolId={activeToolId} />',
  )

  nextSource = removeDesignSystemImport(nextSource)
  nextSource = nextSource.replace(
    "import { useState } from 'react'\n",
    '',
  )

  nextSource = nextSource.replace(
    '  type Editor,\n',
    '',
  )

  const tldrawImportEnd = "} from 'tldraw'\n"

  const commonImports = `import {
  GEO_SHAPE_OPTIONS,
  SHAPE_COLORS,
  ShapeInspectorArrowheadSelect,
  ShapeInspectorButton,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ShapeInspectorSelect,
} from './common/InspectorPrimitives'
import { ToolInspectorRouter } from './tools/ToolInspectorRouter'
`

  if (!nextSource.includes(tldrawImportEnd)) {
    throw new Error(
      'Could not find the tldraw import block in CanvasInspectorContent.',
    )
  }

  nextSource = nextSource.replace(
    tldrawImportEnd,
    tldrawImportEnd + commonImports,
  )

  nextSource = nextSource.replace(/\n{3,}/g, '\n\n')

  return nextSource.trimEnd() + '\n'
}

function removeDesignSystemImport(source) {
  const importStart = source.indexOf('import {')
  const importPackage =
    "} from '@hybrid-canvas/design-system'\n"

  if (importStart === -1) {
    return source
  }

  const packageEnd = source.indexOf(importPackage, importStart)

  if (packageEnd === -1) {
    return source
  }

  const endIndex = packageEnd + importPackage.length
  const importBlock = source.slice(importStart, endIndex)

  if (!importBlock.includes('@hybrid-canvas/design-system')) {
    return source
  }

  return source.slice(0, importStart) + source.slice(endIndex)
}

async function assertFile(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(
      `Missing required file: ${relative(filePath)}\n` +
        'Run phase 1 before running phase 2.',
    )
  }
}

async function createBackupDirectory() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupDirectory = path.join(
    ROOT_DIR,
    '.refactor-backup',
    `inspector-phase2-${timestamp}`,
  )

  await mkdir(backupDirectory, { recursive: true })
  return backupDirectory
}

async function backupFile(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(source, destination)
}

async function readUtf8(filePath) {
  return readFile(filePath, 'utf8')
}

async function writeUtf8(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })

  await writeFile(
    filePath,
    content
      .replaceAll('\r\n', '\n')
      .replace(/^\uFEFF/, '')
      .trimEnd() + '\n',
    'utf8',
  )

  console.log(`Updated: ${relative(filePath)}`)
}

function relative(filePath) {
  return path.relative(ROOT_DIR, filePath) || '.'
}

main().catch((error) => {
  console.error('')
  console.error('Phase 2 failed.')
  console.error(error instanceof Error ? error.message : error)
  console.error('')
  process.exitCode = 1
})