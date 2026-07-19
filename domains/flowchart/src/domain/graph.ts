export type FlowNodeId = string & { readonly __brand: 'FlowNodeId' }
export type FlowEdgeId = string & { readonly __brand: 'FlowEdgeId' }

export interface FlowNode {
  readonly id: FlowNodeId
  readonly type: string
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface FlowEdge {
  readonly id: FlowEdgeId
  readonly source: FlowNodeId
  readonly target: FlowNodeId
  readonly label?: string
}
