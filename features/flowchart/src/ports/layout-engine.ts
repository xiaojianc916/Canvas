import type { FlowEdge, FlowNode } from '../domain/graph'

export interface LayoutEngine {
  layout(graph: {
    nodes: readonly FlowNode[]
    edges: readonly FlowEdge[]
  }): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }>
}
