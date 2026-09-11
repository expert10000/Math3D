import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { unifiedSelectionFromMeshTopology, type UnifiedSelection } from "../selection/unifiedSelection";
import type { SceneEntityIdentity } from "../scene/sceneIdentity";

export type GeometrySemanticEntityKind =
  | "body"
  | "shell"
  | "surface"
  | "curve"
  | "point"
  | "feature"
  | "trim-loop"
  | "parameter-location"
  | "construction-role";

export type GeometrySemanticCategory = "curve" | "surface" | "solid" | "construction" | "point";

export type GeometrySemanticFilterKey =
  | "curves"
  | "surfaces"
  | "solids"
  | "construction"
  | "hidden"
  | "derived"
  | "trimBoundaries";

export type GeometrySemanticFilter = Readonly<Record<GeometrySemanticFilterKey, boolean>>;

export const DEFAULT_GEOMETRY_SEMANTIC_FILTER: GeometrySemanticFilter = {
  curves: true,
  surfaces: true,
  solids: true,
  construction: true,
  hidden: false,
  derived: true,
  trimBoundaries: true,
};

export type GeometrySemanticAliases = Partial<Record<GeometrySemanticEntityKind, string>>;

export type GeometrySemanticSelection = {
  readonly id: string;
  readonly sceneEntityId: string;
  readonly sourceRevision: number;
  readonly objectId: string;
  readonly objectLabel: string;
  readonly kind: GeometrySemanticEntityKind;
  readonly category: GeometrySemanticCategory;
  readonly localId: string;
  readonly label: string;
  readonly aliases: GeometrySemanticAliases;
  readonly hidden: boolean;
  readonly derived: boolean;
  readonly trimBoundary: boolean;
  readonly constructionRole: string | null;
};

export type GeometrySemanticCandidate = GeometrySemanticSelection & {
  readonly objectType: string;
  readonly parentSceneEntityId: string | null;
  readonly sourceSceneEntityIds: readonly string[];
  readonly dependencySceneEntityIds: readonly string[];
  readonly position: readonly [number, number, number];
  readonly axis: readonly [number, number, number] | null;
  readonly planeNormal: readonly [number, number, number] | null;
  readonly radius: number | null;
  readonly surfaceType: string | null;
};

export type GeometrySemanticSelector =
  | "tangent"
  | "g0-connected"
  | "g1-connected"
  | "same-radius"
  | "coplanar"
  | "coaxial"
  | "same-surface-type"
  | "trim-loops";

export type GeometrySemanticNavigationCommand =
  | "frame"
  | "isolate"
  | "hide-others"
  | "parent"
  | "child"
  | "connected"
  | "loop"
  | "chain"
  | "similar"
  | "source"
  | "derivative";

const SOLID_TYPES = new Set(["sphere", "box", "cylinder", "cone", "torus", "polyhedron", "mesh"]);
const SURFACE_TYPES = new Set(["plane", "polygon"]);
const AXIAL_TYPES = new Set(["cylinder", "cone", "torus"]);

export const resolveGeometrySemanticObjectType = (
  objectType: string,
  params?: Readonly<Record<string, unknown>>
): string => {
  if (objectType !== "constructed") return objectType;
  const constructionKind = String(params?.constructionKind ?? params?.kind ?? "").trim();
  return constructionKind || objectType;
};

const encode = (value: string | number): string => encodeURIComponent(String(value));

export const geometrySemanticEntityId = (
  sceneEntityId: string,
  kind: GeometrySemanticEntityKind,
  localId: string | number
): string => ["geometry-semantic-v1", sceneEntityId, kind, localId].map(encode).join(":");

const categoryFor = (kind: GeometrySemanticEntityKind, objectType: string, constructionRole: string | null) => {
  if (constructionRole) return "construction" as const;
  if (kind === "curve" || kind === "trim-loop") return "curve" as const;
  if (kind === "surface" || SURFACE_TYPES.has(objectType)) return "surface" as const;
  if (kind === "point" || kind === "parameter-location") return "point" as const;
  return "solid" as const;
};

const primaryKindFor = (
  selection: UnifiedSelection,
  objectType: string,
  constructionRole: string | null
): GeometrySemanticEntityKind => {
  if (constructionRole && selection.selectionType === "object") return "construction-role";
  if (selection.selectionType === "face") return "surface";
  if (selection.selectionType === "edge") return selection.topologyFlags.boundary ? "trim-loop" : "curve";
  if (selection.selectionType === "vertex") return "point";
  if (SOLID_TYPES.has(objectType) || objectType.startsWith("solid-")) return "body";
  if (objectType.startsWith("curve-")) return "curve";
  return "surface";
};

const selectionLocalId = (selection: UnifiedSelection): string => {
  if (selection.selectionType === "face") return `face-${selection.faceId ?? "unknown"}`;
  if (selection.selectionType === "edge") return `edge-${selection.edgeId ?? "unknown"}`;
  if (selection.selectionType === "vertex") return `vertex-${selection.vertexId ?? "unknown"}`;
  return "root";
};

export const buildGeometrySemanticSelection = (input: {
  selection: UnifiedSelection | null | undefined;
  sceneIdentity: SceneEntityIdentity | null | undefined;
  visible?: boolean;
  objectType?: string | null;
  constructionRole?: string | null;
}): GeometrySemanticSelection | null => {
  const selection = input.selection;
  const identity = input.sceneIdentity;
  if (!selection || !identity || identity.moduleKind !== "geometry") return null;
  const objectType = input.objectType ?? selection.objectType ?? String(identity.metadata.objectType ?? "mesh");
  const constructionRole = input.constructionRole?.trim() || null;
  const kind = primaryKindFor(selection, objectType, constructionRole);
  const localId = selectionLocalId(selection);
  const alias = (aliasKind: GeometrySemanticEntityKind, aliasLocalId = localId) =>
    geometrySemanticEntityId(identity.id, aliasKind, aliasLocalId);
  const aliases: GeometrySemanticAliases = {
    [kind]: alias(kind),
    feature: alias("feature", `${selection.selectionType}-${localId}`),
  };
  if (SOLID_TYPES.has(objectType) || objectType.startsWith("solid-")) {
    aliases.body = alias("body", "body-0");
    aliases.shell = alias("shell", "shell-0");
  }
  if (selection.selectionType === "face" || SURFACE_TYPES.has(objectType)) {
    aliases.surface = alias("surface");
  }
  if (selection.selectionType === "edge") aliases.curve = alias("curve");
  if (selection.selectionType === "vertex") aliases.point = alias("point");
  if (selection.topologyFlags.boundary) aliases["trim-loop"] = alias("trim-loop", `boundary-${localId}`);
  if (selection.localPosition || selection.point) {
    aliases["parameter-location"] = alias("parameter-location", `at-${localId}`);
  }
  if (constructionRole) aliases["construction-role"] = alias("construction-role", constructionRole);
  return {
    id: aliases[kind] ?? alias(kind),
    sceneEntityId: identity.id,
    sourceRevision: identity.revision,
    objectId: selection.objectId,
    objectLabel: selection.objectLabel,
    kind,
    category: categoryFor(kind, objectType, constructionRole),
    localId,
    label: `${selection.objectLabel} ${kind.replaceAll("-", " ")}`,
    aliases,
    hidden: input.visible === false,
    derived: identity.sourceKind === "derived" || identity.derivedFromIds.length > 0,
    trimBoundary: Boolean(selection.topologyFlags.boundary),
    constructionRole,
  };
};

const numberParam = (params: Readonly<Record<string, unknown>>, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = Number(params[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const vec3 = (value: unknown, fallback: readonly [number, number, number]): readonly [number, number, number] => {
  if (!value || typeof value !== "object") return fallback;
  const point = value as { x?: unknown; y?: unknown; z?: unknown };
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : fallback;
};

export const buildGeometrySemanticCandidate = (input: {
  selection: GeometrySemanticSelection;
  identity: SceneEntityIdentity;
  objectType: string;
  params?: Readonly<Record<string, unknown>>;
  position?: unknown;
}): GeometrySemanticCandidate => {
  const params = input.params ?? {};
  const type = input.objectType;
  const axis = AXIAL_TYPES.has(type) ? ([0, 0, 1] as const) : null;
  const planeNormal = type === "plane" || type === "polygon" ? ([0, 0, 1] as const) : null;
  return {
    ...input.selection,
    objectType: type,
    parentSceneEntityId: input.identity.parentId,
    sourceSceneEntityIds: input.identity.derivedFromIds,
    dependencySceneEntityIds: input.identity.dependencyIds,
    position: vec3(input.position, [0, 0, 0]),
    axis,
    planeNormal,
    radius: numberParam(params, ["radius", "r", "majorRadius", "baseRadius"]),
    surfaceType: type || null,
  };
};

export const evaluateGeometrySemanticFilter = (
  candidate: GeometrySemanticSelection,
  filter: GeometrySemanticFilter
): { accepted: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  if (candidate.category === "curve" && !filter.curves) reasons.push("Curves are filtered out");
  if (candidate.category === "surface" && !filter.surfaces) reasons.push("Surfaces are filtered out");
  if (candidate.category === "solid" && !filter.solids) reasons.push("Solids are filtered out");
  if (candidate.category === "construction" && !filter.construction) reasons.push("Construction is filtered out");
  if (candidate.hidden && !filter.hidden) reasons.push("Hidden entities are filtered out");
  if (candidate.derived && !filter.derived) reasons.push("Derived entities are filtered out");
  if (candidate.trimBoundary && !filter.trimBoundaries) reasons.push("Trim boundaries are filtered out");
  return { accepted: reasons.length === 0, reasons };
};

const subtract = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as const;
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: readonly number[]) => Math.hypot(a[0], a[1], a[2]);
const cross = (a: readonly number[], b: readonly number[]) =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] as const;
const parallel = (a: readonly number[] | null, b: readonly number[] | null, tolerance: number) =>
  Boolean(a && b && length(cross(a, b)) <= tolerance * Math.max(1, length(a), length(b)));

const relationshipSet = (candidate: GeometrySemanticCandidate): Set<string> =>
  new Set(
    [candidate.sceneEntityId, candidate.parentSceneEntityId, ...candidate.sourceSceneEntityIds, ...candidate.dependencySceneEntityIds].filter(
      (id): id is string => Boolean(id)
    )
  );

const related = (a: GeometrySemanticCandidate, b: GeometrySemanticCandidate): boolean => {
  if (a.sceneEntityId === b.sceneEntityId) return true;
  const aRelations = relationshipSet(a);
  return [...relationshipSet(b)].some((id) => aRelations.has(id));
};

export const selectGeometrySemanticCandidates = (input: {
  seed: GeometrySemanticCandidate;
  candidates: readonly GeometrySemanticCandidate[];
  selector: GeometrySemanticSelector;
  filter?: GeometrySemanticFilter;
  tolerance?: number;
}): GeometrySemanticCandidate[] => {
  const tolerance = Math.max(1e-9, input.tolerance ?? 1e-5);
  const candidates = input.candidates.filter(
    (candidate) => !input.filter || evaluateGeometrySemanticFilter(candidate, input.filter).accepted
  );
  const seed = input.seed;
  return candidates.filter((candidate) => {
    if (input.selector === "same-radius") {
      return seed.radius != null && candidate.radius != null && Math.abs(seed.radius - candidate.radius) <= tolerance;
    }
    if (input.selector === "same-surface-type") return Boolean(seed.surfaceType && seed.surfaceType === candidate.surfaceType);
    if (input.selector === "trim-loops") return candidate.trimBoundary && candidate.objectId === seed.objectId;
    if (input.selector === "coplanar") {
      return (
        parallel(seed.planeNormal, candidate.planeNormal, tolerance) &&
        seed.planeNormal != null &&
        Math.abs(dot(seed.planeNormal, subtract(candidate.position, seed.position))) <= tolerance
      );
    }
    if (input.selector === "coaxial") {
      return (
        parallel(seed.axis, candidate.axis, tolerance) &&
        seed.axis != null &&
        length(cross(subtract(candidate.position, seed.position), seed.axis)) <= tolerance
      );
    }
    if (input.selector === "g0-connected") return related(seed, candidate);
    if (input.selector === "g1-connected" || input.selector === "tangent") {
      return related(seed, candidate) && (parallel(seed.axis, candidate.axis, tolerance) || parallel(seed.planeNormal, candidate.planeNormal, tolerance));
    }
    return false;
  });
};

export const resolveGeometrySemanticNavigation = (input: {
  seed: GeometrySemanticCandidate;
  candidates: readonly GeometrySemanticCandidate[];
  command: GeometrySemanticNavigationCommand;
}): GeometrySemanticCandidate[] => {
  const { seed, candidates, command } = input;
  if (command === "frame" || command === "isolate" || command === "hide-others") return [seed];
  if (command === "parent") return candidates.filter((item) => item.sceneEntityId === seed.parentSceneEntityId);
  if (command === "child") return candidates.filter((item) => item.parentSceneEntityId === seed.sceneEntityId);
  if (command === "source") return candidates.filter((item) => seed.sourceSceneEntityIds.includes(item.sceneEntityId));
  if (command === "derivative") return candidates.filter((item) => item.sourceSceneEntityIds.includes(seed.sceneEntityId));
  if (command === "loop") return candidates.filter((item) => item.objectId === seed.objectId && item.trimBoundary);
  if (command === "chain") return candidates.filter((item) => item.category === "curve" && related(seed, item));
  if (command === "similar") {
    return selectGeometrySemanticCandidates({ seed, candidates, selector: "same-surface-type" });
  }
  return candidates.filter((item) => related(seed, item));
};

export const attachGeometrySemanticSelection = (
  selection: UnifiedSelection,
  semantic: GeometrySemanticSelection
): UnifiedSelection => ({
  ...selection,
  sceneEntityId: semantic.sceneEntityId,
  sourceRevision: semantic.sourceRevision,
  semanticEntityId: semantic.id,
  semanticKind: semantic.kind,
  semanticAliasIds: semantic.aliases,
});

export const mapGeometrySemanticSelectionToMesh = (input: {
  selection: UnifiedSelection | null | undefined;
  meshObjectId: string;
  meshLabel: string;
  mesh?: SurfaceMeshData | null;
  meshSceneEntityId?: string | null;
  topologyVersion?: number | null;
}): UnifiedSelection | null => {
  const source = input.selection;
  if (!source || source.workspace !== "geometry") return null;
  const mapped = unifiedSelectionFromMeshTopology({
    mode: source.selectionType,
    objectId: input.meshObjectId,
    objectLabel: input.meshLabel,
    objectType: "mesh",
    meshKey: input.meshObjectId,
    mesh: input.mesh ?? null,
    topologyVersion: input.topologyVersion ?? source.topologyVersion,
    faceIndex: source.faceId,
    edgeVertices: source.edgeVertices,
    vertexIndex: source.vertexId,
    worldPosition: source.worldPosition,
    normal: source.normal,
    valid: true,
    sceneEntityId: input.meshSceneEntityId ?? null,
    sourceSceneEntityId: source.sceneEntityId ?? null,
    sourceRevision: source.sourceRevision ?? source.topologyVersion,
  });
  if (!mapped) return null;
  return {
    ...mapped,
    semanticEntityId: source.semanticEntityId ?? null,
    semanticKind: source.semanticKind ?? null,
    semanticAliasIds: source.semanticAliasIds,
  };
};
