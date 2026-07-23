import type { HybridCanvasToolInspectorProps } from '@hybrid-canvas/canvas/extensions'
import { DefaultColorStyle, DefaultSizeStyle, useValue } from 'tldraw'
import { type ScientificChartType, ScientificChartTypeStyle } from '../styles/chart-styles'

const CHART_TYPES = [
  {
    value: 'line',
    label: '折线图',
    description: '展示连续趋势',
  },
  {
    value: 'bar',
    label: '柱状图',
    description: '比较离散分类',
  },
  {
    value: 'area',
    label: '面积图',
    description: '强调趋势总量',
  },
  {
    value: 'scatter',
    label: '散点图',
    description: '展示变量关系',
  },
] as const

const CHART_COLORS = [
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
    value: 'blue',
    label: '蓝色',
    css: '#2563eb',
  },
  {
    value: 'light-blue',
    label: '浅蓝',
    css: '#60a5fa',
  },
  {
    value: 'green',
    label: '绿色',
    css: '#16a34a',
  },
  {
    value: 'light-green',
    label: '浅绿',
    css: '#4ade80',
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
    value: 'red',
    label: '红色',
    css: '#dc2626',
  },
  {
    value: 'light-red',
    label: '浅红',
    css: '#f87171',
  },
  {
    value: 'violet',
    label: '紫色',
    css: '#7c3aed',
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

export function ScientificChartToolInspector({ editor }: HybridCanvasToolInspectorProps) {
  const currentChartType = useValue(
    'scientific chart next type',
    () => editor.getStyleForNextShape(ScientificChartTypeStyle),
    [editor],
  )

  const currentColor = useValue(
    'scientific chart next color',
    () => editor.getStyleForNextShape(DefaultColorStyle),
    [editor],
  )

  const currentSize = useValue(
    'scientific chart next size',
    () => editor.getStyleForNextShape(DefaultSizeStyle),
    [editor],
  )

  const currentColorCss =
    CHART_COLORS.find((color) => color.value === currentColor)?.css ?? '#2563eb'

  return (
    <div className="space-y-4">
      <header className="border-b border-divider pb-3">
        <h2 className="text-sm font-semibold">科学图表</h2>

        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          选择类型和初始样式，然后在画布中拖动创建图表。
        </p>
      </header>

      <InspectorSection description="选择创建下一个图表时使用的图表类型。" title="图表类型">
        <div className="grid grid-cols-2 gap-2">
          {CHART_TYPES.map((chartType) => {
            const selected = currentChartType === chartType.value

            return (
              <button
                aria-label={'创建' + chartType.label}
                aria-pressed={selected}
                className={
                  'group min-h-24 rounded-md border p-2 text-left ' +
                  'transition-colors focus-visible:outline-none ' +
                  'focus-visible:ring-2 focus-visible:ring-primary ' +
                  (selected
                    ? 'border-primary bg-primary/10'
                    : 'border-divider bg-background hover:bg-accent')
                }
                key={chartType.value}
                onClick={() => {
                  editor.setStyleForNextShapes(ScientificChartTypeStyle, chartType.value)
                }}
                type="button"
              >
                <ChartTypePreview color={currentColorCss} type={chartType.value} />

                <span className="mt-2 block text-[11px] font-medium">{chartType.label}</span>

                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {chartType.description}
                </span>
              </button>
            )
          })}
        </div>
      </InspectorSection>

      <InspectorSection description="当前 Shape 使用单系列示例数据。" title="数据">
        <div className="rounded-md border border-divider bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium">示例数据</p>

              <p className="mt-0.5 text-[10px] text-muted-foreground">1 个系列 · 7 个数据点</p>
            </div>

            <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
              内置
            </span>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="系列颜色">
        <div className="grid grid-cols-6 gap-1.5">
          {CHART_COLORS.map((color) => (
            <button
              aria-label={'设置图表颜色为' + color.label}
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

      <InspectorSection title="线条与标记">
        <div aria-label="图表线条粗细" className="grid grid-cols-4 gap-1.5" role="group">
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

      <InspectorSection title="创建默认值">
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-md border border-divider bg-background p-3 text-[10px]">
          <dt className="text-muted-foreground">默认尺寸</dt>
          <dd className="font-mono tabular-nums">420 × 260</dd>

          <dt className="text-muted-foreground">坐标轴</dt>
          <dd>显示</dd>

          <dt className="text-muted-foreground">网格线</dt>
          <dd>显示</dd>

          <dt className="text-muted-foreground">图例</dt>
          <dd>显示</dd>
        </dl>
      </InspectorSection>

      <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
        创建图表后，右侧栏会切换到图表对象属性。
        数据导入、字段映射、坐标轴和系列配置将在图表领域模型接入后开放。
      </div>
    </div>
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

function ChartTypePreview({
  type,
  color,
}: {
  readonly type: ScientificChartType
  readonly color: string
}) {
  const values = [0.24, 0.68, 0.42, 0.82, 0.58]

  const width = 92
  const height = 38
  const padding = 3
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  const points = values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * chartWidth

      const y = padding + (1 - value) * chartHeight

      return String(x) + ',' + String(y)
    })
    .join(' ')

  return (
    <svg
      aria-hidden="true"
      className="h-10 w-full overflow-visible"
      preserveAspectRatio="none"
      viewBox={'0 0 ' + String(width) + ' ' + String(height)}
    >
      <line
        stroke="currentColor"
        strokeOpacity="0.12"
        x1={padding}
        x2={width - padding}
        y1={height - padding}
        y2={height - padding}
      />

      {type === 'line' ? (
        <polyline
          fill="none"
          points={points}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      ) : null}

      {type === 'area' ? (
        <polygon
          fill={color}
          fillOpacity="0.2"
          points={
            String(padding) +
            ',' +
            String(height - padding) +
            ' ' +
            points +
            ' ' +
            String(width - padding) +
            ',' +
            String(height - padding)
          }
          stroke={color}
          strokeWidth="2"
        />
      ) : null}

      {type === 'bar'
        ? values.map((value, index) => {
            const slot = chartWidth / values.length

            const barWidth = slot * 0.56

            const barHeight = value * chartHeight

            return (
              <rect
                fill={color}
                height={barHeight}
                key={String(index)}
                rx="1"
                width={barWidth}
                x={padding + index * slot + (slot - barWidth) / 2}
                y={height - padding - barHeight}
              />
            )
          })
        : null}

      {type === 'scatter'
        ? values.map((value, index) => {
            const x = padding + (index / (values.length - 1)) * chartWidth

            const y = padding + (1 - value) * chartHeight

            return <circle cx={x} cy={y} fill={color} key={String(index)} r="2.5" />
          })
        : null}
    </svg>
  )
}
