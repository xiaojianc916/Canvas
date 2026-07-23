#!/usr/bin/env node

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

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')

const INSPECTOR_ROOT = path.join(
  ROOT_DIR,
  'apps/desktop/src/presentation/workspace/inspector',
)

const SELECTIONS_DIRECTORY = path.join(
  INSPECTOR_ROOT,
  'selections',
)

const PATHS = {
  packageJson: path.join(ROOT_DIR, 'package.json'),

  canvasInspector: path.join(
    INSPECTOR_ROOT,
    'CanvasInspectorContent.tsx',
  ),

  shared: path.join(
    SELECTIONS_DIRECTORY,
    'SelectionInspectorShared.tsx',
  ),

  standard: path.join(
    SELECTIONS_DIRECTORY,
    'StandardSelectionInspector.tsx',
  ),

  geo: path.join(
    SELECTIONS_DIRECTORY,
    'GeoSelectionInspector.tsx',
  ),

  text: path.join(
    SELECTIONS_DIRECTORY,
    'TextSelectionInspector.tsx',
  ),

  note: path.join(
    SELECTIONS_DIRECTORY,
    'NoteSelectionInspector.tsx',
  ),

  arrow: path.join(
    SELECTIONS_DIRECTORY,
    'ArrowSelectionInspector.tsx',
  ),

  line: path.join(
    SELECTIONS_DIRECTORY,
    'LineSelectionInspector.tsx',
  ),

  draw: path.join(
    SELECTIONS_DIRECTORY,
    'DrawSelectionInspector.tsx',
  ),

  highlight: path.join(
    SELECTIONS_DIRECTORY,
    'HighlightSelectionInspector.tsx',
  ),

  frame: path.join(
    SELECTIONS_DIRECTORY,
    'FrameSelectionInspector.tsx',
  ),

  chart: path.join(
    SELECTIONS_DIRECTORY,
    'ScientificChartSelectionInspector.tsx',
  ),

  multi: path.join(
    SELECTIONS_DIRECTORY,
    'MultiSelectionInspector.tsx',
  ),

  generic: path.join(
    SELECTIONS_DIRECTORY,
    'GenericSelectionInspector.tsx',
  ),

  router: path.join(
    SELECTIONS_DIRECTORY,
    'SelectionInspectorRouter.tsx',
  ),

  index: path.join(
    SELECTIONS_DIRECTORY,
    'index.ts',
  ),
}

const CANVAS_INSPECTOR_SOURCE = `import { useEditor } from '@hybrid-canvas/canvas/react'
import { useValue } from 'tldraw'
import { SelectionInspectorRouter } from './selections/SelectionInspectorRouter'
import { ToolInspectorRouter } from './tools/ToolInspectorRouter'

export interface CanvasInspectorContentProps {
  readonly hasActiveCanvas: boolean
}

export function CanvasInspectorContent({
  hasActiveCanvas,
}: CanvasInspectorContentProps) {
  const editor = useEditor()

  const selectedShapes = useValue(
    'canvas inspector selected shapes',
    () => editor?.getSelectedShapes() ?? [],
    [editor],
  )

  const activeToolId = useValue(
    'canvas inspector active tool',
    () => editor?.getCurrentToolId() ?? 'select',
    [editor],
  )

  if (!hasActiveCanvas || !editor) {
    return (
      <div className="rounded-lg border border-dashed border-divider px-4 py-10 text-center">
        <p className="text-xs font-medium">没有活动画布</p>

        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          激活一个画布后，可以在这里编辑工具和对象属性。
        </p>
      </div>
    )
  }

  if (selectedShapes.length === 0) {
    return (
      <ToolInspectorRouter
        editor={editor}
        toolId={activeToolId}
      />
    )
  }

  return (
    <SelectionInspectorRouter
      editor={editor}
      shapes={selectedShapes}
    />
  )
}
`

const SHARED_SOURCE = `import type { ReactNode } from 'react'
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  type Editor,
  type TLShape,
} from 'tldraw'
import {
  SHAPE_COLORS,
  ShapeInspectorButton,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
} from '../common/InspectorPrimitives'

export interface SelectionInspectorProps {
  readonly editor: Editor
  readonly shapes: readonly TLShape[]
}

export interface SelectionInspectorLayoutProps {
  readonly title: string
  readonly description: string
  readonly count?: number
  readonly children: ReactNode
}

export function SelectionInspectorLayout({
  title,
  description,
  count,
  children,
}: SelectionInspectorLayoutProps) {
  return (
    <div className="space-y-4">
      <header className="border-b border-divider pb-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold">
            {title}
          </h2>

          {count && count > 1 ? (
            <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          {description}
        </p>
      </header>

      {children}
    </div>
  )
}

export function getCommonStringProp(
  shapes: readonly TLShape[],
  key: string,
): string | null {
  const firstShape = shapes[0]

  if (!firstShape) {
    return null
  }

  const firstProps =
    firstShape.props as unknown as Record<string, unknown>

  const firstValue = firstProps[key]

  if (typeof firstValue !== 'string') {
    return null
  }

  const isShared = shapes.every((shape) => {
    const props =
      shape.props as unknown as Record<string, unknown>

    return props[key] === firstValue
  })

  return isShared ? firstValue : null
}

export function SelectionColorSection({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonColor = getCommonStringProp(
    shapes,
    'color',
  )

  return (
    <ShapeInspectorSection
      description={
        commonColor === null && shapes.length > 1
          ? '当前选择包含多个颜色；选择颜色后将统一覆盖。'
          : undefined
      }
      title="颜色"
    >
      <div className="grid grid-cols-6 gap-1.5">
        {SHAPE_COLORS.map((color) => (
          <button
            aria-label={'设置颜色为' + color.label}
            aria-pressed={commonColor === color.value}
            className={
              'size-7 rounded-md border border-divider transition-transform ' +
              'hover:scale-105 focus-visible:outline-none ' +
              'focus-visible:ring-2 focus-visible:ring-primary ' +
              (commonColor === color.value
                ? 'ring-2 ring-primary ring-offset-1'
                : '')
            }
            key={color.value}
            onClick={() =>
              editor.setStyleForSelectedShapes(
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

export function SelectionFillSection({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonFill = getCommonStringProp(
    shapes,
    'fill',
  )

  return (
    <ShapeInspectorSection
      description={
        commonFill === null && shapes.length > 1
          ? '混合填充'
          : undefined
      }
      title="填充"
    >
      <ShapeInspectorSegmentedControl
        ariaLabel="对象填充"
        onChange={(value) =>
          editor.setStyleForSelectedShapes(
            DefaultFillStyle,
            value as never,
          )
        }
        options={[
          { value: 'none', label: '无' },
          { value: 'semi', label: '半透明' },
          { value: 'solid', label: '实心' },
          { value: 'pattern', label: '图案' },
        ]}
        value={commonFill}
      />
    </ShapeInspectorSection>
  )
}

export function SelectionStrokeSections({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonDash = getCommonStringProp(
    shapes,
    'dash',
  )

  const commonSize = getCommonStringProp(
    shapes,
    'size',
  )

  return (
    <>
      <ShapeInspectorSection
        description={
          commonDash === null && shapes.length > 1
            ? '混合线型'
            : undefined
        }
        title="线型"
      >
        <ShapeInspectorSegmentedControl
          ariaLabel="对象线型"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              DefaultDashStyle,
              value as never,
            )
          }
          options={[
            { value: 'draw', label: '手绘' },
            { value: 'solid', label: '实线' },
            { value: 'dashed', label: '虚线' },
            { value: 'dotted', label: '点线' },
          ]}
          value={commonDash}
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection
        description={
          commonSize === null && shapes.length > 1
            ? '混合粗细'
            : '使用 tldraw 样式档位'
        }
        title="粗细"
      >
        <ShapeInspectorSegmentedControl
          ariaLabel="对象粗细"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              DefaultSizeStyle,
              value as never,
            )
          }
          options={[
            { value: 's', label: '细' },
            { value: 'm', label: '中' },
            { value: 'l', label: '粗' },
            { value: 'xl', label: '特粗' },
          ]}
          value={commonSize}
        />
      </ShapeInspectorSection>
    </>
  )
}

export function SelectionArrangementSection({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const shapeIds = shapes.map((shape) => shape.id)

  return (
    <ShapeInspectorSection title="排列">
      <div className="grid grid-cols-2 gap-2">
        <ShapeInspectorButton
          onClick={() => editor.bringToFront(shapeIds)}
        >
          置于顶层
        </ShapeInspectorButton>

        <ShapeInspectorButton
          onClick={() => editor.sendToBack(shapeIds)}
        >
          置于底层
        </ShapeInspectorButton>

        <ShapeInspectorButton
          onClick={() => editor.bringForward(shapeIds)}
        >
          上移一层
        </ShapeInspectorButton>

        <ShapeInspectorButton
          onClick={() => editor.sendBackward(shapeIds)}
        >
          下移一层
        </ShapeInspectorButton>
      </div>
    </ShapeInspectorSection>
  )
}

export function SelectionObjectActionsSection({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const shapeIds = shapes.map((shape) => shape.id)
  const allLocked = shapes.every((shape) => shape.isLocked)

  const toggleLocked = () => {
    editor.updateShapes(
      shapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        isLocked: !allLocked,
      })) as never,
    )
  }

  return (
    <ShapeInspectorSection title="对象操作">
      <div className="grid grid-cols-2 gap-2">
        <ShapeInspectorButton
          onClick={() => editor.duplicateShapes(shapeIds)}
        >
          复制
        </ShapeInspectorButton>

        <ShapeInspectorButton onClick={toggleLocked}>
          {allLocked ? '解除锁定' : '锁定'}
        </ShapeInspectorButton>

        <ShapeInspectorButton
          className="col-span-2 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => editor.deleteShapes(shapeIds)}
        >
          删除对象
        </ShapeInspectorButton>
      </div>
    </ShapeInspectorSection>
  )
}
`

const STANDARD_SOURCE = `import {
  SelectionArrangementSection,
  SelectionColorSection,
  SelectionFillSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export interface StandardSelectionInspectorProps
  extends SelectionInspectorProps {
  readonly title: string
  readonly description: string
  readonly showColor?: boolean
  readonly showFill?: boolean
  readonly showStroke?: boolean
}

export function StandardSelectionInspector({
  editor,
  shapes,
  title,
  description,
  showColor = true,
  showFill = false,
  showStroke = true,
}: StandardSelectionInspectorProps) {
  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      count={shapes.length}
      description={description}
      title={title}
    >
      {showColor ? (
        <SelectionColorSection {...sharedProps} />
      ) : null}

      {showFill ? (
        <SelectionFillSection {...sharedProps} />
      ) : null}

      {showStroke ? (
        <SelectionStrokeSections {...sharedProps} />
      ) : null}

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
`

const GEO_SOURCE = `import { GeoShapeGeoStyle } from 'tldraw'
import {
  GEO_SHAPE_OPTIONS,
  ShapeInspectorSection,
  ShapeInspectorSelect,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  SelectionFillSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export function GeoSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonGeo =
    getCommonStringProp(shapes, 'geo') ?? 'rectangle'

  const updateGeo = (geo: string) => {
    editor.setStyleForSelectedShapes(
      GeoShapeGeoStyle,
      geo as never,
    )
  }

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      description="编辑形状几何、填充和描边。"
      title="形状"
    >
      <ShapeInspectorSection title="形状类型">
        <ShapeInspectorSelect
          onChange={updateGeo}
          options={GEO_SHAPE_OPTIONS}
          type="形状"
          value={commonGeo}
        />
      </ShapeInspectorSection>

      <SelectionColorSection {...sharedProps} />
      <SelectionFillSection {...sharedProps} />
      <SelectionStrokeSections {...sharedProps} />
      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
`

const TEXT_SOURCE = `import {
  DefaultFontStyle,
  DefaultTextAlignStyle,
} from 'tldraw'
import {
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
} from './SelectionInspectorShared'

export function TextSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonFont = getCommonStringProp(
    shapes,
    'font',
  )

  const commonAlign = getCommonStringProp(
    shapes,
    'textAlign',
  )

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      description="编辑文本颜色、字体和对齐。"
      title="文本"
    >
      <SelectionColorSection {...sharedProps} />

      <ShapeInspectorSection title="字体">
        <ShapeInspectorSegmentedControl
          ariaLabel="文本字体"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
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
          value={commonFont}
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="对齐">
        <ShapeInspectorSegmentedControl
          ariaLabel="文本对齐"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              DefaultTextAlignStyle,
              value as never,
            )
          }
          options={[
            { value: 'start', label: '左' },
            { value: 'middle', label: '中' },
            { value: 'end', label: '右' },
          ]}
          value={commonAlign}
        />
      </ShapeInspectorSection>

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
`

const NOTE_SOURCE = `import {
  DefaultFontStyle,
  DefaultTextAlignStyle,
} from 'tldraw'
import {
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  SelectionFillSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
} from './SelectionInspectorShared'

export function NoteSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonFont = getCommonStringProp(
    shapes,
    'font',
  )

  const commonAlign = getCommonStringProp(
    shapes,
    'textAlign',
  )

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      description="编辑便签背景和文字样式。"
      title="便签"
    >
      <SelectionColorSection {...sharedProps} />
      <SelectionFillSection {...sharedProps} />

      <ShapeInspectorSection title="字体">
        <ShapeInspectorSegmentedControl
          ariaLabel="便签字体"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
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
          value={commonFont}
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="对齐">
        <ShapeInspectorSegmentedControl
          ariaLabel="便签文字对齐"
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              DefaultTextAlignStyle,
              value as never,
            )
          }
          options={[
            { value: 'start', label: '左' },
            { value: 'middle', label: '中' },
            { value: 'end', label: '右' },
          ]}
          value={commonAlign}
        />
      </ShapeInspectorSection>

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
`

const ARROW_SOURCE = `import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
} from 'tldraw'
import {
  ShapeInspectorArrowheadSelect,
  ShapeInspectorSection,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export function ArrowSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const commonStart = getCommonStringProp(
    shapes,
    'arrowheadStart',
  )

  const commonEnd = getCommonStringProp(
    shapes,
    'arrowheadEnd',
  )

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      description="编辑连接线、端点和描边。"
      title="连接"
    >
      <SelectionColorSection {...sharedProps} />
      <SelectionStrokeSections {...sharedProps} />

      <ShapeInspectorSection title="起点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              ArrowShapeArrowheadStartStyle,
              value as never,
            )
          }
          value={commonStart}
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="终点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForSelectedShapes(
              ArrowShapeArrowheadEndStyle,
              value as never,
            )
          }
          value={commonEnd}
        />
      </ShapeInspectorSection>

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
`

const CHART_SOURCE = `import {
  type ScientificChartType,
  ScientificChartTypeStyle,
} from '@hybrid-canvas/scientific-plot'
import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export function ScientificChartSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const chartType = getCommonStringProp(
    shapes,
    'chartType',
  )

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      description="编辑图表类型和展示样式。"
      title="科学图表"
    >
      <ShapeInspectorSection title="图表类型">
        <ShapeInspectorSegmentedControl
          ariaLabel="图表类型"
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
          value={chartType}
        />
      </ShapeInspectorSection>

      <SelectionColorSection {...sharedProps} />
      <SelectionStrokeSections {...sharedProps} />

      <InspectorHint>
        数据、系列、坐标轴、图例和注释将在科学图表 Feature
        的专属检查器中继续实现。
      </InspectorHint>

      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
`

function createStandardWrapper({
  componentName,
  title,
  description,
  showFill = false,
  showColor = true,
  showStroke = true,
}) {
  return `import type { SelectionInspectorProps } from './SelectionInspectorShared'
import { StandardSelectionInspector } from './StandardSelectionInspector'

export function ${componentName}(
  props: SelectionInspectorProps,
) {
  return (
    <StandardSelectionInspector
      {...props}
      description="${description}"
      showColor={${String(showColor)}}
      showFill={${String(showFill)}}
      showStroke={${String(showStroke)}}
      title="${title}"
    />
  )
}
`
}

const LINE_SOURCE = createStandardWrapper({
  componentName: 'LineSelectionInspector',
  title: '直线',
  description: '编辑直线颜色、线型和粗细。',
})

const DRAW_SOURCE = createStandardWrapper({
  componentName: 'DrawSelectionInspector',
  title: '自由绘制',
  description: '编辑自由笔触的颜色、线型和粗细。',
})

const HIGHLIGHT_SOURCE = createStandardWrapper({
  componentName: 'HighlightSelectionInspector',
  title: '高亮',
  description: '编辑高亮笔触的颜色和粗细。',
})

const FRAME_SOURCE = createStandardWrapper({
  componentName: 'FrameSelectionInspector',
  title: '画框',
  description: '编辑画框填充、边框和层级。',
  showFill: true,
})

const GENERIC_SOURCE = `import {
  SelectionArrangementSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
} from './SelectionInspectorShared'

export function GenericSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const firstShape = shapes[0]
  const type = firstShape?.type ?? 'unknown'
  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      count={shapes.length}
      description={'对象类型：' + type}
      title="对象"
    >
      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
`

const MULTI_SOURCE = `import {
  SelectionArrangementSection,
  SelectionColorSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export function MultiSelectionInspector({
  editor,
  shapes,
}: SelectionInspectorProps) {
  const firstType = shapes[0]?.type
  const sameType = shapes.every(
    (shape) => shape.type === firstType,
  )

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout
      count={shapes.length}
      description={
        sameType
          ? '多个相同类型的对象；混合属性不会显示为已选中。'
          : '多个不同类型的对象；仅显示可批量应用的公共属性。'
      }
      title={String(shapes.length) + ' 个对象'}
    >
      <SelectionColorSection {...sharedProps} />
      <SelectionStrokeSections {...sharedProps} />
      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
`

const ROUTER_SOURCE = `import type { SelectionInspectorProps } from './SelectionInspectorShared'
import { ArrowSelectionInspector } from './ArrowSelectionInspector'
import { DrawSelectionInspector } from './DrawSelectionInspector'
import { FrameSelectionInspector } from './FrameSelectionInspector'
import { GenericSelectionInspector } from './GenericSelectionInspector'
import { GeoSelectionInspector } from './GeoSelectionInspector'
import { HighlightSelectionInspector } from './HighlightSelectionInspector'
import { LineSelectionInspector } from './LineSelectionInspector'
import { MultiSelectionInspector } from './MultiSelectionInspector'
import { NoteSelectionInspector } from './NoteSelectionInspector'
import { ScientificChartSelectionInspector } from './ScientificChartSelectionInspector'
import { TextSelectionInspector } from './TextSelectionInspector'

export function SelectionInspectorRouter({
  editor,
  shapes,
}: SelectionInspectorProps) {
  if (shapes.length > 1) {
    return (
      <MultiSelectionInspector
        editor={editor}
        shapes={shapes}
      />
    )
  }

  const shape = shapes[0]

  if (!shape) {
    return null
  }

  const props = { editor, shapes }

  switch (shape.type) {
    case 'geo':
      return <GeoSelectionInspector {...props} />

    case 'text':
      return <TextSelectionInspector {...props} />

    case 'note':
      return <NoteSelectionInspector {...props} />

    case 'arrow':
      return <ArrowSelectionInspector {...props} />

    case 'line':
      return <LineSelectionInspector {...props} />

    case 'draw':
      return <DrawSelectionInspector {...props} />

    case 'highlight':
      return <HighlightSelectionInspector {...props} />

    case 'frame':
      return <FrameSelectionInspector {...props} />

    case 'scientific-chart':
      return (
        <ScientificChartSelectionInspector {...props} />
      )

    default:
      return <GenericSelectionInspector {...props} />
  }
}
`

const INDEX_SOURCE = `export { ArrowSelectionInspector } from './ArrowSelectionInspector'
export { DrawSelectionInspector } from './DrawSelectionInspector'
export { FrameSelectionInspector } from './FrameSelectionInspector'
export { GenericSelectionInspector } from './GenericSelectionInspector'
export { GeoSelectionInspector } from './GeoSelectionInspector'
export { HighlightSelectionInspector } from './HighlightSelectionInspector'
export { LineSelectionInspector } from './LineSelectionInspector'
export { MultiSelectionInspector } from './MultiSelectionInspector'
export { NoteSelectionInspector } from './NoteSelectionInspector'
export { ScientificChartSelectionInspector } from './ScientificChartSelectionInspector'
export { SelectionInspectorRouter } from './SelectionInspectorRouter'
export type { SelectionInspectorProps } from './SelectionInspectorShared'
export { TextSelectionInspector } from './TextSelectionInspector'
`

const GENERATED_FILES = [
  [PATHS.canvasInspector, CANVAS_INSPECTOR_SOURCE],
  [PATHS.shared, SHARED_SOURCE],
  [PATHS.standard, STANDARD_SOURCE],
  [PATHS.geo, GEO_SOURCE],
  [PATHS.text, TEXT_SOURCE],
  [PATHS.note, NOTE_SOURCE],
  [PATHS.arrow, ARROW_SOURCE],
  [PATHS.line, LINE_SOURCE],
  [PATHS.draw, DRAW_SOURCE],
  [PATHS.highlight, HIGHLIGHT_SOURCE],
  [PATHS.frame, FRAME_SOURCE],
  [PATHS.chart, CHART_SOURCE],
  [PATHS.multi, MULTI_SOURCE],
  [PATHS.generic, GENERIC_SOURCE],
  [PATHS.router, ROUTER_SOURCE],
  [PATHS.index, INDEX_SOURCE],
]

async function main() {
  console.log('')
  console.log('Hybrid Canvas — Inspector Refactor / Phase 4')
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'write'}`)
  console.log('')

  await validateRepository()

  if (DRY_RUN) {
    console.log('✓ Phase 3 CanvasInspectorContent detected')
    console.log('✓ Selection logic can be replaced safely')
    console.log('✓ Selection router can be generated')
    console.log('✓ Per-object inspectors can be generated')
    console.log('✓ No files were changed')
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

  await mkdir(SELECTIONS_DIRECTORY, {
    recursive: true,
  })

  for (const [filePath, source] of GENERATED_FILES) {
    await writeUtf8(filePath, source)
  }

  console.log('')
  console.log(`Backup: ${relative(backupDirectory)}`)
  console.log('')
  console.log('Phase 4 complete:')
  console.log('  ✓ CanvasInspectorContent reduced to routing')
  console.log('  ✓ SelectionInspectorRouter created')
  console.log('  ✓ Geo selection inspector created')
  console.log('  ✓ Text selection inspector created')
  console.log('  ✓ Note selection inspector created')
  console.log('  ✓ Arrow selection inspector created')
  console.log('  ✓ Line selection inspector created')
  console.log('  ✓ Draw selection inspector created')
  console.log('  ✓ Highlight selection inspector created')
  console.log('  ✓ Frame selection inspector created')
  console.log('  ✓ Scientific chart selection inspector created')
  console.log('  ✓ Multi-selection inspector created')
  console.log('  ✓ Generic fallback created')
  console.log('')
  console.log('Run validation:')
  console.log(
    '  pnpm exec biome check --write apps/desktop/src/presentation/workspace/inspector',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
}

async function validateRepository() {
  await assertFile(PATHS.packageJson)
  await assertFile(PATHS.canvasInspector)

  const source = await readUtf8(PATHS.canvasInspector)

  const requiredMarkers = [
    'export function CanvasInspectorContent',
    'const selectedIds = selectedShapes.map',
    'function getCommonShapeProp',
    'ScientificChartTypeStyle',
  ]

  for (const marker of requiredMarkers) {
    if (!source.includes(marker)) {
      throw new Error(
        `Expected marker not found: ${marker}\n` +
          'The remote structure differs from the expected phase-3 version.',
      )
    }
  }

  if (source.includes('SelectionInspectorRouter')) {
    throw new Error(
      'SelectionInspectorRouter is already installed. Phase 4 may already have been applied.',
    )
  }
}

async function assertFile(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(
      `Missing required file: ${relative(filePath)}`,
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
    `inspector-phase4-${timestamp}`,
  )

  await mkdir(backupDirectory, {
    recursive: true,
  })

  return backupDirectory
}

async function backupFile(
  sourcePath,
  destinationPath,
) {
  await mkdir(path.dirname(destinationPath), {
    recursive: true,
  })

  await copyFile(sourcePath, destinationPath)
}

async function readUtf8(filePath) {
  return readFile(filePath, 'utf8')
}

async function writeUtf8(filePath, source) {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  })

  const normalized =
    source
      .replaceAll('\r\n', '\n')
      .replace(/^\uFEFF/, '')
      .trimEnd() + '\n'

  await writeFile(filePath, normalized, 'utf8')
  console.log(`Updated: ${relative(filePath)}`)
}

function relative(filePath) {
  return path.relative(ROOT_DIR, filePath) || '.'
}

main().catch((error) => {
  console.error('')
  console.error('Phase 4 failed.')
  console.error(error instanceof Error ? error.message : error)
  console.error('')
  process.exitCode = 1
})