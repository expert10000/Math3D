import { createConstructionGraph, type ConstructionGraph, type ConstructionGraphNode } from "@math3d/core";
import type { GeometryObject } from "./proceduralObjects";

export type GeometryAnalysisKind =
  | "volume"
  | "surfaceArea"
  | "distance"
  | "bounds.width"
  | "bounds.height"
  | "bounds.depth";

export type GeometryAnalysisNodeData = {
  objectId: string;
  analysis: GeometryAnalysisKind;
  value?: number;
  error?: string;
};

export type GeometryClaimResult = "verified" | "failed" | "unresolved";

export type GeometryClaimNodeData = {
  source: string;
  result: GeometryClaimResult;
  leftValue?: number;
  rightValue?: number;
  error?: string;
};

const ANALYSIS_KINDS: GeometryAnalysisKind[] = [
  "volume",
  "surfaceArea",
  "distance",
  "bounds.width",
  "bounds.height",
  "bounds.depth",
];

export const geometryAnalysisNodeId = (objectId: string, analysis: GeometryAnalysisKind): string =>
  `analysis:${objectId}:${analysis}`;

export const geometryClaimNodeId = (index: number): string => `claim:${index + 1}`;

export const isGeometryAnalysisNodeData = (value: unknown): value is GeometryAnalysisNodeData => {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<GeometryAnalysisNodeData>;
  return typeof data.objectId === "string" && typeof data.analysis === "string";
};

export const isGeometryClaimNodeData = (value: unknown): value is GeometryClaimNodeData => {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<GeometryClaimNodeData>;
  return typeof data.source === "string" && typeof data.result === "string";
};

const numeric = (value: unknown, fallback = 0): number => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const objectMetrics = (object: GeometryObject): Record<GeometryAnalysisKind, number | undefined> => {
  const sx = Math.abs(numeric(object.transform.scale.x, 1));
  const sy = Math.abs(numeric(object.transform.scale.y, 1));
  const sz = Math.abs(numeric(object.transform.scale.z, 1));
  const distance = Math.hypot(
    numeric(object.transform.position.x),
    numeric(object.transform.position.y),
    numeric(object.transform.position.z)
  );
  let width: number | undefined;
  let height: number | undefined;
  let depth: number | undefined;
  let volume: number | undefined;
  let surfaceArea: number | undefined;
  if (object.type === "box") {
    width = numeric(object.params.width, 1) * sx;
    height = numeric(object.params.height, 1) * sy;
    depth = numeric(object.params.depth, 1) * sz;
    volume = width * height * depth;
    surfaceArea = 2 * (width * height + width * depth + height * depth);
  } else if (object.type === "sphere") {
    const radius = numeric(object.params.radius, 1);
    width = 2 * radius * sx;
    height = 2 * radius * sy;
    depth = 2 * radius * sz;
    const scaledRadius = radius * Math.cbrt(sx * sy * sz);
    volume = (4 / 3) * Math.PI * scaledRadius ** 3;
    surfaceArea = 4 * Math.PI * scaledRadius ** 2;
  } else if (object.type === "cylinder" || object.type === "cone") {
    const top = object.type === "cone" ? 0 : numeric(object.params.radiusTop, 1);
    const bottom = object.type === "cone" ? numeric(object.params.radius, 1) : numeric(object.params.radiusBottom, 1);
    const radius = Math.max(top, bottom);
    const h = numeric(object.params.height, 2);
    width = 2 * radius * sx;
    height = h * sy;
    depth = 2 * radius * sz;
    const averageRadialScale = Math.sqrt(sx * sz);
    const rt = top * averageRadialScale;
    const rb = bottom * averageRadialScale;
    const scaledHeight = h * sy;
    volume = (Math.PI * scaledHeight * (rt ** 2 + rt * rb + rb ** 2)) / 3;
    const slant = Math.hypot(rt - rb, scaledHeight);
    surfaceArea = Math.PI * (rt + rb) * slant + Math.PI * (rt ** 2 + rb ** 2);
  } else if (object.type === "torus") {
    const major = numeric(object.params.radius, 1) * Math.sqrt(sx * sz);
    const tube = numeric(object.params.tube, 0.35) * Math.cbrt(sx * sy * sz);
    width = 2 * (major + tube);
    height = 2 * tube;
    depth = 2 * (major + tube);
    volume = 2 * Math.PI ** 2 * major * tube ** 2;
    surfaceArea = 4 * Math.PI ** 2 * major * tube;
  } else if (object.type === "plane" || object.type === "polygon") {
    width = numeric(object.params.width ?? numeric(object.params.radius, 1) * 2, 1) * sx;
    height = numeric(object.params.height ?? numeric(object.params.radius, 1) * 2, 1) * sy;
    depth = 0;
    volume = 0;
    surfaceArea = width * height;
  }
  return {
    volume,
    surfaceArea,
    distance,
    "bounds.width": width,
    "bounds.height": height,
    "bounds.depth": depth,
  };
};

const objectAliases = (objects: GeometryObject[]): Map<string, string | null> => {
  const aliases = new Map<string, string | null>();
  for (const object of objects) {
    for (const alias of [object.id, object.name]) {
      const key = alias.trim().toLowerCase();
      if (!key) continue;
      const current = aliases.get(key);
      aliases.set(key, current === undefined || current === object.id ? object.id : null);
    }
  }
  return aliases;
};

const resolveValueNodeId = (
  reference: string,
  aliases: Map<string, string | null>,
  graph: ConstructionGraph
): string | null => {
  const dot = reference.indexOf(".");
  if (dot <= 0) return null;
  const objectId = aliases.get(reference.slice(0, dot).toLowerCase());
  if (!objectId) return null;
  const path = reference.slice(dot + 1);
  const analysisId = geometryAnalysisNodeId(objectId, path as GeometryAnalysisKind);
  if (graph.nodes.some((node) => node.id === analysisId)) return analysisId;
  const parameterId = `parameter:${objectId}:${path.startsWith("transform.") ? path : `params.${path}`}`;
  return graph.nodes.some((node) => node.id === parameterId) ? parameterId : null;
};

const valueFromNode = (node: ConstructionGraphNode | undefined): number | null => {
  if (!node?.data || typeof node.data !== "object") return null;
  const value = (node.data as { value?: unknown }).value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const parseClaim = (source: string): { left: string; operator: string; right: string } | null => {
  const match = source.trim().replace(/^claim\s+/i, "").match(/^(.+?)\s*(===|==|=|>=|<=|>|<)\s*(.+)$/);
  return match ? { left: match[1].trim(), operator: match[2], right: match[3].trim() } : null;
};

const compare = (left: number, operator: string, right: number): boolean => {
  if (operator === ">" ) return left > right;
  if (operator === "<") return left < right;
  if (operator === ">=") return left >= right;
  if (operator === "<=") return left <= right;
  return Math.abs(left - right) <= Math.max(1e-9, 1e-6 * Math.max(Math.abs(left), Math.abs(right), 1));
};

const evaluateClaimSide = (
  side: string,
  aliases: Map<string, string | null>,
  graph: ConstructionGraph
): { value: number | null; nodeIds: string[] } => {
  const literal = Number(side);
  if (Number.isFinite(literal)) return { value: literal, nodeIds: [] };
  const tokens = side.match(/[A-Za-z_][A-Za-z0-9_.-]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?|[()+\-*/]/gi);
  if (!tokens || tokens.join("").replace(/\s/g, "") !== side.replace(/\s/g, "")) return { value: null, nodeIds: [] };
  const nodeIds = new Set<string>();
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
    const nodeId = resolveValueNodeId(token, aliases, graph);
    if (!nodeId) return null;
    nodeIds.add(nodeId);
    return valueFromNode(graph.nodes.find((node) => node.id === nodeId));
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
  return { value: value != null && index === tokens.length && Number.isFinite(value) ? value : null, nodeIds: Array.from(nodeIds) };
};

export const synchronizeGeometryAnalysisGraph = (
  graph: ConstructionGraph,
  objects: GeometryObject[],
  affectedObjectIds?: Iterable<string>
): ConstructionGraph => {
  const affected = affectedObjectIds ? new Set(affectedObjectIds) : new Set(objects.map((object) => object.id));
  const validObjectIds = new Set(objects.map((object) => object.id));
  const previousById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const affectedAnalysisIds = new Set(
    graph.nodes
      .filter(
        (node) =>
          node.kind === "analysis" &&
          isGeometryAnalysisNodeData(node.data) &&
          (affected.has(node.data.objectId) || !validObjectIds.has(node.data.objectId))
      )
      .map((node) => node.id)
  );
  const nodes = graph.nodes.filter((node) => !affectedAnalysisIds.has(node.id));
  const edges = graph.edges.filter(
    (edge) => !affectedAnalysisIds.has(edge.sourceId) && !affectedAnalysisIds.has(edge.targetId)
  );
  for (const object of objects) {
    if (!affected.has(object.id)) continue;
    const metrics = objectMetrics(object);
    for (const analysis of ANALYSIS_KINDS) {
      const id = geometryAnalysisNodeId(object.id, analysis);
      const value = metrics[analysis];
      nodes.push({
        ...previousById.get(id),
        id,
        kind: "analysis",
        type: analysis,
        label: `${object.name}.${analysis}`,
        status: value == null ? "invalid" : "valid",
        data: {
          objectId: object.id,
          analysis,
          ...(value == null ? { error: "Analysis is unavailable for this geometry type." } : { value }),
        } satisfies GeometryAnalysisNodeData,
      });
      edges.push({
        id: `analyzes:object:${object.id}:${id}`,
        sourceId: `object:${object.id}`,
        targetId: id,
        relation: "analyzes",
      });
    }
  }
  return synchronizeGeometryClaimGraph(createConstructionGraph(nodes, edges), getGeometryClaimSources(graph));
};

export const getGeometryClaimSources = (graph: ConstructionGraph): string[] =>
  graph.nodes
    .flatMap((node) => (node.kind === "claim" && isGeometryClaimNodeData(node.data) ? [node.data.source] : []));

export const synchronizeGeometryClaimGraph = (
  graph: ConstructionGraph,
  sources: string[]
): ConstructionGraph => {
  const objects = graph.nodes
    .filter((node) => node.kind === "geometry" && node.type === "geometry-object")
    .map((node) => node.data as GeometryObject);
  const aliases = objectAliases(objects);
  const baseNodes = graph.nodes.filter((node) => node.kind !== "claim");
  const edges = graph.edges.filter((edge) => !edge.sourceId.startsWith("claim:") && !edge.targetId.startsWith("claim:"));
  const baseGraph = createConstructionGraph(baseNodes, edges);
  const claimNodes: ConstructionGraphNode[] = [];
  sources.map((source) => source.trim()).filter(Boolean).forEach((source, index) => {
    const id = geometryClaimNodeId(index);
    const parsed = parseClaim(source);
    const left = parsed ? evaluateClaimSide(parsed.left, aliases, baseGraph) : { value: null, nodeIds: [] };
    const right = parsed ? evaluateClaimSide(parsed.right, aliases, baseGraph) : { value: null, nodeIds: [] };
    const result: GeometryClaimResult =
      parsed && left.value != null && right.value != null
        ? compare(left.value, parsed.operator, right.value) ? "verified" : "failed"
        : "unresolved";
    claimNodes.push({
      id,
      kind: "claim",
      type: "numeric-claim",
      label: source.replace(/^claim\s+/i, ""),
      status: result === "verified" ? "valid" : result === "failed" ? "invalid" : "broken-source",
      data: {
        source,
        result,
        ...(left.value != null ? { leftValue: left.value } : {}),
        ...(right.value != null ? { rightValue: right.value } : {}),
        ...(result === "unresolved" ? { error: "Claim references could not be resolved." } : {}),
      } satisfies GeometryClaimNodeData,
    });
    for (const sourceId of new Set([...left.nodeIds, ...right.nodeIds])) {
      edges.push({
        id: `verifies:${sourceId}:${id}`,
        sourceId,
        targetId: id,
        relation: "verifies",
      });
    }
  });
  return createConstructionGraph([...baseNodes, ...claimNodes], edges);
};
