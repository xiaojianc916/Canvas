import { T } from '@tldraw/validate'
import type { CSSProperties, ReactElement } from 'react'
import {
  DefaultColorStyle,
  DefaultSizeStyle,
  Rectangle2d,
  ShapeUtil,
  type TLBaseShape,
  type TLDefaultColorStyle,
  type TLDefaultSizeStyle,
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
  readonly color: TLDefaultColorStyle
  readonly size: TLDefaultSizeStyle
  readonly showAxes: boolean
  readonly showGrid: boolean
  readonly showLegend: boolean
}

export type ScientificChartShape = TLBaseShape<
  'scientific-chart',
  ScientificChartShapeProps
>

const COLOR_VALUES: Record<string, string> = {
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

const STROKE_WIDTHS: Record<string, number> = {
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

  const stroke =
    COLOR_VALUES[color] ?? '#2563eb'
  const strokeWidth = STROKE_WIDTHS[size] ?? 3

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
