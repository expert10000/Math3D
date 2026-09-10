import {
  createAnalysisRegistry,
  getAnalysisDefinition,
  listAnalysisDefinitions,
  registerAnalysis,
  resolveAnalysisDependencies,
  type AnalysisDefinition,
  type AnalysisDependencyDefinition,
  type AnalysisRegistry,
} from "../analysis/registry";
import type {
  MeshAnalysisMeshIdentity,
  MeshAnalysisResultDependency,
  MeshAnalysisResultKind,
  MeshAnalysisResultStore,
} from "./analysisResultStore";

export type MeshAnalysisDomain = "mesh" | "vertex" | "edge" | "face" | "path" | "mixed";
export type MeshAnalysisDependencyDefinition = AnalysisDependencyDefinition<MeshAnalysisResultKind>;
export type MeshAnalysisDefinition = AnalysisDefinition<MeshAnalysisResultKind, MeshAnalysisDomain>;
export type MeshAnalysisRegistry = AnalysisRegistry<MeshAnalysisResultKind, MeshAnalysisDomain>;

export const DEFAULT_MESH_ANALYSIS_DEFINITIONS: readonly MeshAnalysisDefinition[] = [
  { kind: "diagnostics", label: "Mesh diagnostics", family: "topology-integrity", domain: "mesh" },
  { kind: "normals", label: "Surface normals", family: "differential-geometry", domain: "vertex" },
  { kind: "curvature", label: "Surface curvature", family: "differential-geometry", domain: "vertex" },
  { kind: "principal-directions", label: "Principal directions", family: "differential-geometry", domain: "vertex", dependencies: [{ kind: "normals" }, { kind: "curvature" }] },
  { kind: "quality", label: "Mesh quality", family: "mesh-quality", domain: "face" },
  { kind: "field-calculus", label: "Surface field calculus", family: "surface-field-calculus", domain: "vertex" },
  { kind: "geodesic", label: "Geodesic analysis", family: "distances-geodesics", domain: "path" },
  { kind: "surface-features", label: "Surface features", family: "surface-features", domain: "mixed", dependencies: [{ kind: "normals" }, { kind: "curvature" }, { kind: "principal-directions" }] },
  { kind: "ridges-valleys", label: "Ridges and valleys", family: "surface-features", domain: "path", dependencies: [{ kind: "curvature" }, { kind: "principal-directions" }] },
];

export const createMeshAnalysisRegistry = (
  definitions: readonly MeshAnalysisDefinition[] = DEFAULT_MESH_ANALYSIS_DEFINITIONS
): MeshAnalysisRegistry => createAnalysisRegistry(definitions, "Mesh analysis");

export const registerMeshAnalysis = (
  registry: MeshAnalysisRegistry,
  definition: MeshAnalysisDefinition
): MeshAnalysisRegistry => registerAnalysis(registry, definition, "Mesh analysis");

export const getMeshAnalysisDefinition = (
  registry: MeshAnalysisRegistry,
  kind: MeshAnalysisResultKind,
  variant = "default"
): MeshAnalysisDefinition | null => getAnalysisDefinition(registry, kind, variant);

export const listMeshAnalysisDefinitions = (registry: MeshAnalysisRegistry): MeshAnalysisDefinition[] =>
  listAnalysisDefinitions(registry);

export const resolveMeshAnalysisDependencies = (
  registry: MeshAnalysisRegistry,
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity,
  kind: MeshAnalysisResultKind,
  variant = "default"
): MeshAnalysisResultDependency[] => resolveAnalysisDependencies(
  registry,
  store,
  mesh,
  kind,
  variant
);
