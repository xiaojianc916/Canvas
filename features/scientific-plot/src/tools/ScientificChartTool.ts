import { BaseBoxShapeTool } from 'tldraw'

export class ScientificChartTool extends BaseBoxShapeTool {
  static override id = 'scientific-chart'
  static override initial = 'idle'

  override shapeType = 'scientific-chart'
}
