import { StyleProp } from 'tldraw'

export type ScientificChartType =
  | 'line'
  | 'bar'
  | 'area'
  | 'scatter'

export const ScientificChartTypeStyle =
  StyleProp.defineEnum<ScientificChartType>(
    'hybrid-canvas:scientific-chart-type',
    {
      defaultValue: 'line',
      values: ['line', 'bar', 'area', 'scatter'],
    },
  )
