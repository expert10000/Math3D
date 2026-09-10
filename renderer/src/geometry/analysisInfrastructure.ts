import type {
  AnalysisIdentity,
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
  createAnalysisResultStore,
  getAnalysisResult,
  invalidateAnalysisResult,
  upsertAnalysisResult,
  type UpsertAnalysisResultOptions,
} from "../analysis/resultStore";
import type { GeometryAnalysisSnapshot } from "./analysisBridge";

export type GeometryAnalysisResultKind =
  | "basic-metrics"
  | "topology-summary"
  | (string & {});

export type GeometryAnalysisIdentity = AnalysisIdentity & {
  sourceObjectId: string;
  snapshotId: string;
};

export type GeometryAnalysisDefinition = AnalysisDefinition<GeometryAnalysisResultKind>;
export type GeometryAnalysisRegistry = AnalysisRegistry<GeometryAnalysisResultKind>;
export type GeometryAnalysisResult<TPayload = unknown> = AnalysisResult<TPayload, GeometryAnalysisResultKind, GeometryAnalysisIdentity>;
export type GeometryAnalysisResultDependency = AnalysisResultDependency<GeometryAnalysisResultKind>;
export type GeometryAnalysisResultStore = AnalysisResultStore<GeometryAnalysisResultKind, GeometryAnalysisIdentity>;

export const DEFAULT_GEOMETRY_ANALYSIS_DEFINITIONS: readonly GeometryAnalysisDefinition[] = [
  { kind: "basic-metrics", label: "Object metrics", family: "geometry-measurement", domain: "object" },
  { kind: "topology-summary", label: "Object topology summary", family: "geometry-topology", domain: "object" },
];

export const createGeometryAnalysisIdentity = (snapshot: GeometryAnalysisSnapshot): GeometryAnalysisIdentity => ({
  sourceObjectId: snapshot.sourceObjectId,
  snapshotId: snapshot.id,
  revision: snapshot.id,
  key: `geometry:${snapshot.sourceObjectId}@${snapshot.id}`,
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

export const invalidateGeometryAnalysisResult = (
  store: GeometryAnalysisResultStore,
  identity: GeometryAnalysisIdentity,
  kind: GeometryAnalysisResultKind,
  variant = "default",
  now = Date.now()
): GeometryAnalysisResultStore => invalidateAnalysisResult(store, identity, kind, variant, now);
