import type { SceneEntityIdentity, SceneMetadataValue, SceneSourceKind } from "../scene/sceneIdentity";

export type GeometryRevisionCause = "parameter" | "transform" | "topology" | "dependency" | "tessellation" | "metadata";

export type GeometryBoundsMetadata = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

export type GeometryCanonicalMetadata = {
  schema: "geometry-object-metadata-v1";
  revision: number;
  sourceRevision: number | null;
  representation: string;
  sourceKind: SceneSourceKind;
  operation: string;
  primitiveType: string;
  parameterization: string;
  degree: number | null;
  knots: string | null;
  controlCount: number | null;
  trimState: string;
  closed: boolean | null;
  periodic: boolean | null;
  orientation: string;
  bounds: string;
  units: string;
  precision: string;
};

export type GeometryLineageEdgeKind = "construction" | "operation" | "analysis" | "mesh-round-trip" | "dependency";

export type GeometryLineageEdge = {
  sourceId: string;
  targetId: string;
  relation: string;
  kind: GeometryLineageEdgeKind;
};

const finiteNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const booleanValue = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
};

const formatCoordinate = (value: number) => Number(value.toPrecision(8)).toString();

export const formatGeometryBoundsMetadata = (bounds: GeometryBoundsMetadata | null | undefined): string =>
  bounds
    ? `min(${bounds.min.map(formatCoordinate).join(", ")}) · max(${bounds.max.map(formatCoordinate).join(", ")})`
    : "computed from runtime representation";

const normalizeKnots = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    const knots = value.map(finiteNumber).filter((entry): entry is number => entry != null);
    return knots.length ? knots.join(", ") : null;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
};

const isClosedPrimitive = (primitiveType: string): boolean | null => {
  if (["sphere", "box", "cylinder", "cone", "torus", "polyhedron"].includes(primitiveType)) return true;
  if (["plane", "polygon"].includes(primitiveType) || primitiveType.startsWith("surface-")) return false;
  if (primitiveType.startsWith("solid-")) return true;
  return null;
};

export const buildGeometryCanonicalMetadata = (input: {
  objectType: string;
  params?: Readonly<Record<string, unknown>>;
  revision?: number;
  sourceKind?: SceneSourceKind;
  representation?: string | null;
  bounds?: GeometryBoundsMetadata | null;
  vertexCount?: number | null;
  precision?: string | null;
  sourceRevision?: number | null;
  operation?: string | null;
}): GeometryCanonicalMetadata => {
  const params = input.params ?? {};
  const constructionKind = String(params.constructionKind ?? params.kind ?? "").trim();
  const primitiveType = constructionKind || input.objectType;
  const representation = input.representation
    ?? (input.objectType === "mesh" ? "triangle-mesh" : input.objectType === "constructed" ? "sampled-construction" : "parametric-procedural");
  const explicitClosed = booleanValue(params.closed);
  const openEnded = booleanValue(params.openEnded);
  const degree = finiteNumber(params.degree);
  const sourceIds = typeof params.sourceObjectIds === "string"
    ? params.sourceObjectIds.split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  return {
    schema: "geometry-object-metadata-v1",
    revision: Math.max(0, Math.floor(input.revision ?? 0)),
    sourceRevision: input.sourceRevision == null ? null : Math.max(0, Math.floor(input.sourceRevision)),
    representation,
    sourceKind: input.sourceKind ?? (sourceIds.length ? "derived" : "procedural"),
    operation: input.operation?.trim() || String(params.operation ?? params.authoringSource ?? (constructionKind || "create")),
    primitiveType,
    parameterization: String(params.parameterization ?? (constructionKind || input.objectType)),
    degree,
    knots: normalizeKnots(params.knots ?? params.knotVector),
    controlCount: finiteNumber(params.controlCount ?? params.controlPoints ?? input.vertexCount),
    trimState: String(params.trimState ?? (primitiveType.includes("trim") ? "trimmed" : "untrimmed")),
    closed: explicitClosed ?? (openEnded != null ? !openEnded : isClosedPrimitive(primitiveType)),
    periodic: booleanValue(params.periodic),
    orientation: String(params.orientation ?? (isClosedPrimitive(primitiveType) ? "outward" : "parameter-order")),
    bounds: formatGeometryBoundsMetadata(input.bounds),
    units: String(params.units ?? "scene-unit"),
    precision: input.precision ?? String(params.precision ?? (representation === "triangle-mesh" ? "float32 positions" : "float64 parameters / float32 render")),
  };
};

export const geometryCanonicalMetadataToSceneMetadata = (
  metadata: GeometryCanonicalMetadata
): Record<string, SceneMetadataValue> => ({
  metadataSchema: metadata.schema,
  representation: metadata.representation,
  sourceRevision: metadata.sourceRevision,
  operation: metadata.operation,
  primitiveType: metadata.primitiveType,
  parameterization: metadata.parameterization,
  degree: metadata.degree,
  knots: metadata.knots,
  controlCount: metadata.controlCount,
  trimState: metadata.trimState,
  closed: metadata.closed,
  periodic: metadata.periodic,
  orientation: metadata.orientation,
  bounds: metadata.bounds,
  units: metadata.units,
  precision: metadata.precision,
});

export const classifyGeometryRevisionCause = (input: {
  operationType?: string | null;
  changeSummary?: string | null;
  label?: string | null;
}): GeometryRevisionCause => {
  const text = `${input.operationType ?? ""} ${input.changeSummary ?? ""} ${input.label ?? ""}`.toLowerCase();
  if (/topolog|face|edge|vertex|boolean|weld|bevel|collapse|subdivid|extrud|inset/.test(text)) return "topology";
  if (/tessell|segment|sampling|resolution|quality/.test(text)) return "tessellation";
  if (/transform|position|rotation|scale|move|align|mirror/.test(text)) return "transform";
  if (/depend|source|relink|construction|derived|constraint/.test(text)) return "dependency";
  if (/parameter|radius|width|height|depth|degree|knot|offset/.test(text)) return "parameter";
  return "metadata";
};

export const formatGeometryStaleReason = (input: {
  cause: GeometryRevisionCause;
  sourceRevision: number;
  currentRevision: number;
  detail?: string | null;
}): string => {
  const revision = `source revision ${input.sourceRevision} → ${input.currentRevision}`;
  const detail = input.detail?.trim() ? `: ${input.detail.trim()}` : "";
  return `${input.cause} change (${revision})${detail}`;
};

export const classifyGeometryLineageRelation = (relation: string, target?: SceneEntityIdentity | null): GeometryLineageEdgeKind => {
  if (/analyzes|verifies|measured-from|section-of|compared-with/.test(relation)) return "analysis";
  if (target?.metadata.representation === "triangle-mesh" || /mesh|promotion|round-trip/.test(relation)) return "mesh-round-trip";
  if (/operation|history|modified-by/.test(relation)) return "operation";
  if (/derived-from|parameterizes|aligned-to/.test(relation)) return "construction";
  return "dependency";
};

export const buildGeometryIdentityLineage = (identities: readonly SceneEntityIdentity[]): GeometryLineageEdge[] => {
  const identityById = new Map(identities.map((identity) => [identity.id, identity] as const));
  const edges: GeometryLineageEdge[] = [];
  const keys = new Set<string>();
  const add = (sourceId: string, targetId: string, relation: string) => {
    const key = `${sourceId}|${targetId}|${relation}`;
    if (keys.has(key) || sourceId === targetId) return;
    keys.add(key);
    edges.push({
      sourceId,
      targetId,
      relation,
      kind: classifyGeometryLineageRelation(relation, identityById.get(targetId)),
    });
  };
  for (const identity of identities) {
    if (identity.parentId) add(identity.parentId, identity.id, "parent-of");
    for (const sourceId of identity.derivedFromIds) add(sourceId, identity.id, "derived-from");
    for (const dependencyId of identity.dependencyIds) add(dependencyId, identity.id, "depends-on");
  }
  return edges;
};
