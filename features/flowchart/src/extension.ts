import type { HybridCanvasExtension } from '@hybrid-canvas/canvas'
import { FlowNodeShapeUtil } from './shapes/FlowNodeShapeUtil'

export const flowchartExtension: HybridCanvasExtension = {
  id: '@hybrid-canvas/flowchart',
  version: '0.1.0',
  apiVersion: '1',
  shapeUtils: [FlowNodeShapeUtil],
  shapeLabels: {
    'flow-node': '流程图节点',
  },
}
