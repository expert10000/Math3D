import type {
  AnalysisIdentity,
  AnalysisParameters,
  AnalysisResult,
  AnalysisResultDependency,
  AnalysisResultStore,
} from "../analysis/contracts";
import {
  createAnalysisRegistry,
  getAnalysisDefinition,
  registerAnalysis,
  resolveAnalysisDependencies,
  type AnalysisDefinition,
  type AnalysisRegistry,
} from "../analysis/registry";
import {
  analysisResultKey,
  createAnalysisResultStore,
  getAnalysisResult,
  getAnalysisResultForParameters,
  invalidateAnalysisResult,
  upsertAnalysisResult,
  type UpsertAnalysisResultOptions,
} from "../analysis/resultStore";
import type { GeometryAnalysisSnapshot } from "./analysisBridge";

export type GeometryAnalysisResultKind =
  | "basic-metrics"
  | "topology-summary"
  | "section-analysis"
  | "differential-geometry"
  | "curve-analysis"
  | "surface-analysis"
  | "intrinsic-geometry"
  | "feature-analysis"
  | "diagnostics"
  | "measurement"
  | "sampled-fields"
  | "comparison"
  | "report"
  | (string & {});

export type GeometryAnalysisDomain =
  | "object"
  | "curve"
  | "surface"
  | "intrinsic"
  | "vertex"
  | "edge"
  | "face"
  | "point"
  | "selection"
  | "mixed";

export type GeometryAnalysisIdentity = AnalysisIdentity & {
  sourceObjectId: string;
  snapshotId: string;
};

export type GeometryAnalysisDefinition = AnalysisDefinition<GeometryAnalysisResultKind, GeometryAnalysisDomain>;
export type GeometryAnalysisRegistry = AnalysisRegistry<GeometryAnalysisResultKind, GeometryAnalysisDomain>;
export type GeometryAnalysisResult<TPayload = unknown> = AnalysisResult<TPayload, GeometryAnalysisResultKind, GeometryAnalysisIdentity>;
export type GeometryAnalysisResultState = GeometryAnalysisResult["state"];
export type GeometryAnalysisResultDependency = AnalysisResultDependency<GeometryAnalysisResultKind>;
export type GeometryAnalysisResultStore = AnalysisResultStore<GeometryAnalysisResultKind, GeometryAnalysisIdentity>;

export const DEFAULT_GEOMETRY_ANALYSIS_DEFINITIONS: readonly GeometryAnalysisDefinition[] = [
  { kind: "basic-metrics", label: "Object metrics", family: "geometry-measurement", domain: "object" },
  { kind: "topology-summary", label: "Object topology summary", family: "geometry-topology", domain: "object" },
  { kind: "section-analysis", label: "Section measurement", family: "geometry-measurement", domain: "curve" },
  { kind: "differential-geometry", label: "Differential geometry handoff", family: "geometry-differential", domain: "surface" },
  { kind: "curve-analysis", label: "Curve analysis", family: "geometry-curve", domain: "curve" },
  { kind: "surface-analysis", label: "Surface analysis", family: "geometry-surface", domain: "surface" },
  { kind: "intrinsic-geometry", label: "Intrinsic geometry", family: "geometry-intrinsic", domain: "intrinsic" },
  { kind: "feature-analysis", label: "Feature analysis", family: "geometry-features", domain: "selection" },
  { kind: "diagnostics", label: "Geometry diagnostics", family: "geometry-diagnostics", domain: "object" },
  { kind: "measurement", label: "Geometry measurement", family: "geometry-measurement", domain: "selection" },
  { kind: "sampled-fields", label: "Sampled fields", family: "geometry-sampling", domain: "surface" },
  { kind: "comparison", label: "Geometry comparison", family: "geometry-comparison", domain: "mixed" },
  { kind: "report", label: "Geometry report", family: "geometry-report", domain: "object" },
];

export const createGeometryAnalysisIdentity = (
  snapshot: GeometryAnalysisSnapshot,
  sourceRevision: number | string = snapshot.id
): GeometryAnalysisIdentity => ({
  sourceObjectId: snapshot.sourceObjectId,
  snapshotId: snapshot.id,
  revision: String(sourceRevision),
  key: `geometry:${snapshot.sourceObjectId}@${String(sourceRevision)}`,
  label: snapshot.sourceObjectName,
  sourceLabel: `Geometry object ${snapshot.sourceObjectName}`,
});

export const createGeometryAnalysisRegistry = (
  definitions: readonly GeometryAnalysisDefinition[] = DEFAULT_GEOMETRY_ANALYSIS_DEFINITIONS
): GeometryAnalysisRegistry => createAnalysisRegistry(definitions, "Geometry analysis");

export const registerGeometryAnalysis = (
  registry: GeometryAnalysisRegistry,
  definition: GeometryAnalysisDefinition
): GeometryAnalysisRegistry => registerAnalysis(registry, definition, "Geometry analysis");

export const getGeometryAnalysisDefinition = (
  registry: GeometryAnalysisRegistry,
  kind: GeometryAnalysisResultKind,
  variant = "default"
): GeometryAnalysisDefinition | null => getAnalysisDefinition(registry, kind, variant);

export const resolveGeometryAnalysisDependencies = (
  registry: GeometryAnalysisRegistry,
  store: GeometryAnalysisResultStore,
  identity: GeometryAnalysisIdentity,
  kind: GeometryAnalysisResultKind,
  variant = "default"
): GeometryAnalysisResultDependency[] => resolveAnalysisDependencies(
  registry,
  store,
  identity,
  kind,
  variant
);

export const createGeometryAnalysisResultStore = (): GeometryAnalysisResultStore =>
  createAnalysisResultStore<GeometryAnalysisResultKind, GeometryAnalysisIdentity>();

export const upsertGeometryAnalysisResult = <TPayload>(
  store: GeometryAnalysisResultStore,
  options: Omit<UpsertAnalysisResultOptions<TPayload, GeometryAnalysisResultKind, GeometryAnalysisIdentity>, "identity"> & {
    identity: GeometryAnalysisIdentity;
  }
): GeometryAnalysisResultStore => upsertAnalysisResult(store, options, {
  lineageKey: (identity) => identity.sourceObjectId,
  defaultBackend: "Geometry analytical core",
});

export const getGeometryAnalysisResult = <TPayload = unknown>(
  store: GeometryAnalysisResultStore,
  identity: GeometryAnalysisIdentity | null | undefined,
  kind: GeometryAnalysisResultKind,
  variant = "default"
): GeometryAnalysisResult<TPayload> | null =>
  getAnalysisResult<TPayload, GeometryAnalysisResultKind, GeometryAnalysisIdentity>(store, identity, kind, variant);

export const getGeometryAnalysisResultForParameters = <TPayload = unknown>(
  store: GeometryAnalysisResultStore,
  identity: GeometryAnalysisIdentity | null | undefined,
  kind: GeometryAnalysisResultKind,
  parameters: AnalysisParameters,
  variant = "default"
): GeometryAnalysisResult<TPayload> | null =>
  getAnalysisResultForParameters<TPayload, GeometryAnalysisResultKind, GeometryAnalysisIdentity>(
    store,
    identity,
    kind,
    parameters,
    variant
  );

export const geometryAnalysisResultKey = (
  identity: GeometryAnalysisIdentity,
  kind: GeometryAnalysisResultKind,
  variant = "default"
): string => analysisResultKey(identity, kind, variant);

export const invalidateGeometryAnalysisResult = (
  store: GeometryAnalysisResultStore,
  identity: GeometryAnalysisIdentity,
  kind: GeometryAnalysisResultKind,
  variant = "default",
  now = Date.now()
): GeometryAnalysisResultStore => invalidateAnalysisResult(store, identity, kind, variant, now);
