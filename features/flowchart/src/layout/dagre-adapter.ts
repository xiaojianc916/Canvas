import type { FlowEdge, FlowNode } from '../domain/graph'

export interface LayoutResult {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export async function layoutWithDagre(graph: {
  nodes: readonly FlowNode[]
  edges: readonly FlowEdge[]
}): Promise<LayoutResult> {
  const dagre = await import('@dagrejs/dagre')
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))

  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })

  for (const node of graph.nodes) {
    g.setNode(node.id, { label: node.label, width: node.width, height: node.height })
  }

  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target, { label: edge.label })
  }

  dagre.layout(g)

  const layoutedNodes: FlowNode[] = graph.nodes.map((node) => {
    const dagreNode = g.node(node.id)
    return {
      ...node,
      x: dagreNode.x - node.width / 2,
      y: dagreNode.y - node.height / 2,
    }
  })

  return { nodes: layoutedNodes, edges: [...graph.edges] }
}
