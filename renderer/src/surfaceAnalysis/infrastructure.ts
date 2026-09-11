import type {
  AnalysisParameters,
  AnalysisResult,
  AnalysisResultDependency,
  AnalysisResultStore,
} from "../analysis/contracts";
import {
  createAnalysisRegistry,
  getAnalysisDefinition,
  resolveAnalysisDependencies,
  type AnalysisDefinition,
  type AnalysisRegistry,
} from "../analysis/registry";
import {
  createAnalysisResultStore,
  getAnalysisResult,
  getAnalysisResultForParameters,
  invalidateAnalysisResult,
  upsertAnalysisResult,
  type UpsertAnalysisResultOptions,
} from "../analysis/resultStore";
import type {
  CanonicalSurfaceDefinition,
  SurfaceAdapterInput,
  SurfaceAnalysisDomain,
  SurfaceAnalysisMethod,
  SurfaceAnalysisPayload,
  SurfaceAnalysisRequest,
  SurfaceIdentity,
  SurfaceOrientation,
  SurfaceRepresentation,
  SurfaceResultInspection,
  SurfaceResultKind,
  SurfaceUnits,
} from "./contracts";

export type SurfaceAnalysisDefinition = AnalysisDefinition<SurfaceResultKind, SurfaceAnalysisDomain>;
export type SurfaceAnalysisRegistry = AnalysisRegistry<SurfaceResultKind, SurfaceAnalysisDomain>;
export type SurfaceAnalysisResult<TPayload = SurfaceAnalysisPayload> = AnalysisResult<TPayload, SurfaceResultKind, SurfaceIdentity>;
export type SurfaceAnalysisResultDependency = AnalysisResultDependency<SurfaceResultKind>;
export type SurfaceAnalysisResultStore = AnalysisResultStore<SurfaceResultKind, SurfaceIdentity>;

export type SurfaceRevisionTracker = Map<string, { fingerprint: string; revision: number }>;

export const DEFAULT_SURFACE_ANALYSIS_DEFINITIONS: readonly SurfaceAnalysisDefinition[] = [
  { kind: "surface-definition", label: "Surface definition", family: "surface-source", domain: "surface" },
  { kind: "surface-samples", label: "Surface samples", family: "surface-sampling", domain: "surface", dependencies: [{ kind: "surface-definition" }] },
  { kind: "differential-geometry", label: "Differential geometry", family: "surface-differential", domain: "surface", dependencies: [{ kind: "surface-definition" }] },
  { kind: "curvature-field", label: "Curvature field", family: "surface-differential", domain: "surface", dependencies: [{ kind: "differential-geometry" }] },
  { kind: "surface-probe", label: "Surface probe", family: "surface-probe", domain: "point", dependencies: [{ kind: "differential-geometry" }] },
  { kind: "surface-curves", label: "Surface curves", family: "surface-curves", domain: "curve", dependencies: [{ kind: "differential-geometry" }] },
  { kind: "surface-features", label: "Surface features", family: "surface-features", domain: "feature", dependencies: [{ kind: "differential-geometry" }] },
  { kind: "chart-diagnostics", label: "Chart diagnostics", family: "surface-charts", domain: "chart", dependencies: [{ kind: "surface-definition" }] },
  { kind: "derived-surface-mesh", label: "Derived SurfaceMesh", family: "surface-derived-mesh", domain: "derived-mesh", dependencies: [{ kind: "surface-definition" }] },
  { kind: "surface-comparison", label: "Surface comparison", family: "surface-comparison", domain: "mixed", dependencies: [{ kind: "differential-geometry" }, { kind: "derived-surface-mesh" }] },
  { kind: "surface-report", label: "Surface report", family: "surface-report", domain: "mixed", dependencies: [{ kind: "differential-geometry" }] },
];

const finiteRevision = (revision: number): number => {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Surface revision must be a non-negative safe integer.");
  return revision;
};

export const resolveSurfaceRevision = (
  tracker: SurfaceRevisionTracker,
  surfaceId: string,
  fingerprint: string
): number => {
  const previous = tracker.get(surfaceId);
  if (previous?.fingerprint === fingerprint) return previous.revision;
  const revision = (previous?.revision ?? 0) + 1;
  tracker.set(surfaceId, { fingerprint, revision });
  return revision;
};

const stableFingerprintValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableFingerprintValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "revision")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableFingerprintValue(entry)]));
  }
  return value;
};

export const surfaceAdapterFingerprint = (input: SurfaceAdapterInput): string =>
  JSON.stringify(stableFingerprintValue(input));

const finiteAxis = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
};

const validateDomain = (domain: SurfaceAdapterInput["domain"]): void => {
  if (domain.kind === "parameter") {
    finiteAxis(domain.u.min, "u minimum");
    finiteAxis(domain.u.max, "u maximum");
    finiteAxis(domain.v.min, "v minimum");
    finiteAxis(domain.v.max, "v maximum");
    if (domain.u.max <= domain.u.min || domain.v.max <= domain.v.min) throw new Error("Surface parameter domains must have positive extent.");
  } else if (domain.kind === "graph") {
    finiteAxis(domain.x.min, "x minimum");
    finiteAxis(domain.x.max, "x maximum");
    finiteAxis(domain.y.min, "y minimum");
    finiteAxis(domain.y.max, "y maximum");
    if (domain.x.max <= domain.x.min || domain.y.max <= domain.y.min) throw new Error("Surface graph domains must have positive extent.");
  } else if (domain.kind === "spatial-bounds") {
    domain.min.forEach((value, index) => finiteAxis(value, `bounds minimum ${index}`));
    domain.max.forEach((value, index) => finiteAxis(value, `bounds maximum ${index}`));
    if (domain.max.some((value, index) => value <= domain.min[index])) throw new Error("Surface spatial bounds must have positive extent.");
  } else if (!Number.isSafeInteger(domain.vertexCount) || domain.vertexCount < 0 || !Number.isSafeInteger(domain.faceCount) || domain.faceCount < 0) {
    throw new Error("Mesh-backed Surface counts must be non-negative integers.");
  }
};

const defaultOrientation = (representation: SurfaceRepresentation): SurfaceOrientation => {
  if (representation === "explicit") return { convention: "graph-up", sign: 1, description: "Upward graph normal" };
  if (representation === "implicit") return { convention: "gradient", sign: 1, description: "Normalized gradient" };
  if (representation === "mesh-backed") return { convention: "mesh-winding", sign: 1, description: "Source mesh winding" };
  return { convention: "parameter-cross", sign: 1, description: "Normalized r_u cross r_v" };
};

const sourceFor = (input: SurfaceAdapterInput): CanonicalSurfaceDefinition["source"] => {
  switch (input.representation) {
    case "explicit": return { familyId: "explicit-graph", expressions: { formula: input.formula } };
    case "implicit": return { familyId: "implicit-level-set", expressions: { formula: input.formula }, settings: { isoValue: input.isoValue ?? 0 } };
    case "parametric": return { familyId: input.familyId ?? "parametric", expressions: input.expressions };
    case "spline": return { familyId: input.familyId, settings: input.settings };
    case "constructed": return { familyId: input.familyId, sourceIds: [...input.sourceIds], settings: input.settings };
    case "weierstrass": return { familyId: "weierstrass", expressions: { g: input.gExpression, phi: input.phiExpression }, settings: input.settings };
    case "mesh-backed": return { familyId: input.sourceLabel ?? "mesh-backed", meshId: input.meshId, settings: { sourceRevision: input.sourceRevision ?? null } };
  }
};

export const createSurfaceIdentity = (input: Pick<SurfaceAdapterInput, "id" | "revision" | "label" | "representation">): SurfaceIdentity => {
  const surfaceId = input.id.trim();
  if (!surfaceId) throw new Error("Surface ID is required.");
  const surfaceRevision = finiteRevision(input.revision);
  return {
    surfaceId,
    surfaceRevision,
    representation: input.representation,
    key: `surface:${surfaceId}@${surfaceRevision}`,
    revision: String(surfaceRevision),
    label: input.label.trim() || surfaceId,
    sourceLabel: `${input.representation} Surface ${input.label.trim() || surfaceId}`,
  };
};

export const adaptSurfaceDefinition = (input: SurfaceAdapterInput): CanonicalSurfaceDefinition => {
  validateDomain(input.domain);
  const fallbackOrientation = defaultOrientation(input.representation);
  const units: SurfaceUnits = { length: input.units?.length?.trim() || "unit", angle: input.units?.angle ?? "rad", parameter: input.units?.parameter };
  const orientation: SurfaceOrientation = {
    convention: input.orientation?.convention ?? fallbackOrientation.convention,
    sign: input.orientation?.sign ?? fallbackOrientation.sign,
    description: input.orientation?.description?.trim() || fallbackOrientation.description,
  };
  return {
    version: 1,
    fingerprint: surfaceAdapterFingerprint(input),
    identity: createSurfaceIdentity(input),
    representation: input.representation,
    domain: input.domain,
    sampling: { ...input.sampling },
    units,
    orientation,
    source: sourceFor(input),
    warnings: [...(input.warnings ?? [])],
  };
};

export const createSurfaceAnalysisRegistry = (
  definitions: readonly SurfaceAnalysisDefinition[] = DEFAULT_SURFACE_ANALYSIS_DEFINITIONS
): SurfaceAnalysisRegistry => createAnalysisRegistry(definitions, "Surface analysis");

export const getSurfaceAnalysisDefinition = (
  registry: SurfaceAnalysisRegistry,
  kind: SurfaceResultKind,
  variant = "default"
): SurfaceAnalysisDefinition | null => getAnalysisDefinition(registry, kind, variant);

export const resolveSurfaceAnalysisDependencies = (
  registry: SurfaceAnalysisRegistry,
  store: SurfaceAnalysisResultStore,
  identity: SurfaceIdentity,
  kind: SurfaceResultKind,
  variant = "default"
): SurfaceAnalysisResultDependency[] => resolveAnalysisDependencies(registry, store, identity, kind, variant);

export const createSurfaceAnalysisResultStore = (): SurfaceAnalysisResultStore =>
  createAnalysisResultStore<SurfaceResultKind, SurfaceIdentity>();

export const upsertSurfaceAnalysisResult = <TPayload>(
  store: SurfaceAnalysisResultStore,
  options: Omit<UpsertAnalysisResultOptions<TPayload, SurfaceResultKind, SurfaceIdentity>, "identity"> & { identity: SurfaceIdentity }
): SurfaceAnalysisResultStore => upsertAnalysisResult(store, options, {
  lineageKey: (identity) => identity.surfaceId,
  defaultBackend: "Surface Analysis",
  maxResults: 48,
  maxHistory: 192,
});

export const getSurfaceAnalysisResult = <TPayload = SurfaceAnalysisPayload>(
  store: SurfaceAnalysisResultStore,
  identity: SurfaceIdentity | null | undefined,
  kind: SurfaceResultKind,
  variant = "default"
): SurfaceAnalysisResult<TPayload> | null => getAnalysisResult<TPayload, SurfaceResultKind, SurfaceIdentity>(store, identity, kind, variant);

export const getSurfaceAnalysisResultForParameters = <TPayload = SurfaceAnalysisPayload>(
  store: SurfaceAnalysisResultStore,
  identity: SurfaceIdentity | null | undefined,
  kind: SurfaceResultKind,
  parameters: AnalysisParameters,
  variant = "default"
): SurfaceAnalysisResult<TPayload> | null =>
  getAnalysisResultForParameters<TPayload, SurfaceResultKind, SurfaceIdentity>(store, identity, kind, parameters, variant);

export const invalidateSurfaceAnalysisResult = (
  store: SurfaceAnalysisResultStore,
  identity: SurfaceIdentity,
  kind: SurfaceResultKind,
  variant = "default",
  now = Date.now()
): SurfaceAnalysisResultStore => invalidateAnalysisResult(store, identity, kind, variant, now);

export const createSurfaceAnalysisRequest = (input: {
  requestId: string;
  kind: SurfaceResultKind;
  definition: CanonicalSurfaceDefinition;
  domain: SurfaceAnalysisDomain;
  method: SurfaceAnalysisMethod;
  parameters?: AnalysisParameters;
  requestedOutputs?: readonly string[];
  variant?: string;
}): SurfaceAnalysisRequest => ({
  version: 1,
  requestId: input.requestId,
  kind: input.kind,
  variant: input.variant ?? "default",
  identity: input.definition.identity,
  domain: input.domain,
  method: input.method,
  parameters: {
    ...input.parameters,
    surfaceId: input.definition.identity.surfaceId,
    surfaceRevision: input.definition.identity.surfaceRevision,
    representation: input.definition.representation,
    method: input.method,
  },
  requestedOutputs: [...(input.requestedOutputs ?? [])],
});

export const publishSurfaceAnalysisResult = (args: {
  store: SurfaceAnalysisResultStore;
  registry: SurfaceAnalysisRegistry;
  request: SurfaceAnalysisRequest;
  state?: "queued" | "running" | "ready" | "cancelled" | "deferred" | "error";
  payload?: SurfaceAnalysisPayload | null;
  progress?: number | null;
  error?: string | null;
  computeTimeMs?: number | null;
  backend?: string;
  now?: number;
}): SurfaceAnalysisResultStore => {
  if (!getSurfaceAnalysisDefinition(args.registry, args.request.kind, args.request.variant)) {
    throw new Error(`Surface analysis ${args.request.kind}:${args.request.variant} is not registered.`);
  }
  const dependencies = resolveSurfaceAnalysisDependencies(
    args.registry,
    args.store,
    args.request.identity,
    args.request.kind,
    args.request.variant
  );
  return upsertSurfaceAnalysisResult(args.store, {
    identity: args.request.identity,
    kind: args.request.kind,
    variant: args.request.variant,
    state: args.state,
    parameters: args.request.parameters,
    payload: args.payload,
    progress: args.progress,
    error: args.error,
    dependencies,
    computeTimeMs: args.computeTimeMs,
    backend: args.backend,
    now: args.now,
  });
};

export const inspectSurfaceAnalysisResult = (
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload>
): SurfaceResultInspection => ({
  resultKind: result.kind,
  state: result.state,
  surfaceId: result.identity.surfaceId,
  surfaceRevision: result.identity.surfaceRevision,
  representation: result.identity.representation,
  method: result.payload?.method ?? (typeof result.parameters.method === "string" ? result.parameters.method as SurfaceAnalysisMethod : "unknown"),
  units: result.payload?.units ?? null,
  warnings: result.payload?.warnings ?? (result.error ? [result.error] : []),
  dependencyStates: result.dependencies.map((dependency) => ({
    kind: dependency.kind,
    state: dependency.state,
    resultVersion: dependency.resultVersion,
  })),
});
