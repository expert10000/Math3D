import type { UnifiedSelectionKind } from "../selection/unifiedSelection";
import { GeometryMeshTraceMap, type GeometryElementRef, type GeometryMeshTraceMapSnapshot, type MeshElementRef } from "./geometryMeshTraceMap";

export type GeometryRelationSourceKind =
  | "procedural-object"
  | "dataset-object"
  | "analytic-curve"
  | "analytic-surface"
  | "trim"
  | "shell"
  | "solid";

export type GeometryMeshRelationRole = "display-tessellation" | "derived-analysis-mesh" | "saved-derived-mesh";
export type GeometryMeshRelationStatus = "current" | "stale" | "broken";
export type GeometryMeshMappingConfidence = "exact" | "heuristic" | "partial" | "unavailable";
export type GeometryNormalStrategy = "analytic" | "angle-weighted" | "area-weighted" | "face";

export type GeometryTessellationPreset = {
  id: string;
  label: string;
  chordTolerance: number;
  angularTolerance: number;
  maximumEdgeLength: number;
  parameterDensity: number;
  normalStrategy: GeometryNormalStrategy;
  welding: boolean;
  weldTolerance: number;
  preserveBoundaries: boolean;
};

export const DEFAULT_GEOMETRY_TESSELLATION_PRESET: GeometryTessellationPreset = {
  id: "balanced",
  label: "Balanced analysis",
  chordTolerance: 0.01,
  angularTolerance: Math.PI / 18,
  maximumEdgeLength: 0.25,
  parameterDensity: 32,
  normalStrategy: "analytic",
  welding: true,
  weldTolerance: 1e-6,
  preserveBoundaries: true,
};

export const GEOMETRY_TESSELLATION_PRESETS: readonly GeometryTessellationPreset[] = [
  { ...DEFAULT_GEOMETRY_TESSELLATION_PRESET },
  { ...DEFAULT_GEOMETRY_TESSELLATION_PRESET, id: "preview", label: "Fast preview", chordTolerance: 0.05, angularTolerance: Math.PI / 9, maximumEdgeLength: 0.75, parameterDensity: 16, normalStrategy: "angle-weighted" },
  { ...DEFAULT_GEOMETRY_TESSELLATION_PRESET, id: "fine", label: "Fine analysis", chordTolerance: 0.0025, angularTolerance: Math.PI / 36, maximumEdgeLength: 0.1, parameterDensity: 64, weldTolerance: 1e-7 },
];

export type GeometryMeshNavigationContext = {
  module: "geometry" | "mesh";
  selectionKind: UnifiedSelectionKind;
  selectedIndices: number[];
  cameraTarget?: readonly [number, number, number] | null;
  cameraPosition?: readonly [number, number, number] | null;
};

export type GeometryMeshRegeneration = {
  id: string;
  at: number;
  previousMeshId: string;
  nextMeshId: string;
  previousSourceRevision: number;
  nextSourceRevision: number;
  presetId: string;
};

export type GeometryMeshRelation = {
  id: string;
  sourceGeometryId: string;
  sourceKind: GeometryRelationSourceKind;
  meshId: string;
  role: GeometryMeshRelationRole;
  ephemeral: boolean;
  sourceRevision: number;
  tessellationPreset: GeometryTessellationPreset;
  traceMap: GeometryMeshTraceMapSnapshot | null;
  status: GeometryMeshRelationStatus;
  createdAt: number;
  updatedAt: number;
  regenerationHistory: GeometryMeshRegeneration[];
  comparisonTargetIds: string[];
  geometryContext: GeometryMeshNavigationContext | null;
  meshContext: GeometryMeshNavigationContext | null;
};

export type GeometryMeshRelationStore = {
  version: 1;
  relations: Record<string, GeometryMeshRelation>;
};

export type GeometryMeshSelectionMapping = {
  direction: "geometry-to-mesh" | "mesh-to-geometry";
  sourceKind: "object" | "face" | "edge" | "vertex";
  sourceIndices: number[];
  targetIndices: number[];
  confidence: GeometryMeshMappingConfidence;
  matched: number;
  total: number;
  reason: string;
};

export const createGeometryMeshRelationStore = (): GeometryMeshRelationStore => ({ version: 1, relations: {} });

const safePositive = (value: number, fallback: number): number => Number.isFinite(value) && value > 0 ? value : fallback;

export const normalizeGeometryTessellationPreset = (
  preset: Partial<GeometryTessellationPreset> | null | undefined
): GeometryTessellationPreset => ({
  ...DEFAULT_GEOMETRY_TESSELLATION_PRESET,
  ...preset,
  id: preset?.id?.trim() || DEFAULT_GEOMETRY_TESSELLATION_PRESET.id,
  label: preset?.label?.trim() || DEFAULT_GEOMETRY_TESSELLATION_PRESET.label,
  chordTolerance: safePositive(Number(preset?.chordTolerance), DEFAULT_GEOMETRY_TESSELLATION_PRESET.chordTolerance),
  angularTolerance: safePositive(Number(preset?.angularTolerance), DEFAULT_GEOMETRY_TESSELLATION_PRESET.angularTolerance),
  maximumEdgeLength: safePositive(Number(preset?.maximumEdgeLength), DEFAULT_GEOMETRY_TESSELLATION_PRESET.maximumEdgeLength),
  parameterDensity: Math.max(2, Math.round(safePositive(Number(preset?.parameterDensity), DEFAULT_GEOMETRY_TESSELLATION_PRESET.parameterDensity))),
  weldTolerance: safePositive(Number(preset?.weldTolerance), DEFAULT_GEOMETRY_TESSELLATION_PRESET.weldTolerance),
  normalStrategy: preset?.normalStrategy ?? DEFAULT_GEOMETRY_TESSELLATION_PRESET.normalStrategy,
  welding: preset?.welding ?? DEFAULT_GEOMETRY_TESSELLATION_PRESET.welding,
  preserveBoundaries: preset?.preserveBoundaries ?? DEFAULT_GEOMETRY_TESSELLATION_PRESET.preserveBoundaries,
});

export const createGeometryMeshRelation = (args: {
  id?: string;
  sourceGeometryId: string;
  sourceKind?: GeometryRelationSourceKind;
  meshId: string;
  role: GeometryMeshRelationRole;
  sourceRevision: number;
  tessellationPreset?: Partial<GeometryTessellationPreset> | null;
  traceMap?: GeometryMeshTraceMapSnapshot | null;
  comparisonTargetIds?: string[];
  now?: number;
}): GeometryMeshRelation => {
  const now = args.now ?? Date.now();
  return {
    id: args.id ?? `geometry-mesh:${args.sourceGeometryId}:${args.meshId}`,
    sourceGeometryId: args.sourceGeometryId,
    sourceKind: args.sourceKind ?? "procedural-object",
    meshId: args.meshId,
    role: args.role,
    ephemeral: args.role === "display-tessellation",
    sourceRevision: Math.max(0, Math.floor(args.sourceRevision)),
    tessellationPreset: normalizeGeometryTessellationPreset(args.tessellationPreset),
    traceMap: args.traceMap ?? null,
    status: "current",
    createdAt: now,
    updatedAt: now,
    regenerationHistory: [],
    comparisonTargetIds: [...new Set(args.comparisonTargetIds ?? [])],
    geometryContext: null,
    meshContext: null,
  };
};

export const upsertGeometryMeshRelation = (
  store: GeometryMeshRelationStore,
  relation: GeometryMeshRelation
): GeometryMeshRelationStore => ({
  version: 1,
  relations: { ...store.relations, [relation.id]: relation },
});

export const markGeometryMeshRelationsStale = (
  store: GeometryMeshRelationStore,
  sourceGeometryId: string,
  currentRevision: number,
  now = Date.now()
): GeometryMeshRelationStore => ({
  version: 1,
  relations: Object.fromEntries(Object.entries(store.relations).map(([id, relation]) => [id,
    relation.sourceGeometryId === sourceGeometryId && relation.sourceRevision !== currentRevision
      ? { ...relation, status: "stale" as const, updatedAt: now }
      : relation
  ])),
});

export const regenerateGeometryMeshRelation = (
  relation: GeometryMeshRelation,
  args: {
    nextMeshId: string;
    nextSourceRevision: number;
    traceMap?: GeometryMeshTraceMapSnapshot | null;
    tessellationPreset?: Partial<GeometryTessellationPreset> | null;
    now?: number;
  }
): GeometryMeshRelation => {
  const now = args.now ?? Date.now();
  const preset = normalizeGeometryTessellationPreset(args.tessellationPreset ?? relation.tessellationPreset);
  const regeneration: GeometryMeshRegeneration = {
    id: `${relation.id}:regen:${now}`,
    at: now,
    previousMeshId: relation.meshId,
    nextMeshId: args.nextMeshId,
    previousSourceRevision: relation.sourceRevision,
    nextSourceRevision: Math.max(0, Math.floor(args.nextSourceRevision)),
    presetId: preset.id,
  };
  return {
    ...relation,
    meshId: args.nextMeshId,
    sourceRevision: regeneration.nextSourceRevision,
    tessellationPreset: preset,
    traceMap: args.traceMap ?? relation.traceMap,
    status: "current",
    updatedAt: now,
    regenerationHistory: [regeneration, ...relation.regenerationHistory].slice(0, 32),
  };
};

export const updateGeometryMeshNavigationContext = (
  relation: GeometryMeshRelation,
  context: GeometryMeshNavigationContext
): GeometryMeshRelation => ({
  ...relation,
  geometryContext: context.module === "geometry" ? context : relation.geometryContext,
  meshContext: context.module === "mesh" ? context : relation.meshContext,
  updatedAt: Date.now(),
});

const selectionKind = (kind: UnifiedSelectionKind): "object" | "face" | "edge" | "vertex" =>
  kind === "face" || kind === "edge" || kind === "vertex" ? kind : "object";

export const mapGeometryMeshSelection = (args: {
  relation: GeometryMeshRelation;
  direction: "geometry-to-mesh" | "mesh-to-geometry";
  kind: UnifiedSelectionKind;
  indices?: number[];
}): GeometryMeshSelectionMapping => {
  const kind = selectionKind(args.kind);
  const sourceIndices = kind === "object" ? [] : [...new Set(args.indices ?? [])].filter((index) => Number.isInteger(index) && index >= 0);
  const trace = GeometryMeshTraceMap.fromSnapshot(args.relation.traceMap);
  const targetIndices = new Set<number>();
  let matched = 0;
  if (kind === "object") {
    const refs = args.direction === "geometry-to-mesh"
      ? trace.getMeshFromGeometry({ geometryId: args.relation.sourceGeometryId, kind: "object" })
      : trace.getGeometryFromMesh({ meshId: args.relation.meshId, kind: "object" });
    matched = refs.length ? 1 : 0;
  } else {
    for (const index of sourceIndices) {
      const refs = args.direction === "geometry-to-mesh"
        ? trace.getMeshFromGeometry({ geometryId: args.relation.sourceGeometryId, kind, index } as GeometryElementRef)
        : trace.getGeometryFromMesh({ meshId: args.relation.meshId, kind, index } as MeshElementRef);
      if (refs.length) matched += 1;
      for (const ref of refs) if (ref.index != null) targetIndices.add(ref.index);
    }
  }
  const total = kind === "object" ? 1 : sourceIndices.length;
  const mappingHints = args.relation.traceMap
    ? Object.values(args.relation.traceMap.provenanceByMesh).flat().map((entry) => entry.params?.strategy).filter(Boolean)
    : [];
  const heuristic = mappingHints.some((entry) => entry === "topology-signature-heuristic");
  const confidence: GeometryMeshMappingConfidence = matched === 0 || total === 0
    ? "unavailable"
    : matched < total
      ? "partial"
      : heuristic
        ? "heuristic"
        : "exact";
  return {
    direction: args.direction,
    sourceKind: kind,
    sourceIndices,
    targetIndices: [...targetIndices].sort((a, b) => a - b),
    confidence,
    matched,
    total,
    reason: confidence === "exact"
      ? "Trace map preserves exact semantic identity."
      : confidence === "heuristic"
        ? "Topology-signature correspondence was used after mesh mutation."
        : confidence === "partial"
          ? `${matched} of ${total} selected entities have trace correspondence.`
          : "No semantic trace correspondence is available for this selection.",
  };
};

let GLOBAL_GEOMETRY_MESH_RELATION_STORE = createGeometryMeshRelationStore();

export const getGlobalGeometryMeshRelationStore = (): GeometryMeshRelationStore => GLOBAL_GEOMETRY_MESH_RELATION_STORE;
export const resetGlobalGeometryMeshRelationStore = (): void => { GLOBAL_GEOMETRY_MESH_RELATION_STORE = createGeometryMeshRelationStore(); };
export const registerGlobalGeometryMeshRelation = (relation: GeometryMeshRelation): void => {
  GLOBAL_GEOMETRY_MESH_RELATION_STORE = upsertGeometryMeshRelation(GLOBAL_GEOMETRY_MESH_RELATION_STORE, relation);
};

export const findGeometryMeshRelations = (args: { sourceGeometryId?: string; meshId?: string; includeEphemeral?: boolean }): GeometryMeshRelation[] =>
  Object.values(GLOBAL_GEOMETRY_MESH_RELATION_STORE.relations)
    .filter((relation) => args.sourceGeometryId == null || relation.sourceGeometryId === args.sourceGeometryId)
    .filter((relation) => args.meshId == null || relation.meshId === args.meshId)
    .filter((relation) => args.includeEphemeral !== false || !relation.ephemeral)
    .sort((left, right) => right.updatedAt - left.updatedAt);
