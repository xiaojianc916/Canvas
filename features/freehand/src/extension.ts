import type {
  HybridCanvasExtension,
} from '@hybrid-canvas/canvas/extensions'
import {
  FreehandToolInspector,
  HighlightToolInspector,
} from './presentation/FreehandToolInspector'

export const freehandExtension:
  HybridCanvasExtension = {
    id: '@hybrid-canvas/freehand',
    version: '0.1.0',
    apiVersion: '1',

    toolInspectors: [
      {
        toolId: 'draw',
        owner: '@hybrid-canvas/freehand',
        priority: 100,
        component: FreehandToolInspector,
      },
      {
        toolId: 'highlight',
        owner: '@hybrid-canvas/freehand',
        priority: 100,
        component: HighlightToolInspector,
      },
    ],
  }
