import { SCIENTIFIC_CAPABILITY_REGISTRY, type ScientificEnvironment,
  scientificModuleForWorkerOperation, type ScientificOperation } from "./scientificCapabilityRegistry";
import { MATH3D_WORKER_OPERATION_REGISTRY } from "./workerOperationRegistry";

export const PLATFORM_REGISTRY_KINDS = [
  "scientific-operations", "mathematical-objects", "computational-methods",
  "scientific-features", "visualizations", "ui-routes", "commands", "metrics",
  "validators", "workflows", "journeys", "runtime-providers", "exporters",
] as const;
export type PlatformRegistryKind = typeof PLATFORM_REGISTRY_KINDS[number];

/** A deliberately small JSON Schema subset for discoverable contracts. */
export type DiscoveryJsonSchema = Readonly<{
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  description?: string;
  properties?: Readonly<Record<string, DiscoveryJsonSchema>>;
  items?: DiscoveryJsonSchema;
  anyOf?: readonly DiscoveryJsonSchema[];
  enum?: readonly (string | number | boolean | null)[];
  required?: readonly string[];
  additionalProperties?: boolean;
  minimum?: number;
  minItems?: number;
  maxItems?: number;
  default?: string | number | boolean;
}>;

export type PlatformDescriptor = Readonly<{
  kind: PlatformRegistryKind;
  id: string;
  version: string;
  title: string;
  description: string;
  /** Catalogued entries are discoverable design intent, not enabled UI or runtime claims. */
  status: "catalogued" | "registered";
  references: Readonly<Partial<Record<PlatformRegistryKind, readonly string[]>>>;
}>;

export type ScientificOperationDescriptor = PlatformDescriptor & ScientificOperation & Readonly<{
  kind: "scientific-operations";
  module: string;
  category: string;
  inputSchema: DiscoveryJsonSchema;
  parameterSchema: DiscoveryJsonSchema;
  outputSchema: DiscoveryJsonSchema;
  supportedMethods: readonly string[];
  requiredCapabilities: readonly string[];
  visualizationIds: readonly string[];
  validatorIds: readonly string[];
  headlessSupported: boolean;
  cancellable: boolean;
  cacheable: boolean;
  deterministic: boolean;
  /** Partial schemas cannot yet drive generated parameter editors or SDK bindings. */
  schemaCompleteness: "partial" | "complete";
}>;

export type DiscoveryEntry = PlatformDescriptor | ScientificOperationDescriptor;

export type ScientificOperationHost = Readonly<{
  environment: ScientificEnvironment;
  /** Implementations proven available by this host. An empty list advertises no operation. */
  implementations: readonly string[];
}>;

export function createPlatformDiscovery(entries: readonly DiscoveryEntry[],
  capabilityRegistry: typeof SCIENTIFIC_CAPABILITY_REGISTRY = SCIENTIFIC_CAPABILITY_REGISTRY) {
  const registries = new Map<PlatformRegistryKind, Map<string, DiscoveryEntry>>();
  for (const kind of PLATFORM_REGISTRY_KINDS) registries.set(kind, new Map());
  const globalIds = new Set<string>();
  for (const entry of entries) {
    const registry = registries.get(entry.kind);
    if (!registry || globalIds.has(entry.id) || !/^\d+\.\d+\.\d+$/.test(entry.version))
      throw new TypeError(`Invalid or duplicate platform descriptor: ${entry.id}`);
    globalIds.add(entry.id);
    registry.set(entry.id, Object.freeze(entry));
  }
  for (const entry of entries) {
    for (const [kind, ids] of Object.entries(entry.references) as [PlatformRegistryKind, readonly string[]][]) {
      if (!registries.has(kind) || ids.some(id => !registries.get(kind)?.has(id)))
        throw new TypeError(`Unresolved platform reference from ${entry.id} to ${kind}.`);
    }
    if (entry.kind === "scientific-operations") {
      const operation = entry as ScientificOperationDescriptor;
      const canonical = capabilityRegistry.getOperation(operation.id);
      if (!canonical || canonical.capabilityIds.join("|") !== operation.capabilityIds.join("|") ||
          canonical.implementationId !== operation.implementationId ||
          canonical.capabilityIds.join("|") !== operation.requiredCapabilities.join("|") ||
          operation.requiredCapabilities.some(id => !capabilityRegistry.getCapability(id)) ||
          operation.visualizationIds.join("|") !== (operation.references.visualizations ?? []).join("|") ||
          operation.validatorIds.join("|") !== (operation.references.validators ?? []).join("|") ||
          operation.supportedMethods.some(id => !(operation.references["computational-methods"] ?? []).includes(id)))
        throw new TypeError(`Scientific operation diverges from its capability registration: ${operation.id}`);
    }
  }
  return Object.freeze({
    list: (kind: PlatformRegistryKind): readonly DiscoveryEntry[] => Object.freeze([...registries.get(kind)!.values()]),
    get: (kind: PlatformRegistryKind, id: string): DiscoveryEntry | null => registries.get(kind)?.get(id) ?? null,
    related: (kind: PlatformRegistryKind, id: string, target: PlatformRegistryKind): readonly DiscoveryEntry[] => {
      const entry = registries.get(kind)?.get(id);
      return Object.freeze((entry?.references[target] ?? []).map(ref => registries.get(target)!.get(ref)!));
    },
    executableOperation: (id: string, environment: ScientificEnvironment,
      implementationAvailable: (id: string) => boolean): ScientificOperationDescriptor | null => {
      const descriptor = registries.get("scientific-operations")!.get(id) as ScientificOperationDescriptor | undefined;
      return descriptor?.status === "registered" && descriptor.environments.includes(environment) &&
        implementationAvailable(descriptor.implementationId) ? descriptor : null;
    },
    generatableOperations: (environment: ScientificEnvironment,
      implementationAvailable: (id: string) => boolean): readonly ScientificOperationDescriptor[] => Object.freeze(
      [...registries.get("scientific-operations")!.values()].filter((entry): entry is ScientificOperationDescriptor =>
        entry.kind === "scientific-operations" && entry.status === "registered" &&
        (entry as ScientificOperationDescriptor).schemaCompleteness === "complete" &&
        (entry as ScientificOperationDescriptor).environments.includes(environment) &&
        implementationAvailable((entry as ScientificOperationDescriptor).implementationId))),
  });
}

const entry = (kind: PlatformRegistryKind, id: string, title: string,
  references: PlatformDescriptor["references"] = {}): PlatformDescriptor => ({
  kind, id, version: "0.1.0", title, description: `${title} discovery entry.`,
  status: "catalogued", references,
});

const curvatureOperation = SCIENTIFIC_CAPABILITY_REGISTRY.getOperation("surface.curvature.compute")!;
const numericValue: DiscoveryJsonSchema = { anyOf: [{ type: "number" }, { type: "null" }] };
const numericArray: DiscoveryJsonSchema = { type: "array", items: numericValue };
const byteArray: DiscoveryJsonSchema = { type: "array", items: { type: "integer", minimum: 0 } };
const statistics: DiscoveryJsonSchema = { type: "object", additionalProperties: false,
  properties: {
    min: { type: "number" }, max: { type: "number" }, mean: { type: "number" },
    rms: { type: "number" }, std: { type: "number" }, median: { type: "number" },
    p05: { type: "number" }, p25: { type: "number" }, p75: { type: "number" }, p95: { type: "number" },
    count: { type: "integer", minimum: 0 }, minIndex: { type: "integer", minimum: 0 },
    maxIndex: { type: "integer", minimum: 0 }, histogram: { type: "array", items: {
      type: "object", additionalProperties: false, properties: {
        min: { type: "number" }, max: { type: "number" }, count: { type: "integer", minimum: 0 },
      }, required: ["min", "max", "count"],
    } },
  }, required: ["min", "max", "mean", "rms", "std", "median", "p05", "p25", "p75", "p95",
    "count", "minIndex", "maxIndex", "histogram"] };
const statisticsOrNull: DiscoveryJsonSchema = { anyOf: [statistics, { type: "null" }] };
const scalarNames = ["K", "H", "k1", "k2", "shapeIndex", "curvedness"] as const;
const curvatureInputSchema: DiscoveryJsonSchema = { type: "object", additionalProperties: false,
  properties: { surfaceSamples: { type: "object", additionalProperties: false, properties: {
    sampleCount: { type: "integer", minimum: 1 }, parameters: numericArray, positions: numericArray,
    K: numericArray, H: numericArray, k1: numericArray, k2: numericArray,
    d1: numericArray, d2: numericArray,
    validityMask: byteArray, uncertaintyMask: byteArray, degeneracyMask: byteArray,
    singularityMask: byteArray, umbilicMask: byteArray, directionValidityMask: byteArray,
  }, required: ["sampleCount", "K", "H", "k1", "k2"] } }, required: ["surfaceSamples"] };
const curvatureParameterSchema: DiscoveryJsonSchema = { type: "object", additionalProperties: false,
  properties: {
    absoluteTolerance: { type: "number", minimum: 0 }, relativeTolerance: { type: "number", minimum: 0 },
    histogramBins: { type: "integer", minimum: 1, default: 16 }, palette: { type: "string" },
    inverted: { type: "boolean" }, rangeMode: { type: "string",
      enum: ["automatic", "manual", "percentile", "symmetric"] },
    range: { anyOf: [{ type: "object", additionalProperties: false,
      properties: { min: { type: "number" }, max: { type: "number" } }, required: ["min", "max"] },
    { type: "null" }] },
    percentileRange: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
    lengthUnit: { type: "string" },
  } };
const curvatureOutputSchema: DiscoveryJsonSchema = { type: "object", additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["curvature"] }, sampleCount: { type: "integer", minimum: 1 },
    parameters: numericArray, positions: numericArray, gaussianCurvature: numericArray,
    meanCurvature: numericArray, principalCurvatures: numericArray, principalDirections: numericArray,
    shapeIndex: numericArray, curvedness: numericArray, classificationCodes: byteArray,
    classificationLabels: { type: "array", items: { type: "string" } },
    classificationCounts: { type: "object", additionalProperties: false,
      properties: Object.fromEntries(["invalid", "flat", "elliptic", "hyperbolic", "parabolic", "umbilic"]
        .map(name => [name, { type: "integer", minimum: 0 }])),
      required: ["invalid", "flat", "elliptic", "hyperbolic", "parabolic", "umbilic"] },
    regions: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { classification: { type: "string" }, indices: byteArray },
      required: ["classification", "indices"] } },
    validityMask: byteArray, uncertaintyMask: byteArray, directionValidityMask: byteArray,
    validDomainCount: { type: "integer", minimum: 0 },
    units: { type: "object", additionalProperties: false,
      properties: Object.fromEntries(["K", "H", "k1", "k2", "shapeIndex", "curvedness", "d1", "d2"]
        .map(name => [name, { type: "string" }])),
      required: ["K", "H", "k1", "k2", "shapeIndex", "curvedness", "d1", "d2"] },
    statistics: { type: "object", additionalProperties: false,
      properties: Object.fromEntries(scalarNames.map(name => [name, statisticsOrNull])),
      required: scalarNames },
    display: { type: "object", additionalProperties: false,
      properties: { palette: { type: "string" }, inverted: { type: "boolean" },
        rangeMode: { type: "string", enum: ["automatic", "manual", "percentile", "symmetric"] },
        range: { anyOf: [{ type: "object", additionalProperties: false,
          properties: { min: { type: "number" }, max: { type: "number" } }, required: ["min", "max"] },
        { type: "null" }] },
        percentileRange: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
      }, required: ["palette", "inverted", "rangeMode", "range"] },
  }, required: ["kind", "sampleCount", "parameters", "positions", "gaussianCurvature", "meanCurvature",
    "principalCurvatures", "principalDirections", "shapeIndex", "curvedness", "classificationCodes",
    "classificationLabels", "classificationCounts", "regions", "validityMask", "uncertaintyMask",
    "directionValidityMask", "validDomainCount", "units", "statistics", "display"] };
const surfaceCurvatureDescriptor: ScientificOperationDescriptor = {
  ...curvatureOperation, kind: "scientific-operations", status: "registered",
  title: "Compute Surface curvature field", description: "Compute sampled curvature and statistics for a Surface.",
  module: "surface", category: "differential-geometry", schemaCompleteness: "complete",
  inputSchema: curvatureInputSchema, parameterSchema: curvatureParameterSchema,
  outputSchema: curvatureOutputSchema,
  supportedMethods: ["surface.curvature.sampled-numerical"],
  requiredCapabilities: curvatureOperation.capabilityIds,
  visualizationIds: ["view.scalarField", "view.histogram"],
  validatorIds: ["validation.finite-values", "validation.domain-coverage"],
  headlessSupported: true, cancellable: true, cacheable: true, deterministic: true,
  references: {
    "computational-methods": ["surface.curvature.sampled-numerical"],
    "scientific-features": ["surface.gaussianCurvature"],
    visualizations: ["view.scalarField", "view.histogram"],
    validators: ["validation.finite-values", "validation.domain-coverage"],
    "ui-routes": ["workspace.surfaces.analysis"],
    workflows: ["flow.surface.curvatureAnalysis"],
    journeys: ["journey.catenoid.study"],
    "runtime-providers": ["runtime.math3d-js"],
  },
};

export function validateDiscoveryJsonValue(schema: DiscoveryJsonSchema, value: unknown): boolean {
  if (schema.anyOf) return schema.anyOf.some(choice => validateDiscoveryJsonValue(choice, value));
  if (schema.enum && !schema.enum.includes(value as string | number | boolean | null)) return false;
  if (schema.type === "null") return value === null;
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "number" || schema.type === "integer")
    return typeof value === "number" && Number.isFinite(value) &&
      (schema.type !== "integer" || Number.isInteger(value)) &&
      (schema.minimum === undefined || value >= schema.minimum);
  if (schema.type === "array") return Array.isArray(value) &&
    (schema.minItems === undefined || value.length >= schema.minItems) &&
    (schema.maxItems === undefined || value.length <= schema.maxItems) &&
    (!schema.items || value.every(item => validateDiscoveryJsonValue(schema.items!, item)));
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (schema.required?.some(key => !(key in record))) return false;
    return Object.entries(record).every(([key, item]) => {
      const property = schema.properties?.[key];
      return property ? validateDiscoveryJsonValue(property, item) : schema.additionalProperties !== false;
    });
  }
  return false;
}

const canonicalWorkerDescriptors: ScientificOperationDescriptor[] = MATH3D_WORKER_OPERATION_REGISTRY.map(worker => {
  const operation = SCIENTIFIC_CAPABILITY_REGISTRY.getOperation(worker.id)!;
  return {
    ...operation, kind: "scientific-operations", status: "registered", title: worker.title,
    description: `${worker.title} through the canonical ${worker.canonicalOwner} worker operation.`,
    module: scientificModuleForWorkerOperation(worker), category: "canonical-worker-operation",
    inputSchema: { type: "object", description: "Validated canonical WorkerRequest; operation-specific schema is pending." },
    parameterSchema: { type: "object", description: "Parameters are defined by the canonical worker request." },
    outputSchema: { type: "object", description: "Canonical WorkerResponse; operation-specific schema is pending." },
    supportedMethods: [], requiredCapabilities: operation.capabilityIds,
    visualizationIds: [], validatorIds: [],
    headlessSupported: worker.environments.includes("server"), cancellable: false,
    cacheable: false, deterministic: false, schemaCompleteness: "partial", references: {},
  };
});

export const MATH3D_PLATFORM_DISCOVERY = createPlatformDiscovery([
  surfaceCurvatureDescriptor, ...canonicalWorkerDescriptors,
  entry("mathematical-objects", "surface.catenoid", "Catenoid"),
  entry("mathematical-objects", "curve.helix", "Helix"),
  entry("computational-methods", "surface.curvature.sampled-numerical", "Sampled numerical curvature"),
  entry("computational-methods", "mesh.curvature.angleDefect", "Angle defect curvature"),
  entry("scientific-features", "surface.gaussianCurvature", "Gaussian curvature"),
  entry("visualizations", "view.scalarField", "Scalar field"),
  entry("visualizations", "view.histogram", "Histogram"),
  entry("ui-routes", "workspace.surfaces.analysis", "Surface analysis"),
  entry("commands", "project.save", "Save Project"),
  entry("commands", "viewer.fit", "Fit viewer"),
  entry("metrics", "metric.rmse", "Root mean square error"),
  entry("metrics", "metric.peakMemory", "Peak memory"),
  entry("validators", "validation.finite-values", "Finite values"),
  entry("validators", "validation.domain-coverage", "Domain coverage"),
  entry("validators", "validation.referenceTolerance", "Reference tolerance"),
  entry("workflows", "flow.surface.curvatureAnalysis", "Surface curvature analysis"),
  entry("journeys", "journey.catenoid.study", "Catenoid evidence Study"),
  entry("runtime-providers", "runtime.math3d-js", "Math3D JavaScript"),
  entry("runtime-providers", "runtime.sage", "SageMath"),
  entry("runtime-providers", "runtime.vtk", "VTK"),
  entry("exporters", "export.csv", "CSV"),
  entry("exporters", "export.vtp", "VTP"),
]);

export function resolveScientificOperationAvailability(id: string, host: ScientificOperationHost): Readonly<{
  available: boolean; descriptor: ScientificOperationDescriptor | null; reason: string | null;
}> {
  const entry = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations", id);
  if (!entry) return { available: false, descriptor: null, reason: "Operation is not registered." };
  const descriptor = entry as ScientificOperationDescriptor;
  if (descriptor.status !== "registered")
    return { available: false, descriptor, reason: "Operation has no registered implementation." };
  if (!descriptor.environments.includes(host.environment))
    return { available: false, descriptor, reason: `Operation does not support ${host.environment}.` };
  if (!host.implementations.includes(descriptor.implementationId))
    return { available: false, descriptor, reason: "Implementation is not available on this host." };
  return { available: true, descriptor, reason: null };
}

export function listAvailableScientificOperations(host: ScientificOperationHost): readonly ScientificOperationDescriptor[] {
  return Object.freeze(MATH3D_PLATFORM_DISCOVERY.list("scientific-operations")
    .filter((entry): entry is ScientificOperationDescriptor => entry.kind === "scientific-operations" &&
      resolveScientificOperationAvailability(entry.id, host).available));
}
