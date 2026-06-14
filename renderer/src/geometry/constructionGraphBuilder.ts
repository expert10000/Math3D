import {
  createConstructionGraph,
  indexConstructionGraph,
  type ConstructionGraph,
  type ConstructionGraphEdge,
  type ConstructionGraphIndex,
  type ConstructionGraphNode,
  type ConstructionGraphNodeStatus,
} from "@math3d/core";

export type ConstructionGraphNodeInput = Omit<ConstructionGraphNode, "kind" | "type"> & {
  kind: ConstructionGraphNode["kind"];
  type: string;
  status?: ConstructionGraphNodeStatus;
};

export type ConstructionGraphEdgeInput = Omit<ConstructionGraphEdge, "id"> & { id?: string };

export type ConstructionGraphBuilder = {
  addNode: (node: ConstructionGraphNodeInput) => void;
  addEdge: (edge: ConstructionGraphEdgeInput) => void;
  build: () => ConstructionGraphIndex;
};

export const createConstructionGraphBuilder = (baseGraph: ConstructionGraph = createConstructionGraph()): ConstructionGraphBuilder => {
  const nodeById = new Map(baseGraph.nodes.map((node) => [node.id, node] as const));
  const edgeById = new Map(baseGraph.edges.map((edge) => [edge.id, edge] as const));

  return {
    addNode: (node) => {
      nodeById.set(node.id, node);
    },
    addEdge: (edge) => {
      const id = edge.id ?? `dependency:${edge.sourceId}:${edge.targetId}:${edge.relation}`;
      edgeById.set(id, { ...edge, id });
    },
    build: () => indexConstructionGraph(createConstructionGraph(Array.from(nodeById.values()), Array.from(edgeById.values()))),
  };
};

export const synchronizeScriptOwnershipGraph = (args: {
  graph: ConstructionGraph;
  scriptId: string;
  scriptTitle: string;
  scriptSource: string;
  objects: Array<{ id: string; name: string; type: string }>;
  createdObjectIds: Iterable<string>;
  deletedObjectIds: Iterable<string>;
}): ConstructionGraph => {
  const scriptNodeId = `script:${args.scriptId}`;
  const objectById = new Map(args.objects.map((object) => [object.id, object] as const));
  const createdIds = new Set(args.createdObjectIds);
  const deletedIds = new Set(args.deletedObjectIds);
  const previouslyOwnedIds = new Set(
    args.graph.edges
      .filter((edge) => edge.sourceId === scriptNodeId && edge.relation === "defines")
      .map((edge) => edge.targetId.replace(/^object:/, ""))
  );
  for (const id of createdIds) previouslyOwnedIds.add(id);
  for (const id of deletedIds) previouslyOwnedIds.delete(id);

  const nodes = args.graph.nodes.filter(
    (node) =>
      node.id !== scriptNodeId &&
      !(node.id.startsWith("object:") && deletedIds.has(node.id.slice("object:".length)))
  );
  nodes.push({
    id: scriptNodeId,
    kind: "script",
    type: "scene-script",
    label: args.scriptTitle,
    status: "valid",
    data: { source: args.scriptSource },
  });
  const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index] as const));
  for (const object of args.objects) {
    const id = `object:${object.id}`;
    const previous = nodes.find((node) => node.id === id);
    const next: ConstructionGraphNode = {
      ...previous,
      id,
      kind: "geometry",
      type: "geometry-object",
      label: object.name,
      status: "valid",
      metadata: {
        ...(previous?.metadata ?? {}),
        objectType: object.type,
      },
    };
    const previousIndex = nodeIndexById.get(id) ?? -1;
    if (previousIndex >= 0) nodes[previousIndex] = next;
    else {
      nodeIndexById.set(id, nodes.length);
      nodes.push(next);
    }
  }

  const edges = args.graph.edges.filter(
    (edge) =>
      edge.sourceId !== scriptNodeId &&
      !(edge.sourceId.startsWith("object:") && deletedIds.has(edge.sourceId.slice("object:".length))) &&
      !(edge.targetId.startsWith("object:") && deletedIds.has(edge.targetId.slice("object:".length)))
  );
  for (const objectId of previouslyOwnedIds) {
    if (!objectById.has(objectId)) continue;
    edges.push({
      id: `defines:${scriptNodeId}:object:${objectId}`,
      sourceId: scriptNodeId,
      targetId: `object:${objectId}`,
      relation: "defines",
    });
  }
  return createConstructionGraph(nodes, edges);
};

export const synchronizeGeometryObjectGraph = (
  graph: ConstructionGraph,
  objects: Array<{ id: string; name: string; type: string }>
): ConstructionGraph => {
  const objectIds = new Set(objects.map((object) => `object:${object.id}`));
  const nodes = graph.nodes.filter((node) => node.kind !== "geometry" || node.type !== "geometry-object" || objectIds.has(node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  for (const object of objects) {
    const id = `object:${object.id}`;
    const previous = nodeById.get(id);
    nodeById.set(id, {
      ...previous,
      id,
      kind: "geometry",
      type: "geometry-object",
      label: object.name,
      status: "valid",
      metadata: { ...(previous?.metadata ?? {}), objectType: object.type },
    });
  }
  const edges = graph.edges.filter((edge) => {
    if (edge.sourceId.startsWith("object:") && !objectIds.has(edge.sourceId)) return false;
    if (edge.targetId.startsWith("object:") && !objectIds.has(edge.targetId)) return false;
    return true;
  });
  return createConstructionGraph(Array.from(nodeById.values()), edges);
};
