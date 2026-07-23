import type { HybridCanvasToolInspectorProps } from '@hybrid-canvas/canvas/extensions'
import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  useValue,
} from 'tldraw'

const CONNECTOR_PRESETS = [
  {
    id: 'dependency',
    label: '依赖',
    description: '单向实线',
    color: 'blue',
    size: 'm',
    dash: 'solid',
    start: 'none',
    end: 'arrow',
  },
  {
    id: 'bidirectional',
    label: '双向',
    description: '双向箭头',
    color: 'blue',
    size: 'm',
    dash: 'solid',
    start: 'arrow',
    end: 'arrow',
  },
  {
    id: 'association',
    label: '关联',
    description: '无端点虚线',
    color: 'grey',
    size: 's',
    dash: 'dashed',
    start: 'none',
    end: 'none',
  },
  {
    id: 'composition',
    label: '组合',
    description: '菱形起点',
    color: 'black',
    size: 'm',
    dash: 'solid',
    start: 'diamond',
    end: 'arrow',
  },
] as const

const COLORS = [
  {
    value: 'black',
    label: '黑色',
    css: '#1d1d1d',
  },
  {
    value: 'grey',
    label: '灰色',
    css: '#6b7280',
  },
  {
    value: 'red',
    label: '红色',
    css: '#dc2626',
  },
  {
    value: 'orange',
    label: '橙色',
    css: '#f97316',
  },
  {
    value: 'yellow',
    label: '黄色',
    css: '#eab308',
  },
  {
    value: 'green',
    label: '绿色',
    css: '#16a34a',
  },
  {
    value: 'blue',
    label: '蓝色',
    css: '#2563eb',
  },
  {
    value: 'violet',
    label: '紫色',
    css: '#7c3aed',
  },
  {
    value: 'light-red',
    label: '浅红',
    css: '#f87171',
  },
  {
    value: 'light-green',
    label: '浅绿',
    css: '#4ade80',
  },
  {
    value: 'light-blue',
    label: '浅蓝',
    css: '#60a5fa',
  },
  {
    value: 'light-violet',
    label: '浅紫',
    css: '#a78bfa',
  },
] as const

const SIZE_OPTIONS = [
  {
    value: 's',
    label: '细',
    pixels: 2,
  },
  {
    value: 'm',
    label: '中',
    pixels: 3,
  },
  {
    value: 'l',
    label: '粗',
    pixels: 4,
  },
  {
    value: 'xl',
    label: '特粗',
    pixels: 6,
  },
] as const

const DASH_OPTIONS = [
  {
    value: 'draw',
    label: '手绘',
  },
  {
    value: 'solid',
    label: '实线',
  },
  {
    value: 'dashed',
    label: '虚线',
  },
  {
    value: 'dotted',
    label: '点线',
  },
] as const

const ARROWHEAD_OPTIONS = [
  {
    value: 'none',
    label: '无',
    symbol: '—',
  },
  {
    value: 'arrow',
    label: '箭头',
    symbol: '→',
  },
  {
    value: 'triangle',
    label: '实心',
    symbol: '▶',
  },
  {
    value: 'dot',
    label: '圆点',
    symbol: '●',
  },
  {
    value: 'square',
    label: '方形',
    symbol: '■',
  },
  {
    value: 'diamond',
    label: '菱形',
    symbol: '◆',
  },
  {
    value: 'bar',
    label: '横线',
    symbol: '⊣',
  },
  {
    value: 'inverted',
    label: '反向',
    symbol: '◀',
  },
] as const

export function ConnectorToolInspector({ editor }: HybridCanvasToolInspectorProps) {
  const currentColor = useValue(
    'flowchart connector next color',
    () => editor.getStyleForNextShape(DefaultColorStyle),
    [editor],
  )

  const currentSize = useValue(
    'flowchart connector next size',
    () => editor.getStyleForNextShape(DefaultSizeStyle),
    [editor],
  )

  const currentDash = useValue(
    'flowchart connector next dash',
    () => editor.getStyleForNextShape(DefaultDashStyle),
    [editor],
  )

  const currentStart = useValue(
    'flowchart connector next start',
    () => editor.getStyleForNextShape(ArrowShapeArrowheadStartStyle),
    [editor],
  )

  const currentEnd = useValue(
    'flowchart connector next end',
    () => editor.getStyleForNextShape(ArrowShapeArrowheadEndStyle),
    [editor],
  )

  const currentColorCss = COLORS.find((color) => color.value === currentColor)?.css ?? '#2563eb'

  const applyPreset = (preset: (typeof CONNECTOR_PRESETS)[number]) => {
    editor.setStyleForNextShapes(DefaultColorStyle, preset.color)

    editor.setStyleForNextShapes(DefaultSizeStyle, preset.size)

    editor.setStyleForNextShapes(DefaultDashStyle, preset.dash)

    editor.setStyleForNextShapes(ArrowShapeArrowheadStartStyle, preset.start)

    editor.setStyleForNextShapes(ArrowShapeArrowheadEndStyle, preset.end)
  }

  return (
    <div className="space-y-4">
      <header className="border-b border-divider pb-3">
        <h2 className="text-sm font-semibold">连接线</h2>

        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          在对象之间创建可绑定的连接线。
        </p>
      </header>

      <InspectorSection description="预设会同时应用颜色、粗细、线型和端点。" title="连接预设">
        <div className="grid grid-cols-2 gap-2">
          {CONNECTOR_PRESETS.map((preset) => {
            const selected =
              currentColor === preset.color &&
              currentSize === preset.size &&
              currentDash === preset.dash &&
              currentStart === preset.start &&
              currentEnd === preset.end

            return (
              <button
                aria-pressed={selected}
                className={
                  'min-h-14 rounded-md border p-2 text-left ' +
                  'transition-colors focus-visible:outline-none ' +
                  'focus-visible:ring-2 focus-visible:ring-primary ' +
                  (selected
                    ? 'border-primary bg-primary/10'
                    : 'border-divider bg-background hover:bg-accent')
                }
                key={preset.id}
                onClick={() => {
                  applyPreset(preset)
                }}
                type="button"
              >
                <ConnectorPreview
                  color={COLORS.find((color) => color.value === preset.color)?.css ?? '#2563eb'}
                  dash={preset.dash}
                  end={preset.end}
                  start={preset.start}
                />

                <span className="mt-1.5 block text-[11px] font-medium">{preset.label}</span>

                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {preset.description}
                </span>
              </button>
            )
          })}
        </div>
      </InspectorSection>

      <InspectorSection title="颜色">
        <div className="grid grid-cols-6 gap-1.5">
          {COLORS.map((color) => (
            <button
              aria-label={'设置连接线颜色为' + color.label}
              aria-pressed={currentColor === color.value}
              className={
                'size-7 rounded-md border border-divider transition-transform ' +
                'hover:scale-105 focus-visible:outline-none ' +
                'focus-visible:ring-2 focus-visible:ring-primary ' +
                (currentColor === color.value ? 'ring-2 ring-primary ring-offset-1' : '')
              }
              key={color.value}
              onClick={() => {
                editor.setStyleForNextShapes(DefaultColorStyle, color.value)
              }}
              style={{
                backgroundColor: color.css,
              }}
              title={color.label}
              type="button"
            />
          ))}
        </div>
      </InspectorSection>

      <InspectorSection title="粗细">
        <div aria-label="连接线粗细" className="grid grid-cols-4 gap-1.5" role="group">
          {SIZE_OPTIONS.map((option) => (
            <button
              aria-pressed={currentSize === option.value}
              className={
                'flex min-h-10 flex-col items-center justify-center gap-1 ' +
                'rounded-md border px-1 text-[10px] transition-colors ' +
                (currentSize === option.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-divider bg-background hover:bg-accent')
              }
              key={option.value}
              onClick={() => {
                editor.setStyleForNextShapes(DefaultSizeStyle, option.value)
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="block w-7 rounded-full"
                style={{
                  backgroundColor: currentColorCss,
                  height: option.pixels,
                }}
              />

              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection title="线型">
        <SegmentedControl
          ariaLabel="连接线线型"
          onChange={(value) => {
            editor.setStyleForNextShapes(DefaultDashStyle, value as never)
          }}
          options={DASH_OPTIONS}
          value={currentDash}
        />
      </InspectorSection>

      <ArrowheadSection
        label="起点"
        onChange={(value) => {
          editor.setStyleForNextShapes(ArrowShapeArrowheadStartStyle, value as never)
        }}
        value={currentStart}
      />

      <ArrowheadSection
        label="终点"
        onChange={(value) => {
          editor.setStyleForNextShapes(ArrowShapeArrowheadEndStyle, value as never)
        }}
        value={currentEnd}
      />

      <InspectorSection title="连接行为">
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-md border border-divider bg-background p-3 text-[10px]">
          <dt className="text-muted-foreground">对象吸附</dt>
          <dd>启用</dd>

          <dt className="text-muted-foreground">移动时跟随</dt>
          <dd>启用</dd>

          <dt className="text-muted-foreground">当前路由</dt>
          <dd>tldraw 原生</dd>
        </dl>
      </InspectorSection>

      <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
        当前只显示已经真实生效的连接参数。 正交路由、避障、标签和自动重路由将在 Flowchart Connector
        实现后开放。
      </div>
    </div>
  )
}

function ArrowheadSection({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  return (
    <InspectorSection title={label}>
      <div aria-label={label + '端点样式'} className="grid grid-cols-4 gap-1.5" role="group">
        {ARROWHEAD_OPTIONS.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={
              'flex min-h-12 flex-col items-center justify-center gap-1 ' +
              'rounded-md border px-1 transition-colors ' +
              (value === option.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-divider bg-background hover:bg-accent')
            }
            key={option.value}
            onClick={() => {
              onChange(option.value)
            }}
            title={option.label}
            type="button"
          >
            <span aria-hidden="true" className="font-mono text-base leading-none">
              {option.symbol}
            </span>

            <span className="text-[9px]">{option.label}</span>
          </button>
        ))}
      </div>
    </InspectorSection>
  )
}

interface InspectorSectionProps {
  readonly title: string
  readonly description?: string
  readonly children: import('react').ReactNode
}

function InspectorSection({ title, description, children }: InspectorSectionProps) {
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

function SegmentedControl({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  readonly ariaLabel: string
  readonly value: string
  readonly options: readonly {
    readonly value: string
    readonly label: string
  }[]
  readonly onChange: (value: string) => void
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
          onClick={() => {
            onChange(option.value)
          }}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ConnectorPreview({
  color,
  dash,
  start,
  end,
}: {
  readonly color: string
  readonly dash: string
  readonly start: string
  readonly end: string
}) {
  const dashArray = dash === 'dashed' ? '5 4' : dash === 'dotted' ? '2 3' : undefined

  return (
    <svg aria-hidden="true" className="h-5 w-full" preserveAspectRatio="none" viewBox="0 0 88 20">
      <defs>
        <marker
          id={'preview-start-' + start}
          markerHeight="6"
          markerWidth="6"
          orient="auto-start-reverse"
          refX="5"
          refY="3"
        >
          <path d={getMarkerPath(start)} fill={color} />
        </marker>

        <marker
          id={'preview-end-' + end}
          markerHeight="6"
          markerWidth="6"
          orient="auto"
          refX="5"
          refY="3"
        >
          <path d={getMarkerPath(end)} fill={color} />
        </marker>
      </defs>

      <line
        markerEnd={end === 'none' ? undefined : 'url(#preview-end-' + end + ')'}
        markerStart={start === 'none' ? undefined : 'url(#preview-start-' + start + ')'}
        stroke={color}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        strokeWidth="2"
        x1="7"
        x2="81"
        y1="10"
        y2="10"
      />
    </svg>
  )
}

function getMarkerPath(type: string): string {
  switch (type) {
    case 'diamond':
      return 'M 0 3 L 3 0 L 6 3 L 3 6 Z'

    case 'dot':
      return 'M 3 0 A 3 3 0 1 0 3 6 A 3 3 0 1 0 3 0'

    case 'square':
      return 'M 0 0 H 6 V 6 H 0 Z'

    case 'bar':
      return 'M 4 0 H 6 V 6 H 4 Z'

    case 'inverted':
      return 'M 0 0 L 6 3 L 0 6 Z'

    case 'arrow':
    case 'triangle':
    default:
      return 'M 0 0 L 6 3 L 0 6 Z'
  }
}
