import {
  getMeshAnalysisResult,
  meshAnalysisResultKey,
  type MeshAnalysisMeshIdentity,
  type MeshAnalysisResultDependency,
  type MeshAnalysisResultKind,
  type MeshAnalysisResultStore,
} from "./analysisResultStore";

export type MeshAnalysisDomain = "mesh" | "vertex" | "edge" | "face" | "path" | "mixed";

export type MeshAnalysisDependencyDefinition = {
  kind: MeshAnalysisResultKind;
  variant?: string;
};

export type MeshAnalysisDefinition = {
  kind: MeshAnalysisResultKind;
  variant?: string;
  label: string;
  family: string;
  domain: MeshAnalysisDomain;
  dependencies?: readonly MeshAnalysisDependencyDefinition[];
};

export type MeshAnalysisRegistry = ReadonlyMap<string, MeshAnalysisDefinition>;

const registryKey = (kind: MeshAnalysisResultKind, variant = "default"): string => `${kind}:${variant}`;

export const DEFAULT_MESH_ANALYSIS_DEFINITIONS: readonly MeshAnalysisDefinition[] = [
  { kind: "diagnostics", label: "Mesh diagnostics", family: "topology-integrity", domain: "mesh" },
  { kind: "normals", label: "Surface normals", family: "differential-geometry", domain: "vertex" },
  { kind: "curvature", label: "Surface curvature", family: "differential-geometry", domain: "vertex" },
  {
    kind: "principal-directions",
    label: "Principal directions",
    family: "differential-geometry",
    domain: "vertex",
    dependencies: [{ kind: "normals" }, { kind: "curvature" }],
  },
  { kind: "quality", label: "Mesh quality", family: "mesh-quality", domain: "face" },
  { kind: "field-calculus", label: "Surface field calculus", family: "surface-field-calculus", domain: "vertex" },
  { kind: "geodesic", label: "Geodesic analysis", family: "distances-geodesics", domain: "path" },
  {
    kind: "surface-features",
    label: "Surface features",
    family: "surface-features",
    domain: "mixed",
    dependencies: [{ kind: "normals" }, { kind: "curvature" }, { kind: "principal-directions" }],
  },
  {
    kind: "ridges-valleys",
    label: "Ridges and valleys",
    family: "surface-features",
    domain: "path",
    dependencies: [{ kind: "curvature" }, { kind: "principal-directions" }],
  },
];

const validateRegistry = (registry: Map<string, MeshAnalysisDefinition>): void => {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string): void => {
    if (visiting.has(key)) throw new Error(`Mesh analysis dependency cycle includes ${key}.`);
    if (visited.has(key)) return;
    visiting.add(key);
    const definition = registry.get(key);
    for (const dependency of definition?.dependencies ?? []) {
      const dependencyRegistryKey = registryKey(dependency.kind, dependency.variant);
      if (!registry.has(dependencyRegistryKey)) {
        throw new Error(`Mesh analysis ${key} depends on unregistered analysis ${dependencyRegistryKey}.`);
      }
      visit(dependencyRegistryKey);
    }
    visiting.delete(key);
    visited.add(key);
  };

  for (const key of registry.keys()) visit(key);
};

export const createMeshAnalysisRegistry = (
  definitions: readonly MeshAnalysisDefinition[] = DEFAULT_MESH_ANALYSIS_DEFINITIONS
): MeshAnalysisRegistry => {
  const registry = new Map<string, MeshAnalysisDefinition>();
  for (const definition of definitions) {
    const key = registryKey(definition.kind, definition.variant);
    if (registry.has(key)) throw new Error(`Mesh analysis ${key} is already registered.`);
    registry.set(key, {
      ...definition,
      dependencies: definition.dependencies ? [...definition.dependencies] : [],
    });
  }
  validateRegistry(registry);
  return registry;
};

export const registerMeshAnalysis = (
  registry: MeshAnalysisRegistry,
  definition: MeshAnalysisDefinition
): MeshAnalysisRegistry => createMeshAnalysisRegistry([...registry.values(), definition]);

export const getMeshAnalysisDefinition = (
  registry: MeshAnalysisRegistry,
  kind: MeshAnalysisResultKind,
  variant = "default"
): MeshAnalysisDefinition | null => registry.get(registryKey(kind, variant)) ?? null;

export const listMeshAnalysisDefinitions = (registry: MeshAnalysisRegistry): MeshAnalysisDefinition[] =>
  [...registry.values()];

export const resolveMeshAnalysisDependencies = (
  registry: MeshAnalysisRegistry,
  store: MeshAnalysisResultStore,
  mesh: MeshAnalysisMeshIdentity,
  kind: MeshAnalysisResultKind,
  variant = "default"
): MeshAnalysisResultDependency[] => {
  const definition = getMeshAnalysisDefinition(registry, kind, variant);
  if (!definition) throw new Error(`Mesh analysis ${registryKey(kind, variant)} is not registered.`);
  return (definition.dependencies ?? []).map((dependency) => {
    const variant = dependency.variant ?? "default";
    const result = getMeshAnalysisResult(store, mesh, dependency.kind, variant);
    return {
      kind: dependency.kind,
      variant,
      key: meshAnalysisResultKey(mesh, dependency.kind, variant),
      state: result?.state ?? "stale",
      resultVersion: result?.resultVersion,
    };
  });
};
