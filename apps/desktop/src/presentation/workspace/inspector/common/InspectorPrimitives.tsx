import {
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
  useValue,
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

export function ShapeInspectorSection({ title, description, children }: InspectorSectionProps) {
  return (
    <section className="space-y-2.5 border-b border-divider pb-4 last:border-b-0">
      <header className="space-y-0.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>

        {description ? (
          <p className="text-[10px] leading-4 text-muted-foreground/80">{description}</p>
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
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
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
        gridTemplateColumns: 'repeat(' + String(options.length) + ', minmax(0, 1fr))',
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

export function ToolColorSection({ editor }: { readonly editor: Editor }) {
  const currentColor = useValue(
    'inspector next shape color',
    () => editor.getStyleForNextShape(DefaultColorStyle),
    [editor],
  )

  return (
    <ShapeInspectorSection title="颜色">
      <div className="grid grid-cols-6 gap-1.5">
        {SHAPE_COLORS.map((color) => (
          <button
            aria-label={'设置默认颜色为' + color.label}
            aria-pressed={currentColor === color.value}
            className={
              'size-7 rounded-md border border-divider transition-transform ' +
              'hover:scale-105 focus-visible:outline-none ' +
              'focus-visible:ring-2 focus-visible:ring-primary ' +
              (currentColor === color.value ? 'ring-2 ring-primary ring-offset-1' : '')
            }
            key={color.value}
            onClick={() => editor.setStyleForNextShapes(DefaultColorStyle, color.value)}
            style={{ backgroundColor: color.css }}
            title={color.label}
            type="button"
          />
        ))}
      </div>
    </ShapeInspectorSection>
  )
}

export function ToolStrokeSizeSection({ editor }: { readonly editor: Editor }) {
  const currentSize = useValue(
    'inspector next shape size',
    () => editor.getStyleForNextShape(DefaultSizeStyle),
    [editor],
  )

  return (
    <ShapeInspectorSection description="快捷档位；后续阶段增加精确数值与滑杆。" title="粗细">
      <ShapeInspectorSegmentedControl
        ariaLabel="默认线条粗细"
        onChange={(value) => editor.setStyleForNextShapes(DefaultSizeStyle, value as never)}
        options={[
          { value: 's', label: '细' },
          { value: 'm', label: '中' },
          { value: 'l', label: '粗' },
          { value: 'xl', label: '特粗' },
        ]}
        value={currentSize}
      />
    </ShapeInspectorSection>
  )
}

export function ToolDashSection({ editor }: { readonly editor: Editor }) {
  const currentDash = useValue(
    'inspector next shape dash',
    () => editor.getStyleForNextShape(DefaultDashStyle),
    [editor],
  )

  return (
    <ShapeInspectorSection title="线型">
      <ShapeInspectorSegmentedControl
        ariaLabel="默认线型"
        onChange={(value) => editor.setStyleForNextShapes(DefaultDashStyle, value as never)}
        options={[
          { value: 'draw', label: '手绘' },
          { value: 'solid', label: '实线' },
          { value: 'dashed', label: '虚线' },
          { value: 'dotted', label: '点线' },
        ]}
        value={currentDash}
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
  const currentFill = useValue(
    'inspector next shape fill',
    () => editor.getStyleForNextShape(DefaultFillStyle),
    [editor],
  )

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
        onChange={(value) => editor.setStyleForNextShapes(DefaultFillStyle, value as never)}
        options={options}
        value={currentFill}
      />
    </ShapeInspectorSection>
  )
}

export function InspectorHint({ children }: { readonly children: import('react').ReactNode }) {
  return (
    <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
      {children}
    </div>
  )
}
