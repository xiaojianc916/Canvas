import {
  HYBRID_CANVAS_EXTENSION_API_VERSION,
  type HybridCanvasExtension,
} from '@hybrid-canvas/canvas/extensions'
import { ConnectorToolInspector } from './presentation/ConnectorToolInspector'
import { FlowNodeShapeUtil } from './shapes/FlowNodeShapeUtil'

export const flowchartExtension: HybridCanvasExtension = {
  id: '@hybrid-canvas/flowchart',
  version: '0.1.0',
  apiVersion: HYBRID_CANVAS_EXTENSION_API_VERSION,
  shapeUtils: [FlowNodeShapeUtil],
  shapeLabels: {
    'flow-node': '流程图节点',
  },
  creationInspectors: [
    {
      toolId: 'arrow',
      owner: '@hybrid-canvas/flowchart',
      priority: 100,
      component: ConnectorToolInspector,
    },
  ],
}
