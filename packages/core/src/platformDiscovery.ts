import { SCIENTIFIC_CAPABILITY_REGISTRY, type ScientificEnvironment,
  type ScientificOperation } from "./scientificCapabilityRegistry";

export const PLATFORM_REGISTRY_KINDS = [
  "scientific-operations", "mathematical-objects", "computational-methods",
  "scientific-features", "visualizations", "ui-routes", "commands", "metrics",
  "validators", "workflows", "journeys", "runtime-providers", "exporters",
] as const;
export type PlatformRegistryKind = typeof PLATFORM_REGISTRY_KINDS[number];

/** A deliberately small JSON Schema subset for discoverable contracts. */
export type DiscoveryJsonSchema = Readonly<{
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Readonly<Record<string, DiscoveryJsonSchema>>;
  items?: DiscoveryJsonSchema;
  required?: readonly string[];
  additionalProperties?: boolean;
  minimum?: number;
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
const surfaceCurvatureDescriptor: ScientificOperationDescriptor = {
  ...curvatureOperation, kind: "scientific-operations", status: "registered",
  title: "Compute Surface curvature field", description: "Compute sampled curvature and statistics for a Surface.",
  module: "surface", category: "differential-geometry", schemaCompleteness: "partial",
  inputSchema: { type: "object", properties: { surfaceSamples: { type: "object",
    description: "Current sampled Surface curvature values and validity masks." } }, required: ["surfaceSamples"] },
  parameterSchema: { type: "object", properties: { histogramBins: { type: "integer", minimum: 1, default: 16 } } },
  outputSchema: { type: "object", properties: {
    gaussianCurvature: { type: "array", items: { type: "number" } },
    meanCurvature: { type: "array", items: { type: "number" } },
    principalCurvatures: { type: "array", items: { type: "number" } },
    statistics: { type: "object" } },
    required: ["gaussianCurvature", "meanCurvature", "principalCurvatures", "statistics"] },
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

export const MATH3D_PLATFORM_DISCOVERY = createPlatformDiscovery([
  surfaceCurvatureDescriptor,
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
