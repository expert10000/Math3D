/** Discoverable scientific intent, distinct from a host's executable implementation. */
export const SCIENTIFIC_CAPABILITY_SCHEMA_VERSION = 1 as const;

export const SCIENTIFIC_MODULES = [
  "graph2d", "graph3d", "curve", "surface", "mesh", "geometry", "volume",
  "topology", "cas", "number-theory", "complex", "field", "quantum",
] as const;
export type ScientificModule = typeof SCIENTIFIC_MODULES[number];
export type ScientificMethod = "analytic" | "numerical" | "symbolic" | "algorithmic";
export type ScientificEnvironment = "browser" | "desktop" | "server" | "mobile";

export type ScientificPort = Readonly<{ name: string; type: string; units?: string }>;
export type ScientificParameter = ScientificPort & Readonly<{ default?: string | number | boolean }>;
export type ScientificCapability = Readonly<{
  schemaVersion: typeof SCIENTIFIC_CAPABILITY_SCHEMA_VERSION;
  id: string;
  version: string;
  module: ScientificModule;
  title: string;
  category: string;
  /** A catalogued capability is a roadmap entry, not a claim that it can run. */
  status: "catalogued" | "operation-registered";
  inputs: readonly ScientificPort[];
  parameters: readonly ScientificParameter[];
  outputs: readonly ScientificPort[];
  methods: readonly ScientificMethod[];
  validation: readonly string[];
  execution: Readonly<{ deterministic: boolean; cancellable: boolean; supportsProgress: boolean }> | null;
}>;

export type ScientificOperation = Readonly<{
  id: string;
  version: string;
  capabilityIds: readonly string[];
  method: ScientificMethod;
  environments: readonly ScientificEnvironment[];
  /** Stable adapter key; a host binds this to the actual implementation. */
  implementationId: string;
}>;

export type ScientificMetric = Readonly<{
  id: string; value: number; units: string | null;
}>;
export type ScientificArtifact = Readonly<{
  id: string; type: string; reference: string; retained: boolean;
}>;
export type ScientificResult = Readonly<{
  executionId: string;
  capabilityId: string;
  operationId: string;
  sourceReference: string;
  metrics: readonly ScientificMetric[];
  artifacts: readonly ScientificArtifact[];
}>;

export function createScientificCapabilityRegistry(
  capabilities: readonly ScientificCapability[], operations: readonly ScientificOperation[],
) {
  const byId = new Map<string, ScientificCapability>();
  const byOperation = new Map<string, ScientificOperation>();
  for (const capability of capabilities) {
    if (byId.has(capability.id) || !SCIENTIFIC_MODULES.includes(capability.module) ||
        !/^\d+\.\d+\.\d+$/.test(capability.version))
      throw new TypeError(`Invalid or duplicate scientific capability: ${capability.id}`);
    byId.set(capability.id, Object.freeze(capability));
  }
  for (const operation of operations) {
    if (byOperation.has(operation.id) || !operation.capabilityIds.length ||
        new Set(operation.capabilityIds).size !== operation.capabilityIds.length ||
        operation.capabilityIds.some(id => {
          const capability = byId.get(id);
          return !capability || capability.status !== "operation-registered" ||
            !capability.methods.includes(operation.method);
        }) ||
        !/^\d+\.\d+\.\d+$/.test(operation.version) || !operation.environments.length)
      throw new TypeError(`Invalid or duplicate scientific operation: ${operation.id}`);
    byOperation.set(operation.id, Object.freeze(operation));
  }
  for (const capability of byId.values())
    if (capability.status === "operation-registered" &&
        ![...byOperation.values()].some(operation => operation.capabilityIds.includes(capability.id)))
      throw new TypeError(`Scientific capability has no operation: ${capability.id}`);
  return Object.freeze({
    capabilities: Object.freeze([...byId.values()]),
    operations: Object.freeze([...byOperation.values()]),
    getCapability: (id: string) => byId.get(id) ?? null,
    getOperation: (id: string) => byOperation.get(id) ?? null,
    forModule: (module: ScientificModule) => Object.freeze([...byId.values()].filter(item => item.module === module)),
    runnableFor: (module: ScientificModule, environment: ScientificEnvironment,
      implementationAvailable: (id: string) => boolean) => Object.freeze([...byId.values()].filter(capability =>
        capability.module === module && [...byOperation.values()].some(operation =>
          operation.capabilityIds.includes(capability.id) && operation.environments.includes(environment) &&
          implementationAvailable(operation.implementationId)))),
  });
}

export function bindScientificOperation<Input, Output>(registry: ReturnType<typeof createScientificCapabilityRegistry>,
  operationId: string, implementationId: string, execute: (input: Input) => Output) {
  const definition = registry.getOperation(operationId);
  if (!definition || definition.implementationId !== implementationId)
    throw new TypeError(`Scientific operation is not registered for this implementation: ${operationId}`);
  return Object.freeze({ definition, execute });
}

const moduleCatalog: Readonly<Record<ScientificModule, readonly string[]>> = {
  graph2d: ["roots", "extrema", "derivatives", "integrals", "intersections", "asymptotes", "regression", "ode-solutions"],
  graph3d: ["critical-points", "gradients", "hessians", "level-sets", "constrained-extrema"],
  curve: ["curvature", "torsion", "arc-length", "frenet-frame", "intersections", "geodesics"],
  surface: ["curvature.gaussian", "curvature.mean", "curvature.principal", "fundamental-forms", "area", "geodesics"],
  mesh: ["topology", "normals", "curvature-estimation", "quality", "remeshing", "subdivision", "simplification"],
  geometry: ["distances", "intersections", "volumes", "angles", "transformations", "constraints"],
  volume: ["scalar-fields", "isosurfaces", "slicing", "integration", "gradients", "interpolation"],
  topology: ["euler-characteristic", "genus", "connected-components", "homology", "betti-numbers", "persistent-homology"],
  cas: ["simplification", "differentiation", "integration", "equation-solving", "polynomial-operations"],
  "number-theory": ["factorization", "number-fields", "galois-groups", "modular-arithmetic", "elliptic-curves"],
  complex: ["zeros", "poles", "residues", "conformal-mappings", "contour-integration", "domain-coloring"],
  field: ["divergence", "curl", "streamlines", "comparison", "flux", "critical-points"],
  quantum: ["eigenvalues", "eigenstates", "probability-density", "expectation-values", "time-evolution"],
};

const registeredGaussian: ScientificCapability = {
  schemaVersion: 1, id: "surface.curvature.gaussian", version: "1.0.0", module: "surface",
  title: "Gaussian curvature", category: "differential-geometry", status: "operation-registered",
  inputs: [{ name: "surfaceSamples", type: "SurfaceCurvatureSamples" }],
  parameters: [{ name: "histogramBins", type: "integer", default: 16 }],
  outputs: [{ name: "gaussianCurvature", type: "ScalarField", units: "length^-2" },
    { name: "statistics", type: "StatisticalSummary" }],
  methods: ["numerical"], validation: ["finite-values", "domain-coverage"],
  execution: { deterministic: true, cancellable: true, supportsProgress: true },
};
const registeredMean: ScientificCapability = {
  ...registeredGaussian, id: "surface.curvature.mean", title: "Mean curvature",
  outputs: [{ name: "meanCurvature", type: "ScalarField", units: "length^-1" },
    { name: "statistics", type: "StatisticalSummary" }],
};
const registeredPrincipal: ScientificCapability = {
  ...registeredGaussian, id: "surface.curvature.principal", title: "Principal curvatures",
  outputs: [{ name: "principalCurvatures", type: "PrincipalCurvaturePairField", units: "length^-1" },
    { name: "statistics", type: "StatisticalSummary" }],
};
const registeredCurvature = new Map([
  [registeredGaussian.id, registeredGaussian], [registeredMean.id, registeredMean],
  [registeredPrincipal.id, registeredPrincipal],
]);

const catalogued = (module: ScientificModule, name: string): ScientificCapability => ({
  schemaVersion: 1, id: `${module}.${name}`, version: "0.1.0", module,
  title: name.replace(/[.-]/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()),
  category: "unclassified", status: "catalogued", inputs: [], parameters: [], outputs: [],
  methods: [], validation: [], execution: null,
});

export const SCIENTIFIC_CAPABILITY_REGISTRY = createScientificCapabilityRegistry(
  SCIENTIFIC_MODULES.flatMap(module => moduleCatalog[module].map(name =>
    registeredCurvature.get(`${module}.${name}`) ?? catalogued(module, name))),
  [{ id: "surface.curvature.compute", version: "1.0.0", capabilityIds: [...registeredCurvature.keys()],
    method: "numerical", environments: ["browser", "desktop"],
    implementationId: "math3d.surface.curvature-field" }],
);
