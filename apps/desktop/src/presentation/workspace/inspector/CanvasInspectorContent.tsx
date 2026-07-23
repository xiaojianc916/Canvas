import {
  type ScientificChartType,
  ScientificChartTypeStyle,
} from '@hybrid-canvas/scientific-plot'
import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  GeoShapeGeoStyle,
  type TLShape,
  useValue,
} from 'tldraw'
import {
  GEO_SHAPE_OPTIONS,
  SHAPE_COLORS,
  ShapeInspectorArrowheadSelect,
  ShapeInspectorButton,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ShapeInspectorSelect,
} from './common/InspectorPrimitives'
import { ToolInspectorRouter } from './tools/ToolInspectorRouter'

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
    return <ToolInspectorRouter editor={editor} toolId={activeToolId} />
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
