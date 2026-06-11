import dagre from "@dagrejs/dagre";

export type DependencyDagNode = {
  id: string;
  width?: number;
  height?: number;
};

export type DependencyDagEdge = {
  sourceId: string;
  targetId: string;
};

export type DependencyDagPosition = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DependencyDagLayout = {
  width: number;
  height: number;
  positions: Map<string, DependencyDagPosition>;
};

const DEFAULT_NODE_WIDTH = 154;
const DEFAULT_NODE_HEIGHT = 48;

export const layoutDependencyDag = (
  nodes: DependencyDagNode[],
  edges: DependencyDagEdge[],
  direction: "TB" | "LR" = "TB"
): DependencyDagLayout => {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: direction,
    ranksep: 74,
    nodesep: 30,
    edgesep: 18,
    marginx: 28,
    marginy: 28,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: node.width ?? DEFAULT_NODE_WIDTH,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
    });
  }
  edges.forEach((edge, index) => {
    if (!graph.hasNode(edge.sourceId) || !graph.hasNode(edge.targetId)) return;
    graph.setEdge(edge.sourceId, edge.targetId, {}, `${edge.sourceId}:${edge.targetId}:${index}`);
  });

  dagre.layout(graph);

  const positions = new Map<string, DependencyDagPosition>();
  for (const node of nodes) {
    const positioned = graph.node(node.id);
    const width = positioned?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
    const height = positioned?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;
    positions.set(node.id, {
      id: node.id,
      x: (positioned?.x ?? width / 2) - width / 2,
      y: (positioned?.y ?? height / 2) - height / 2,
      width,
      height,
    });
  }

  const graphSize = graph.graph();
  return {
    width: Math.max(1, Number(graphSize.width ?? 1)),
    height: Math.max(1, Number(graphSize.height ?? 1)),
    positions,
  };
};
