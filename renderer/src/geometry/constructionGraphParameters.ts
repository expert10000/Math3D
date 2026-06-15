import {
  createConstructionGraph,
  indexConstructionGraph,
  type ConstructionGraph,
  type ConstructionGraphNode,
} from "@math3d/core";
import type { GeometryObject } from "./proceduralObjects";

export type GeometryParameterNodeData = {
  objectId: string;
  path: string;
  value: number | boolean | string;
  expression?: string;
  error?: string;
};

const PARAMETER_PREFIX = "parameter:";
const OBJECT_PREFIX = "object:";
const TRANSFORM_PATHS = [
  "transform.position.x",
  "transform.position.y",
  "transform.position.z",
  "transform.rotation.x",
  "transform.rotation.y",
  "transform.rotation.z",
  "transform.scale.x",
  "transform.scale.y",
  "transform.scale.z",
] as const;

export const geometryParameterNodeId = (objectId: string, path: string): string =>
  `${PARAMETER_PREFIX}${objectId}:${path}`;

export const isGeometryParameterNodeData = (value: unknown): value is GeometryParameterNodeData => {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<GeometryParameterNodeData>;
  return typeof data.objectId === "string" && typeof data.path === "string" && "value" in data;
};

const readPath = (object: GeometryObject, path: string): number | boolean | string | undefined => {
  if (path.startsWith("params.")) return object.params[path.slice("params.".length)];
  const parts = path.split(".");
  let value: unknown = object;
  for (const part of parts) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "number" || typeof value === "boolean" || typeof value === "string" ? value : undefined;
};

const writePath = (object: GeometryObject, path: string, value: number | boolean | string): GeometryObject => {
  if (path.startsWith("params.")) {
    return { ...object, params: { ...object.params, [path.slice("params.".length)]: value } };
  }
  const [, group, axis] = path.split(".");
  if ((group === "position" || group === "rotation" || group === "scale") && (axis === "x" || axis === "y" || axis === "z")) {
    return {
      ...object,
      transform: {
        ...object.transform,
        [group]: { ...object.transform[group], [axis]: Number(value) },
      },
    };
  }
  return object;
};

const parameterEntries = (object: GeometryObject): Array<{ path: string; value: number | boolean | string }> => [
  ...Object.entries(object.params).map(([key, value]) => ({ path: `params.${key}`, value })),
  ...TRANSFORM_PATHS.map((path) => ({ path, value: readPath(object, path) as number })),
];

const objectAliasMap = (objects: GeometryObject[]): Map<string, string | null> => {
  const aliases = new Map<string, string | null>();
  for (const object of objects) {
    for (const alias of [object.id, object.name]) {
      const key = alias.trim().toLowerCase();
      if (!key) continue;
      const existing = aliases.get(key);
      aliases.set(key, existing === undefined || existing === object.id ? object.id : null);
    }
  }
  return aliases;
};

const resolveReference = (
  reference: string,
  objects: GeometryObject[],
  aliases = objectAliasMap(objects)
): string | null => {
  const dot = reference.indexOf(".");
  if (dot <= 0) return null;
  const objectId = aliases.get(reference.slice(0, dot).toLowerCase());
  if (!objectId) return null;
  const rawPath = reference.slice(dot + 1);
  const path = rawPath.startsWith("transform.") ? rawPath : `params.${rawPath}`;
  return geometryParameterNodeId(objectId, path);
};

const tokenizeExpression = (expression: string): string[] | null => {
  const tokens = expression.match(/[A-Za-z_][A-Za-z0-9_.-]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?|[()+\-*/]/gi);
  if (!tokens || tokens.join("").replace(/\s/g, "") !== expression.replace(/\s/g, "")) return null;
  return tokens;
};

const expressionReferences = (expression: string): string[] => {
  const tokens = tokenizeExpression(expression) ?? [];
  return Array.from(new Set(tokens.filter((token) => /^[A-Za-z_]/.test(token) && token.includes("."))));
};

const evaluateExpression = (expression: string, resolve: (reference: string) => number | null): number | null => {
  const tokens = tokenizeExpression(expression);
  if (!tokens) return null;
  let index = 0;
  const primary = (): number | null => {
    const token = tokens[index++];
    if (token == null) return null;
    if (token === "(") {
      const value = addSubtract();
      if (tokens[index++] !== ")") return null;
      return value;
    }
    if (token === "-") {
      const value = primary();
      return value == null ? null : -value;
    }
    if (/^\d/.test(token)) return Number(token);
    return resolve(token);
  };
  const multiplyDivide = (): number | null => {
    let value = primary();
    while (value != null && (tokens[index] === "*" || tokens[index] === "/")) {
      const operator = tokens[index++];
      const right = primary();
      if (right == null || (operator === "/" && right === 0)) return null;
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const addSubtract = (): number | null => {
    let value = multiplyDivide();
    while (value != null && (tokens[index] === "+" || tokens[index] === "-")) {
      const operator = tokens[index++];
      const right = multiplyDivide();
      if (right == null) return null;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const value = addSubtract();
  return value != null && index === tokens.length && Number.isFinite(value) ? value : null;
};

export const synchronizeGeometryParameterGraph = (
  graph: ConstructionGraph,
  objects: GeometryObject[]
): ConstructionGraph => {
  const previousById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const validObjectIds = new Set(objects.map((object) => object.id));
  const parameterNodes: ConstructionGraphNode[] = [];
  for (const object of objects) {
    for (const entry of parameterEntries(object)) {
      const id = geometryParameterNodeId(object.id, entry.path);
      const previous = previousById.get(id);
      const previousData = isGeometryParameterNodeData(previous?.data) ? previous.data : null;
      parameterNodes.push({
        ...previous,
        id,
        kind: "parameter",
        type: entry.path.startsWith("transform.") ? "transform-parameter" : "geometry-parameter",
        label: `${object.name}.${entry.path.replace(/^params\./, "")}`,
        status: previousData?.expression ? previous?.status ?? "valid" : "valid",
        data: {
          objectId: object.id,
          path: entry.path,
          value: entry.value,
          ...(previousData?.expression ? { expression: previousData.expression } : {}),
        } satisfies GeometryParameterNodeData,
      });
    }
  }
  const nodes = graph.nodes.filter(
    (node) =>
      node.kind !== "parameter" &&
      !(node.id.startsWith(OBJECT_PREFIX) && !validObjectIds.has(node.id.slice(OBJECT_PREFIX.length)))
  );
  nodes.push(...parameterNodes);
  const parameterIds = new Set(parameterNodes.map((node) => node.id));
  const aliases = objectAliasMap(objects);
  const edges = graph.edges.filter(
    (edge) =>
      !edge.sourceId.startsWith(PARAMETER_PREFIX) &&
      !edge.targetId.startsWith(PARAMETER_PREFIX) &&
      (!edge.sourceId.startsWith(OBJECT_PREFIX) || validObjectIds.has(edge.sourceId.slice(OBJECT_PREFIX.length))) &&
      (!edge.targetId.startsWith(OBJECT_PREFIX) || validObjectIds.has(edge.targetId.slice(OBJECT_PREFIX.length)))
  );
  for (const node of parameterNodes) {
    const data = node.data as GeometryParameterNodeData;
    edges.push({
      id: `depends-on:${node.id}:object:${data.objectId}`,
      sourceId: node.id,
      targetId: `object:${data.objectId}`,
      relation: "depends-on",
    });
    if (!data.expression) continue;
    for (const reference of expressionReferences(data.expression)) {
      const sourceId = resolveReference(reference, objects, aliases);
      if (!sourceId || !parameterIds.has(sourceId)) continue;
      edges.push({
        id: `depends-on:${sourceId}:${node.id}`,
        sourceId,
        targetId: node.id,
        relation: "depends-on",
      });
    }
  }
  return recomputeGeometryParameterGraph(createConstructionGraph(nodes, edges));
};

export const setGeometryParameterExpression = (
  graph: ConstructionGraph,
  parameterId: string,
  expression: string
): ConstructionGraph => {
  const trimmed = expression.trim();
  const nodes = graph.nodes.map((node) => {
    if (node.id !== parameterId || !isGeometryParameterNodeData(node.data)) return node;
    return {
      ...node,
      status: "updating" as const,
      data: {
        ...node.data,
        ...(trimmed ? { expression: trimmed } : {}),
        ...(!trimmed ? { expression: undefined } : {}),
        error: undefined,
      },
    };
  });
  const objects = nodes
    .filter((node) => node.kind === "geometry" && node.type === "geometry-object")
    .map((node) => node.data)
    .filter((value): value is GeometryObject => !!value && typeof value === "object" && "params" in value);
  return synchronizeGeometryParameterGraph(createConstructionGraph(nodes, graph.edges), objects);
};

export const recomputeGeometryParameterGraph = (graph: ConstructionGraph): ConstructionGraph => {
  const index = indexConstructionGraph(graph);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const objectById = new Map(
    graph.nodes
      .filter((node) => node.kind === "geometry" && node.type === "geometry-object")
      .map((node) => [node.id.slice(OBJECT_PREFIX.length), node.data as GeometryObject] as const)
  );
  const objects = Array.from(objectById.values());
  const aliases = objectAliasMap(objects);
  for (const id of index.topologicalNodeIds) {
    const node = nodeById.get(id);
    if (!node || node.kind !== "parameter" || !isGeometryParameterNodeData(node.data) || !node.data.expression) continue;
    const value = evaluateExpression(node.data.expression, (reference) => {
      const sourceId = resolveReference(reference, objects, aliases);
      const source = sourceId ? nodeById.get(sourceId) : null;
      return source && isGeometryParameterNodeData(source.data) && typeof source.data.value === "number"
        ? source.data.value
        : null;
    });
    const data: GeometryParameterNodeData =
      value == null
        ? { ...node.data, error: "Expression could not be resolved." }
        : { ...node.data, value, error: undefined };
    nodeById.set(id, { ...node, status: value == null ? "invalid" : "valid", data });
    if (value != null) {
      const object = objectById.get(data.objectId);
      if (object) objectById.set(data.objectId, writePath(object, data.path, value));
    }
  }
  for (const id of index.cyclicNodeIds) {
    const node = nodeById.get(id);
    if (!node || node.kind !== "parameter" || !isGeometryParameterNodeData(node.data)) continue;
    nodeById.set(id, { ...node, status: "invalid", data: { ...node.data, error: "Cyclic parameter expression." } });
  }
  for (const [objectId, object] of objectById) {
    const id = `${OBJECT_PREFIX}${objectId}`;
    const node = nodeById.get(id);
    if (node) nodeById.set(id, { ...node, data: object });
  }
  return createConstructionGraph(Array.from(nodeById.values()), graph.edges);
};
