import {
  createConstructionGraph,
  indexConstructionGraph,
  type ConstructionGraph,
  type ConstructionGraphEdge,
  type ConstructionGraphIndex,
  type ConstructionGraphNode,
  type ConstructionGraphNodeStatus,
} from "@math3d/core";
import type { GeometryObject } from "./proceduralObjects";
import { synchronizeGeometryParameterGraph } from "./constructionGraphParameters";

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

export type GeometryObjectGraphCommand =
  | { type: "create"; object: GeometryObject }
  | { type: "update"; objectId: string; update: (object: GeometryObject) => GeometryObject }
  | { type: "delete"; objectId: string }
  | { type: "replace"; objects: GeometryObject[] };

const geometryObjectNodeId = (objectId: string): string => `object:${objectId}`;

const geometryObjectToNode = (
  object: GeometryObject,
  previous?: ConstructionGraphNode
): ConstructionGraphNode => ({
  ...previous,
  id: geometryObjectNodeId(object.id),
  kind: "geometry",
  type: "geometry-object",
  label: object.name,
  status: "valid",
  visible: object.visible,
  data: object,
  metadata: {
    ...(previous?.metadata ?? {}),
    objectType: object.type,
  },
});

const isGeometryObject = (value: unknown): value is GeometryObject => {
  if (!value || typeof value !== "object") return false;
  const object = value as Partial<GeometryObject>;
  return (
    typeof object.id === "string" &&
    typeof object.type === "string" &&
    typeof object.name === "string" &&
    typeof object.visible === "boolean" &&
    !!object.params &&
    !!object.transform &&
    !!object.material
  );
};

export const projectGeometryObjectsFromConstructionGraph = (graph: ConstructionGraph): GeometryObject[] =>
  graph.nodes
    .flatMap((node) =>
      node.kind === "geometry" && node.type === "geometry-object" && isGeometryObject(node.data) ? [node.data] : []
    );

export const replaceGeometryObjectsInConstructionGraph = (
  graph: ConstructionGraph,
  objects: GeometryObject[]
): ConstructionGraph => {
  const objectNodeIds = new Set(objects.map((object) => geometryObjectNodeId(object.id)));
  const previousById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const nodes = graph.nodes.filter((node) => node.kind !== "geometry" || node.type !== "geometry-object");
  nodes.push(...objects.map((object) => geometryObjectToNode(object, previousById.get(geometryObjectNodeId(object.id)))));
  const edges = graph.edges.filter(
    (edge) =>
      (!edge.sourceId.startsWith("object:") || objectNodeIds.has(edge.sourceId)) &&
      (!edge.targetId.startsWith("object:") || objectNodeIds.has(edge.targetId))
  );
  return synchronizeGeometryParameterGraph(createConstructionGraph(nodes, edges), objects);
};

export const applyGeometryObjectGraphCommand = (
  graph: ConstructionGraph,
  command: GeometryObjectGraphCommand
): ConstructionGraph => {
  const objects = projectGeometryObjectsFromConstructionGraph(graph);
  if (command.type === "create") return replaceGeometryObjectsInConstructionGraph(graph, [command.object, ...objects]);
  if (command.type === "delete") {
    return replaceGeometryObjectsInConstructionGraph(graph, objects.filter((object) => object.id !== command.objectId));
  }
  if (command.type === "update") {
    return replaceGeometryObjectsInConstructionGraph(
      graph,
      objects.map((object) => (object.id === command.objectId ? command.update(object) : object))
    );
  }
  return replaceGeometryObjectsInConstructionGraph(graph, command.objects);
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
  objects: GeometryObject[];
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
    const next = geometryObjectToNode(object, previous);
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
  objects: GeometryObject[]
): ConstructionGraph => replaceGeometryObjectsInConstructionGraph(graph, objects);
