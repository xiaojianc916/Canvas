import {
  HYBRID_CANVAS_EXTENSION_API_VERSION,
  type HybridCanvasExtension,
} from '@hybrid-canvas/canvas/extensions'

import { ScientificChartInspectorSection } from './presentation/ScientificChartInspectorSection'
import { ScientificChartShapeUtil } from './shapes/ScientificChartShapeUtil'
import { ScientificChartTool } from './tools/ScientificChartTool'

export const scientificPlotExtension: HybridCanvasExtension = {
  id: '@hybrid-canvas/scientific-plot',
  version: '0.1.0',
  apiVersion: HYBRID_CANVAS_EXTENSION_API_VERSION,
  shapeUtils: [ScientificChartShapeUtil],
  tools: [ScientificChartTool],
  shapeLabels: {
    'scientific-chart': '图表',
  },
  inspectorSections: [
    {
      id: 'scientific-chart-properties',
      owner: '@hybrid-canvas/scientific-plot',
      priority: 100,
      toolIds: ['scientific-chart'],
      shapeTypes: ['scientific-chart'],
      component: ScientificChartInspectorSection,
    },
  ],
}
