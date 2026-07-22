import type { HybridCanvasExtension } from '@hybrid-canvas/canvas/extensions'

import { ScientificChartShapeUtil } from './shapes/ScientificChartShapeUtil'
import { ScientificChartTool } from './tools/ScientificChartTool'

export const scientificPlotExtension: HybridCanvasExtension = {
  id: '@hybrid-canvas/scientific-plot',
  version: '0.1.0',
  apiVersion: '1',
  shapeUtils: [ScientificChartShapeUtil],
  tools: [ScientificChartTool],
  shapeLabels: {
    'scientific-chart': '图表',
  },
}
