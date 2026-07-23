import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectList,
  type SelectOption,
  SelectTrigger,
} from '@hybrid-canvas/design-system'
import {
  type ScientificChartType,
  ScientificChartTypeStyle,
} from '@hybrid-canvas/scientific-plot'
import { useState } from 'react'
import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  type Editor,
  GeoShapeGeoStyle,
  type TLShape,
  useValue,
} from 'tldraw'

export function CanvasInspectorContent({ hasActiveCanvas }: { readonly hasActiveCanvas: boolean }) {
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
          激活一个画布后，可以在这里编辑对象属性。
        </p>
      </div>
    )
  }

  if (selectedShapes.length === 0) {
    return <CanvasActiveToolPanel editor={editor} toolId={activeToolId} />
  }

  const selectedIds = selectedShapes.map((shape) => shape.id)
  const primaryShape = selectedShapes[0]

  if (!primaryShape) {
    return null
  }

  const commonType = selectedShapes.every((shape) => shape.type === primaryShape.type)
    ? primaryShape.type
    : 'mixed'

  const commonColor = getCommonShapeProp(selectedShapes, 'color')
  const commonFill = getCommonShapeProp(selectedShapes, 'fill')
  const commonDash = getCommonShapeProp(selectedShapes, 'dash')
  const commonSize = getCommonShapeProp(selectedShapes, 'size')
  const commonFont = getCommonShapeProp(selectedShapes, 'font')
  const commonAlign = getCommonShapeProp(selectedShapes, 'textAlign')
  const commonGeo = getCommonShapeProp(selectedShapes, 'geo')
  const commonArrowheadStart = getCommonShapeProp(selectedShapes, 'arrowheadStart')
  const commonArrowheadEnd = getCommonShapeProp(selectedShapes, 'arrowheadEnd')

  const applyStyle = (
    style:
      | typeof DefaultColorStyle
      | typeof DefaultFillStyle
      | typeof DefaultDashStyle
      | typeof DefaultSizeStyle
      | typeof DefaultFontStyle
      | typeof DefaultTextAlignStyle
      | typeof ArrowShapeArrowheadStartStyle
      | typeof ArrowShapeArrowheadEndStyle,
    value: string,
  ) => {
    editor.setStyleForSelectedShapes(style as never, value as never)
  }

  const updateGeo = (geo: string) => {
    const updates = selectedShapes.flatMap((shape) => {
      if (shape.type !== 'geo') {
        return []
      }

      return [
        {
          id: shape.id,
          type: shape.type,
          props: {
            geo,
          },
        },
      ]
    })

    if (updates.length > 0) {
      editor.updateShapes(updates as never)
    }
  }

  const allLocked = selectedShapes.every((shape) => shape.isLocked)

  const toggleLocked = () => {
    editor.updateShapes(
      selectedShapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        isLocked: !allLocked,
      })) as never,
    )
  }

  return (
    <div className="space-y-4">
      <header className="border-b border-divider pb-3">
        <h2 className="truncate text-sm font-semibold">
          {selectedShapes.length === 1
            ? getInspectorShapeName(commonType)
            : String(selectedShapes.length) + ' 个对象'}
        </h2>

        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {selectedShapes.length === 1
            ? getInspectorShapeDescription(commonType)
            : commonType === 'mixed'
              ? '多个不同类型的对象'
              : getInspectorShapeName(commonType)}
        </p>
      </header>

      <ShapeInspectorSection title="颜色">
        <div className="grid grid-cols-6 gap-1.5">
          {SHAPE_COLORS.map((color) => (
            <button
              aria-label={'设置颜色为' + color.label}
              className={
                'size-7 rounded-md border transition-transform hover:scale-105 ' +
                (commonColor === color.value ? 'ring-2 ring-primary ring-offset-1' : '')
              }
              key={color.value}
              onClick={() => applyStyle(DefaultColorStyle, color.value)}
              style={{ backgroundColor: color.css }}
              title={color.label}
              type="button"
            />
          ))}
        </div>
      </ShapeInspectorSection>

      {supportsFill(commonType) ? (
        <ShapeInspectorSection title="填充">
          <ShapeInspectorSegmentedControl
            onChange={(value) => applyStyle(DefaultFillStyle, value)}
            options={[
              { value: 'none', label: '无' },
              { value: 'semi', label: '半透明' },
              { value: 'solid', label: '实心' },
              { value: 'pattern', label: '图案' },
            ]}
            value={commonFill}
          />
        </ShapeInspectorSection>
      ) : null}

      {supportsStroke(commonType) ? (
        <>
          <ShapeInspectorSection title="线型">
            <ShapeInspectorSegmentedControl
              onChange={(value) => applyStyle(DefaultDashStyle, value)}
              options={[
                { value: 'draw', label: '手绘' },
                { value: 'solid', label: '实线' },
                { value: 'dashed', label: '虚线' },
                { value: 'dotted', label: '点线' },
              ]}
              value={commonDash}
            />
          </ShapeInspectorSection>

          <ShapeInspectorSection title="粗细">
            <ShapeInspectorSegmentedControl
              onChange={(value) => applyStyle(DefaultSizeStyle, value)}
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
      ) : null}

      {commonType === 'scientific-chart' ? (
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
            value={getCommonShapeProp(selectedShapes, 'chartType')}
          />
        </ShapeInspectorSection>
      ) : null}

      {commonType === 'geo' ? (
        <ShapeInspectorSection title="形状">
          <ShapeInspectorSelect
            onChange={updateGeo}
            options={GEO_SHAPE_OPTIONS}
            type="形状"
            value={commonGeo ?? 'rectangle'}
          />
        </ShapeInspectorSection>
      ) : null}

      {commonType === 'text' || commonType === 'note' ? (
        <>
          <ShapeInspectorSection title="字体">
            <ShapeInspectorSegmentedControl
              onChange={(value) => applyStyle(DefaultFontStyle, value)}
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
              onChange={(value) => applyStyle(DefaultTextAlignStyle, value)}
              options={[
                { value: 'start', label: '左' },
                { value: 'middle', label: '中' },
                { value: 'end', label: '右' },
              ]}
              value={commonAlign}
            />
          </ShapeInspectorSection>
        </>
      ) : null}

      {commonType === 'arrow' ? (
        <>
          <ShapeInspectorSection title="起点">
            <ShapeInspectorArrowheadSelect
              onChange={(value) => applyStyle(ArrowShapeArrowheadStartStyle, value)}
              value={commonArrowheadStart}
            />
          </ShapeInspectorSection>

          <ShapeInspectorSection title="终点">
            <ShapeInspectorArrowheadSelect
              onChange={(value) => applyStyle(ArrowShapeArrowheadEndStyle, value)}
              value={commonArrowheadEnd}
            />
          </ShapeInspectorSection>
        </>
      ) : null}

      <ShapeInspectorSection title="排列">
        <div className="grid grid-cols-2 gap-2">
          <ShapeInspectorButton onClick={() => editor.bringToFront(selectedIds)}>
            置于顶层
          </ShapeInspectorButton>

          <ShapeInspectorButton onClick={() => editor.sendToBack(selectedIds)}>
            置于底层
          </ShapeInspectorButton>

          <ShapeInspectorButton onClick={() => editor.bringForward(selectedIds)}>
            上移一层
          </ShapeInspectorButton>

          <ShapeInspectorButton onClick={() => editor.sendBackward(selectedIds)}>
            下移一层
          </ShapeInspectorButton>
        </div>
      </ShapeInspectorSection>

      <ShapeInspectorSection title="对象操作">
        <div className="grid grid-cols-2 gap-2">
          <ShapeInspectorButton onClick={() => editor.duplicateShapes(selectedIds)}>
            复制
          </ShapeInspectorButton>

          <ShapeInspectorButton onClick={toggleLocked}>
            {allLocked ? '解除锁定' : '锁定'}
          </ShapeInspectorButton>

          <ShapeInspectorButton
            className="col-span-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => editor.deleteShapes(selectedIds)}
          >
            删除对象
          </ShapeInspectorButton>
        </div>
      </ShapeInspectorSection>
    </div>
  )
}

function CanvasActiveToolPanel({
  editor,
  toolId,
}: {
  readonly editor: Editor
  readonly toolId: string
}) {
  const applyNextStyle = (style: Parameters<Editor['setStyleForNextShapes']>[0], value: string) => {
    editor.setStyleForNextShapes(style, value as never)
  }

  const colors = (
    <ShapeInspectorSection title="颜色">
      <div className="grid grid-cols-6 gap-1.5">
        {SHAPE_COLORS.map((color) => (
          <button
            aria-label={'设置默认颜色为' + color.label}
            className="size-7 rounded-md border transition-transform hover:scale-105"
            key={color.value}
            onClick={() => applyNextStyle(DefaultColorStyle, color.value)}
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
        onChange={(value) => applyNextStyle(DefaultSizeStyle, value)}
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
        onChange={(value) => applyNextStyle(DefaultDashStyle, value)}
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
      <CanvasToolPanelHeader description="在画布中连续创建形状" title="形状">
        <ShapeInspectorSection title="形状类型">
          <ShapeInspectorSelect
            onChange={(value) => applyNextStyle(GeoShapeGeoStyle, value)}
            options={GEO_SHAPE_OPTIONS}
            type="形状"
            value="rectangle"
          />
        </ShapeInspectorSection>

        {colors}

        <ShapeInspectorSection title="填充">
          <ShapeInspectorSegmentedControl
            onChange={(value) => applyNextStyle(DefaultFillStyle, value)}
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
      <CanvasToolPanelHeader description="在画布中连续创建连接线" title="连接">
        {colors}
        {dash}
        {size}

        <ShapeInspectorSection title="起点">
          <ShapeInspectorArrowheadSelect
            onChange={(value) => applyNextStyle(ArrowShapeArrowheadStartStyle, value)}
            value="none"
          />
        </ShapeInspectorSection>

        <ShapeInspectorSection title="终点">
          <ShapeInspectorArrowheadSelect
            onChange={(value) => applyNextStyle(ArrowShapeArrowheadEndStyle, value)}
            value="arrow"
          />
        </ShapeInspectorSection>
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'scientific-chart') {
    return (
      <CanvasToolPanelHeader description="拖拽创建图表" title="图表">
        <ShapeInspectorSection title="图表类型">
          <ShapeInspectorSegmentedControl
            onChange={(value) => applyNextStyle(ScientificChartTypeStyle, value)}
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
      <CanvasToolPanelHeader description="在画布中连续创建文本" title="文本">
        {colors}

        <ShapeInspectorSection title="字体">
          <ShapeInspectorSegmentedControl
            onChange={(value) => applyNextStyle(DefaultFontStyle, value)}
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
            onChange={(value) => applyNextStyle(DefaultTextAlignStyle, value)}
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

  if (toolId === 'draw' || toolId === 'highlight') {
    return (
      <CanvasToolPanelHeader
        description={toolId === 'highlight' ? '连续绘制高亮标记' : '连续自由绘制'}
        title={toolId === 'highlight' ? '高亮' : '自由绘制'}
      >
        {colors}
        {dash}
        {size}
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'note') {
    return (
      <CanvasToolPanelHeader description="在画布中连续创建便签" title="便签">
        {colors}

        <ShapeInspectorSection title="填充">
          <ShapeInspectorSegmentedControl
            onChange={(value) => applyNextStyle(DefaultFillStyle, value)}
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
            onChange={(value) => applyNextStyle(DefaultFontStyle, value)}
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
      <CanvasToolPanelHeader description="在画布中连续创建画框" title="画框">
        {colors}
        {dash}
        {size}
      </CanvasToolPanelHeader>
    )
  }

  if (toolId === 'eraser') {
    return (
      <CanvasToolPanelHeader description="拖过对象进行删除" title="橡皮擦">
        <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
          橡皮擦将保持激活。手动点击“选择”或切换其他工具后退出。
        </div>
      </CanvasToolPanelHeader>
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-divider px-4 py-8 text-center">
      <p className="text-xs font-medium">{toolId === 'hand' ? '移动画布' : '选择工具'}</p>

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
        <h2 className="text-sm font-semibold">{title}</h2>

        <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
      </header>

      {children}
    </div>
  )
}

const GEO_SHAPE_OPTIONS = [
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

const ARROWHEAD_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'arrow', label: '箭头' },
  { value: 'triangle', label: '实心三角' },
  { value: 'square', label: '方形' },
  { value: 'dot', label: '圆点' },
  { value: 'diamond', label: '菱形' },
  { value: 'inverted', label: '反向三角' },
  { value: 'bar', label: '横线' },
] satisfies readonly SelectOption[]

const SHAPE_COLORS = [
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

function ShapeInspectorSection({
  title,
  children,
}: {
  readonly title: string
  readonly children: import('react').ReactNode
}) {
  return (
    <section className="space-y-2.5 border-b border-divider pb-4 last:border-b-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function ShapeInspectorButton({
  children,
  onClick,
  className = '',
}: {
  readonly children: import('react').ReactNode
  readonly onClick: () => void
  readonly className?: string
}) {
  return (
    <button
      className={
        'min-h-8 rounded-md border border-divider bg-background px-2 text-[11px] ' +
        'transition-colors hover:bg-accent ' +
        className
      }
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function ShapeInspectorSegmentedControl({
  options,
  value,
  onChange,
}: {
  readonly options: readonly {
    readonly value: string
    readonly label: string
  }[]
  readonly value: string | null
  readonly onChange: (value: string) => void
}) {
  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: 'repeat(' + String(options.length) + ', minmax(0, 1fr))',
      }}
    >
      {options.map((option) => (
        <button
          className={
            'h-8 rounded-md border px-1 text-[10px] transition-colors ' +
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

interface ShapeInspectorSelectProps {
  readonly type: string
  readonly options: readonly SelectOption[]
  readonly value: string
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}

function ShapeInspectorSelect({
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
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectList>
      </SelectContent>
    </Select>
  )
}

function ShapeInspectorArrowheadSelect({
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

function getCommonShapeProp(shapes: readonly TLShape[], key: string): string | null {
  const firstShape = shapes[0]

  if (!firstShape) {
    return null
  }

  const firstProps = firstShape.props as unknown as Record<string, unknown>
  const firstValue = firstProps[key]

  if (typeof firstValue !== 'string') {
    return null
  }

  const isShared = shapes.every((shape) => {
    const props = shape.props as unknown as Record<string, unknown>
    return props[key] === firstValue
  })

  return isShared ? firstValue : null
}

function supportsFill(type: string): boolean {
  return type === 'geo' || type === 'note' || type === 'frame'
}

function supportsStroke(type: string): boolean {
  return [
    'geo',
    'draw',
    'highlight',
    'arrow',
    'line',
    'note',
    'frame',
    'scientific-chart',
    'mixed',
  ].includes(type)
}

function getInspectorShapeName(type: string): string {
  const names: Record<string, string> = {
    geo: '形状',
    text: '文本',
    draw: '自由绘制',
    highlight: '高亮',
    arrow: '箭头',
    line: '直线',
    note: '便签',
    frame: '画框',
    'scientific-chart': '图表',
    image: '图片',
    video: '视频',
    bookmark: '书签',
    embed: '嵌入内容',
    group: '对象组',
    mixed: '多个对象',
  }

  return names[type] ?? type
}

function getInspectorShapeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    geo: '编辑形状、颜色、填充和边框',
    text: '编辑字体、字号、颜色和对齐',
    draw: '编辑画笔颜色、线型和粗细',
    highlight: '编辑高亮颜色和粗细',
    arrow: '编辑箭头、端点、颜色和线型',
    line: '编辑线条颜色、线型和粗细',
    note: '编辑便签文字、颜色和填充',
    frame: '编辑画框样式',
    'scientific-chart': '编辑图表类型、颜色和展示样式',
    image: '编辑图片对象和层级',
    video: '编辑视频对象和层级',
    group: '编辑对象组和层级',
  }

  return descriptions[type] ?? '编辑所选对象的属性'
}
