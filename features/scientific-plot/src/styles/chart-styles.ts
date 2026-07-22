import { StyleProp } from 'tldraw'

export const SCIENTIFIC_CHART_TYPES = ['line', 'bar', 'area', 'scatter'] as const

export type ScientificChartType = (typeof SCIENTIFIC_CHART_TYPES)[number]

export const ScientificChartTypeStyle = StyleProp.defineEnum(
  'hybrid-canvas:scientific-chart-type',
  {
    defaultValue: 'line',
    values: SCIENTIFIC_CHART_TYPES,
  },
)
