export const CONSTRUCTION_GRAPH_VERSION = 1 as const;

export type ConstructionGraphNodeKind =
  | "root"
  | "parameter"
  | "geometry"
  | "construction"
  | "script"
  | "claim"
  | "analysis";

export type ConstructionGraphNodeStatus =
  | "valid"
  | "updating"
  | "stale"
  | "invalid"
  | "broken-source"
  | "ambiguous-target"
  | "frozen"
  | "disabled";

export type ConstructionGraphNode = {
  id: string;
  kind: ConstructionGraphNodeKind;
  type: string;
  label?: string;
  status?: ConstructionGraphNodeStatus;
  visible?: boolean;
  data?: unknown;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ConstructionGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  enabled?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ConstructionGraph = {
  version: typeof CONSTRUCTION_GRAPH_VERSION;
  nodes: ConstructionGraphNode[];
  edges: ConstructionGraphEdge[];
};

export type ConstructionGraphIndex = {
  graph: ConstructionGraph;
  nodeById: Map<string, ConstructionGraphNode>;
  edgeById: Map<string, ConstructionGraphEdge>;
  incomingById: Map<string, ConstructionGraphEdge[]>;
  outgoingById: Map<string, ConstructionGraphEdge[]>;
  topologicalNodeIds: string[];
  cyclicNodeIds: string[];
  errors: string[];
};

export type ConstructionGraphProjectionSelector = {
  nodeKinds?: Iterable<ConstructionGraphNodeKind>;
  nodeIds?: Iterable<string>;
  edgeRelations?: Iterable<string>;
  includeDependencies?: boolean;
  includeDependents?: boolean;
};

const uniqueById = <T extends { id: string }>(values: T[]): T[] => {
  const byId = new Map<string, T>();
  for (const value of values) byId.set(value.id, value);
  return Array.from(byId.values());
};

export const createConstructionGraph = (
  nodes: ConstructionGraphNode[] = [],
  edges: ConstructionGraphEdge[] = []
): ConstructionGraph => ({
  version: CONSTRUCTION_GRAPH_VERSION,
  nodes: uniqueById(nodes),
  edges: uniqueById(edges),
});

export const indexConstructionGraph = (graph: ConstructionGraph): ConstructionGraphIndex => {
  const errors: string[] = [];
  const nodeById = new Map<string, ConstructionGraphNode>();
  const edgeById = new Map<string, ConstructionGraphEdge>();
  const incomingById = new Map<string, ConstructionGraphEdge[]>();
  const outgoingById = new Map<string, ConstructionGraphEdge[]>();

  for (const node of graph.nodes) {
    if (nodeById.has(node.id)) errors.push(`Duplicate construction graph node id '${node.id}'.`);
    nodeById.set(node.id, node);
    incomingById.set(node.id, []);
    outgoingById.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (edgeById.has(edge.id)) errors.push(`Duplicate construction graph edge id '${edge.id}'.`);
    edgeById.set(edge.id, edge);
    if (!nodeById.has(edge.sourceId)) errors.push(`Edge '${edge.id}' has missing source '${edge.sourceId}'.`);
    if (!nodeById.has(edge.targetId)) errors.push(`Edge '${edge.id}' has missing target '${edge.targetId}'.`);
    if (edge.enabled === false || !nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;
    outgoingById.get(edge.sourceId)?.push(edge);
    incomingById.get(edge.targetId)?.push(edge);
  }

  const indegree = new Map(graph.nodes.map((node) => [node.id, incomingById.get(node.id)?.length ?? 0] as const));
  const queue = graph.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const topologicalNodeIds: string[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    topologicalNodeIds.push(id);
    for (const edge of outgoingById.get(id) ?? []) {
      const next = (indegree.get(edge.targetId) ?? 0) - 1;
      indegree.set(edge.targetId, next);
      if (next === 0) queue.push(edge.targetId);
    }
  }
  const sorted = new Set(topologicalNodeIds);
  const cyclicNodeIds = graph.nodes.map((node) => node.id).filter((id) => !sorted.has(id));

  return {
    graph,
    nodeById,
    edgeById,
    incomingById,
    outgoingById,
    topologicalNodeIds,
    cyclicNodeIds,
    errors,
  };
};

const walkGraph = (
  seeds: Iterable<string>,
  edgesById: Map<string, ConstructionGraphEdge[]>,
  nextId: (edge: ConstructionGraphEdge) => string
): Set<string> => {
  const visited = new Set(seeds);
  const queue = Array.from(visited);
  for (let index = 0; index < queue.length; index += 1) {
    for (const edge of edgesById.get(queue[index]) ?? []) {
      const id = nextId(edge);
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(id);
    }
  }
  return visited;
};

export const getAffectedConstructionGraphNodeIds = (
  graph: ConstructionGraph,
  changedNodeIds: Iterable<string>
): string[] => {
  const index = indexConstructionGraph(graph);
  const changed = new Set(changedNodeIds);
  const affected = walkGraph(changed, index.outgoingById, (edge) => edge.targetId);
  const order = [...index.topologicalNodeIds, ...index.cyclicNodeIds];
  return order.filter((id) => affected.has(id) && !changed.has(id));
};

export const projectConstructionGraph = (
  graph: ConstructionGraph,
  selector: ConstructionGraphProjectionSelector = {}
): ConstructionGraph => {
  const index = indexConstructionGraph(graph);
  const kinds = selector.nodeKinds ? new Set(selector.nodeKinds) : null;
  const hasExplicitNodeIds = selector.nodeIds !== undefined;
  const selectedIds = hasExplicitNodeIds ? new Set(selector.nodeIds) : new Set<string>();
  if (kinds) {
    for (const node of graph.nodes) {
      if (kinds.has(node.kind)) selectedIds.add(node.id);
    }
  } else if (!hasExplicitNodeIds) {
    for (const node of graph.nodes) selectedIds.add(node.id);
  }

  if (selector.includeDependencies) {
    for (const id of walkGraph(selectedIds, index.incomingById, (edge) => edge.sourceId)) selectedIds.add(id);
  }
  if (selector.includeDependents) {
    for (const id of walkGraph(selectedIds, index.outgoingById, (edge) => edge.targetId)) selectedIds.add(id);
  }

  const relations = selector.edgeRelations ? new Set(selector.edgeRelations) : null;
  return createConstructionGraph(
    graph.nodes.filter((node) => selectedIds.has(node.id)),
    graph.edges.filter(
      (edge) =>
        edge.enabled !== false &&
        selectedIds.has(edge.sourceId) &&
        selectedIds.has(edge.targetId) &&
        (!relations || relations.has(edge.relation))
    )
  );
};

export const upsertConstructionGraph = (
  graph: ConstructionGraph,
  nodes: ConstructionGraphNode[] = [],
  edges: ConstructionGraphEdge[] = []
): ConstructionGraph => createConstructionGraph([...graph.nodes, ...nodes], [...graph.edges, ...edges]);

export const removeConstructionGraphNodes = (
  graph: ConstructionGraph,
  nodeIds: Iterable<string>
): ConstructionGraph => {
  const removed = new Set(nodeIds);
  return createConstructionGraph(
    graph.nodes.filter((node) => !removed.has(node.id)),
    graph.edges.filter((edge) => !removed.has(edge.sourceId) && !removed.has(edge.targetId))
  );
};
