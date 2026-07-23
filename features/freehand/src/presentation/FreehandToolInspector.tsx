import type {
  HybridCanvasToolInspectorProps,
} from '@hybrid-canvas/canvas/extensions'
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  useValue,
} from 'tldraw'

const COLORS = [
  {
    value: 'black',
    label: '黑色',
    css: '#1d1d1d',
  },
  {
    value: 'grey',
    label: '灰色',
    css: '#9ca3af',
  },
  {
    value: 'red',
    label: '红色',
    css: '#ef4444',
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
    css: '#22c55e',
  },
  {
    value: 'blue',
    label: '蓝色',
    css: '#3b82f6',
  },
  {
    value: 'violet',
    label: '紫色',
    css: '#8b5cf6',
  },
  {
    value: 'light-red',
    label: '浅红',
    css: '#fca5a5',
  },
  {
    value: 'light-green',
    label: '浅绿',
    css: '#86efac',
  },
  {
    value: 'light-blue',
    label: '浅蓝',
    css: '#93c5fd',
  },
  {
    value: 'light-violet',
    label: '浅紫',
    css: '#c4b5fd',
  },
] as const

const SIZE_OPTIONS = [
  { value: 's', label: '细' },
  { value: 'm', label: '中' },
  { value: 'l', label: '粗' },
  { value: 'xl', label: '特粗' },
] as const

const DASH_OPTIONS = [
  { value: 'draw', label: '手绘' },
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
] as const

const DRAW_PRESETS = [
  {
    id: 'pencil',
    label: '铅笔',
    description: '细手绘线',
    color: 'black',
    size: 's',
    dash: 'draw',
  },
  {
    id: 'technical-pen',
    label: '技术笔',
    description: '均匀实线',
    color: 'black',
    size: 'm',
    dash: 'solid',
  },
  {
    id: 'marker',
    label: '马克笔',
    description: '粗实线',
    color: 'blue',
    size: 'l',
    dash: 'solid',
  },
  {
    id: 'sketch',
    label: '草图',
    description: '灰色手绘',
    color: 'grey',
    size: 'm',
    dash: 'draw',
  },
] as const

const HIGHLIGHT_PRESETS = [
  {
    id: 'yellow-highlight',
    label: '黄色',
    color: 'yellow',
    size: 'xl',
  },
  {
    id: 'green-highlight',
    label: '绿色',
    color: 'light-green',
    size: 'xl',
  },
  {
    id: 'blue-highlight',
    label: '蓝色',
    color: 'light-blue',
    size: 'xl',
  },
  {
    id: 'red-highlight',
    label: '红色',
    color: 'light-red',
    size: 'xl',
  },
] as const

export function FreehandToolInspector({
  editor,
}: HybridCanvasToolInspectorProps) {
  return (
    <FreehandInspector
      editor={editor}
      variant="draw"
    />
  )
}

export function HighlightToolInspector({
  editor,
}: HybridCanvasToolInspectorProps) {
  return (
    <FreehandInspector
      editor={editor}
      variant="highlight"
    />
  )
}

interface FreehandInspectorProps
  extends HybridCanvasToolInspectorProps {
  readonly variant: 'draw' | 'highlight'
}

function FreehandInspector({
  editor,
  variant,
}: FreehandInspectorProps) {
  const isHighlight = variant === 'highlight'

  const currentColor = useValue(
    'freehand inspector next color',
    () =>
      editor.getStyleForNextShape(
        DefaultColorStyle,
      ),
    [editor],
  )

  const currentSize = useValue(
    'freehand inspector next size',
    () =>
      editor.getStyleForNextShape(
        DefaultSizeStyle,
      ),
    [editor],
  )

  const currentDash = useValue(
    'freehand inspector next dash',
    () =>
      editor.getStyleForNextShape(
        DefaultDashStyle,
      ),
    [editor],
  )

  const applyDrawPreset = (
    preset: (typeof DRAW_PRESETS)[number],
  ) => {
    editor.setStyleForNextShapes(
      DefaultColorStyle,
      preset.color,
    )

    editor.setStyleForNextShapes(
      DefaultSizeStyle,
      preset.size,
    )

    editor.setStyleForNextShapes(
      DefaultDashStyle,
      preset.dash,
    )
  }

  const applyHighlightPreset = (
    preset:
      (typeof HIGHLIGHT_PRESETS)[number],
  ) => {
    editor.setStyleForNextShapes(
      DefaultColorStyle,
      preset.color,
    )

    editor.setStyleForNextShapes(
      DefaultSizeStyle,
      preset.size,
    )
  }

  return (
    <div className="space-y-4">
      <header className="border-b border-divider pb-3">
        <h2 className="text-sm font-semibold">
          {isHighlight
            ? '高亮'
            : '自由绘制'}
        </h2>

        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          {isHighlight
            ? '设置下一条高亮笔触的颜色和粗细。'
            : '设置下一条自由笔触的预设、颜色、粗细和线型。'}
        </p>
      </header>

      <InspectorSection
        description="预设会同时应用颜色、粗细和线型。"
        title="预设"
      >
        {isHighlight ? (
          <div className="grid grid-cols-2 gap-2">
            {HIGHLIGHT_PRESETS.map(
              (preset) => {
                const selected =
                  currentColor ===
                    preset.color &&
                  currentSize === preset.size

                return (
                  <button
                    aria-pressed={selected}
                    className={
                      'flex min-h-10 items-center gap-2 rounded-md border px-2 ' +
                      'text-left text-[11px] transition-colors ' +
                      (
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-divider bg-background hover:bg-accent'
                      )
                    }
                    key={preset.id}
                    onClick={() => {
                      applyHighlightPreset(
                        preset,
                      )
                    }}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-8 rounded-sm"
                      style={{
                        backgroundColor:
                          COLORS.find(
                            (color) =>
                              color.value ===
                              preset.color,
                          )?.css,
                      }}
                    />

                    <span>{preset.label}</span>
                  </button>
                )
              },
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {DRAW_PRESETS.map((preset) => {
              const selected =
                currentColor === preset.color &&
                currentSize === preset.size &&
                currentDash === preset.dash

              return (
                <button
                  aria-pressed={selected}
                  className={
                    'min-h-12 rounded-md border px-2 py-1.5 text-left ' +
                    'transition-colors ' +
                    (
                      selected
                        ? 'border-primary bg-primary/10'
                        : 'border-divider bg-background hover:bg-accent'
                    )
                  }
                  key={preset.id}
                  onClick={() => {
                    applyDrawPreset(preset)
                  }}
                  type="button"
                >
                  <span className="block text-[11px] font-medium">
                    {preset.label}
                  </span>

                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {preset.description}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </InspectorSection>

      <InspectorSection title="颜色">
        <div className="grid grid-cols-6 gap-1.5">
          {COLORS.map((color) => (
            <button
              aria-label={
                '设置颜色为' + color.label
              }
              aria-pressed={
                currentColor === color.value
              }
              className={
                'size-7 rounded-md border border-divider transition-transform ' +
                'hover:scale-105 focus-visible:outline-none ' +
                'focus-visible:ring-2 focus-visible:ring-primary ' +
                (
                  currentColor === color.value
                    ? 'ring-2 ring-primary ring-offset-1'
                    : ''
                )
              }
              key={color.value}
              onClick={() => {
                editor.setStyleForNextShapes(
                  DefaultColorStyle,
                  color.value,
                )
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
        <SegmentedControl
          ariaLabel="笔触粗细"
          onChange={(value) => {
            editor.setStyleForNextShapes(
              DefaultSizeStyle,
              value as never,
            )
          }}
          options={SIZE_OPTIONS}
          value={currentSize}
        />
      </InspectorSection>

      {!isHighlight ? (
        <InspectorSection title="线型">
          <SegmentedControl
            ariaLabel="笔触线型"
            onChange={(value) => {
              editor.setStyleForNextShapes(
                DefaultDashStyle,
                value as never,
              )
            }}
            options={DASH_OPTIONS}
            value={currentDash}
          />
        </InspectorSection>
      ) : null}

      <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
        当前使用 tldraw 原生笔触引擎。面板只显示已经真实生效的设置；
        平滑、稳定器、流量和压感将在自定义笔触工具接入后开放。
      </div>
    </div>
  )
}

interface InspectorSectionProps {
  readonly title: string
  readonly description?: string
  readonly children:
    import('react').ReactNode
}

function InspectorSection({
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

interface SegmentedControlProps {
  readonly ariaLabel: string
  readonly value: string
  readonly options: readonly {
    readonly value: string
    readonly label: string
  }[]
  readonly onChange: (
    value: string,
  ) => void
}

function SegmentedControl({
  ariaLabel,
  value,
  options,
  onChange,
}: SegmentedControlProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="grid gap-1.5"
      role="group"
      style={{
        gridTemplateColumns:
          'repeat(' +
          String(options.length) +
          ', minmax(0, 1fr))',
      }}
    >
      {options.map((option) => (
        <button
          aria-pressed={
            value === option.value
          }
          className={
            'min-h-8 rounded-md border px-1 text-[10px] transition-colors ' +
            (
              value === option.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-divider bg-background hover:bg-accent'
            )
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
