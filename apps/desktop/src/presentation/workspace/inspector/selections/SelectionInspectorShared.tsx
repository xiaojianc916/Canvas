import type { ReactNode } from 'react'
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
      {...(commonColor === null && shapes.length > 1
        ? {
            description:
              '当前选择包含多个颜色；选择颜色后将统一覆盖。',
          }
        : {})}
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
      {...(commonFill === null && shapes.length > 1
        ? { description: '混合填充' }
        : {})}
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
        {...(commonDash === null && shapes.length > 1
          ? { description: '混合线型' }
          : {})}
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
