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
  CanonicalCurveDefinition,
  CurveAdapterInput,
  CurveAnalysisDomain,
  CurveAnalysisMethod,
  CurveAnalysisPayload,
  CurveAnalysisRequest,
  CurveDerivativeCapabilities,
  CurveIdentity,
  CurveOrientation,
  CurveRepresentation,
  CurveResultInspection,
  CurveResultKind,
  CurveSamplingPolicy,
  CurveUnits,
} from "./contracts";

export type CurveAnalysisDefinition = AnalysisDefinition<CurveResultKind, CurveAnalysisDomain>;
export type CurveAnalysisRegistry = AnalysisRegistry<CurveResultKind, CurveAnalysisDomain>;
export type CurveAnalysisResult<TPayload = CurveAnalysisPayload> = AnalysisResult<TPayload, CurveResultKind, CurveIdentity>;
export type CurveAnalysisResultDependency = AnalysisResultDependency<CurveResultKind>;
export type CurveAnalysisResultStore = AnalysisResultStore<CurveResultKind, CurveIdentity>;
export type CurveRevisionTracker = Map<string, { fingerprint: string; revision: number }>;

export const DEFAULT_CURVE_ANALYSIS_DEFINITIONS: readonly CurveAnalysisDefinition[] = [
  { kind: "curve-definition", label: "Curve definition", family: "curve-source", domain: "curve" },
  { kind: "curve-samples", label: "Curve samples", family: "curve-sampling", domain: "curve", dependencies: [{ kind: "curve-definition" }] },
  { kind: "differential-geometry", label: "Differential geometry", family: "curve-differential", domain: "curve", dependencies: [{ kind: "curve-samples" }] },
  { kind: "curve-probe", label: "Curve probe", family: "curve-probe", domain: "point", dependencies: [{ kind: "differential-geometry" }] },
  { kind: "curve-diagnostics", label: "Curve diagnostics", family: "curve-diagnostics", domain: "mixed", dependencies: [{ kind: "curve-samples" }] },
  { kind: "curve-continuity", label: "Curve continuity", family: "curve-diagnostics", domain: "control", dependencies: [{ kind: "curve-definition" }] },
  { kind: "curve-intersections", label: "Curve intersections", family: "curve-diagnostics", domain: "point", dependencies: [{ kind: "curve-samples" }] },
  { kind: "derived-curve", label: "Derived curve", family: "curve-derived", domain: "curve", dependencies: [{ kind: "curve-definition" }] },
  { kind: "derived-curve-mesh", label: "Derived CurveMesh", family: "curve-derived-mesh", domain: "derived-mesh", dependencies: [{ kind: "curve-samples" }] },
  { kind: "curve-comparison", label: "Curve comparison", family: "curve-comparison", domain: "mixed", dependencies: [{ kind: "differential-geometry" }] },
  { kind: "curve-report", label: "Curve report", family: "curve-report", domain: "mixed", dependencies: [{ kind: "curve-diagnostics" }] },
];

const finiteRevision = (revision: number): number => {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Curve revision must be a non-negative safe integer.");
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

export const curveAdapterFingerprint = (input: CurveAdapterInput): string =>
  JSON.stringify(stableFingerprintValue(input));

export const resolveCurveRevision = (tracker: CurveRevisionTracker, curveId: string, fingerprint: string): number => {
  const previous = tracker.get(curveId);
  if (previous?.fingerprint === fingerprint) return previous.revision;
  const revision = (previous?.revision ?? 0) + 1;
  tracker.set(curveId, { fingerprint, revision });
  return revision;
};

const validateDomain = (domain: CurveAdapterInput["domain"]): void => {
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max)) throw new Error("Curve parameter domain must be finite.");
  if (domain.max <= domain.min) throw new Error("Curve parameter domain must have positive extent.");
  if (!domain.parameter.trim()) throw new Error("Curve parameter name is required.");
};

const defaultSampling = (representation: CurveRepresentation): CurveSamplingPolicy => ({
  strategy: representation === "polyline" ? "source-samples" : "adaptive",
  tolerance: 1e-3,
  minimumSamples: 16,
  maximumSamples: 4096,
  maximumDepth: 12,
});

const defaultDerivatives = (representation: CurveRepresentation): CurveDerivativeCapabilities => {
  if (representation === "polyline") {
    return { position: "sampled", first: "sampled", second: "sampled", third: "unavailable", arcLength: "polyline" };
  }
  return { position: "provided", first: "sampled", second: "sampled", third: "sampled", arcLength: "quadrature" };
};

const defaultOrientation = (representation: CurveRepresentation): CurveOrientation => ({
  convention: representation === "polyline" ? "polyline-order" : "increasing-parameter",
  description: representation === "polyline" ? "Source point order" : "Increasing parameter direction",
});

const sourceFor = (input: CurveAdapterInput): CanonicalCurveDefinition["source"] => {
  switch (input.representation) {
    case "parametric": return { familyId: input.familyId ?? "parametric", expressions: input.expressions };
    case "explicit": return { familyId: "explicit", expressions: { formula: input.formula, independentVariable: input.independentVariable ?? "x" } };
    case "implicit": return { familyId: "implicit", expressions: { formula: input.formula, ...(input.branch ? { branch: input.branch } : {}) } };
    case "polar": return { familyId: "polar", expressions: { radius: input.radiusExpression, angleParameter: input.angleParameter ?? input.domain.parameter } };
    case "bezier": return { familyId: "bezier", expressions: input.sourceExpressions, controlPointCount: input.controlPoints.length, controlPoints: input.controlPoints.map((point) => [...point]), settings: { degree: input.degree ?? Math.max(0, input.controlPoints.length - 1) } };
    case "b-spline": return { familyId: "b-spline", expressions: input.sourceExpressions, controlPointCount: input.controlPoints.length, controlPoints: input.controlPoints.map((point) => [...point]), knots: [...input.knots], settings: { degree: input.degree, knotCount: input.knots.length, periodic: input.periodic ?? input.domain.periodic } };
    case "nurbs": return { familyId: "nurbs", expressions: input.sourceExpressions, controlPointCount: input.controlPoints.length, controlPoints: input.controlPoints.map((point) => [...point]), knots: [...input.knots], weights: [...input.weights], settings: { degree: input.degree, knotCount: input.knots.length, weightCount: input.weights.length, periodic: input.periodic ?? input.domain.periodic } };
    case "polyline": return { familyId: input.sourceLabel ?? "polyline", expressions: input.sourceExpressions, pointCount: input.points.length };
    case "curve-on-surface": return { familyId: "curve-on-surface", expressions: input.parameterExpressions, sourceIds: [input.surfaceId], pointCount: input.pointCount, surfaceLink: { surfaceId: input.surfaceId, surfaceRevision: input.surfaceRevision }, settings: { surfaceRevision: input.surfaceRevision } };
    case "derived": return { familyId: input.operation, expressions: input.sourceExpressions, sourceIds: [...input.sourceIds], settings: input.settings };
  }
};

export const createCurveIdentity = (input: Pick<CurveAdapterInput, "id" | "revision" | "label" | "representation" | "sourceModule">): CurveIdentity => {
  const curveId = input.id.trim();
  if (!curveId) throw new Error("Curve ID is required.");
  const curveRevision = finiteRevision(input.revision);
  const sourceModule = input.sourceModule ?? "curves";
  return {
    curveId,
    curveRevision,
    representation: input.representation,
    sourceModule,
    key: `curve:${curveId}@${curveRevision}`,
    revision: String(curveRevision),
    label: input.label.trim() || curveId,
    sourceLabel: `${sourceModule}:${input.representation}:${input.label.trim() || curveId}`,
  };
};

export const adaptCurveDefinition = (input: CurveAdapterInput): CanonicalCurveDefinition => {
  validateDomain(input.domain);
  const samplingDefault = defaultSampling(input.representation);
  const derivativeDefault = defaultDerivatives(input.representation);
  const orientationDefault = defaultOrientation(input.representation);
  const sampling: CurveSamplingPolicy = {
    ...samplingDefault,
    ...input.sampling,
    strategy: input.sampling?.strategy ?? samplingDefault.strategy,
  };
  if (sampling.tolerance != null && (!Number.isFinite(sampling.tolerance) || sampling.tolerance <= 0)) {
    throw new Error("Curve sampling tolerance must be positive and finite.");
  }
  const units: CurveUnits = {
    position: input.units?.position?.trim() || "unit",
    parameter: input.units?.parameter?.trim() || "unitless",
    angle: input.units?.angle ?? "rad",
  };
  const orientation: CurveOrientation = {
    ...orientationDefault,
    ...input.orientation,
    convention: input.orientation?.convention ?? orientationDefault.convention,
    description: input.orientation?.description?.trim() || orientationDefault.description,
  };
  return {
    version: 1,
    fingerprint: curveAdapterFingerprint(input),
    identity: createCurveIdentity(input),
    representation: input.representation,
    dimension: input.dimension,
    domain: { ...input.domain },
    sampling,
    units,
    coordinateSystem: input.coordinateSystem?.trim() || "world-cartesian",
    orientation,
    derivatives: { ...derivativeDefault, ...input.derivatives },
    source: sourceFor(input),
    dependencies: [...(input.dependencies ?? [])],
    warnings: [...(input.warnings ?? [])],
  };
};

export const createCurveAnalysisRegistry = (
  definitions: readonly CurveAnalysisDefinition[] = DEFAULT_CURVE_ANALYSIS_DEFINITIONS
): CurveAnalysisRegistry => createAnalysisRegistry(definitions, "Curve analysis");

export const getCurveAnalysisDefinition = (
  registry: CurveAnalysisRegistry,
  kind: CurveResultKind,
  variant = "default"
): CurveAnalysisDefinition | null => getAnalysisDefinition(registry, kind, variant);

export const resolveCurveAnalysisDependencies = (
  registry: CurveAnalysisRegistry,
  store: CurveAnalysisResultStore,
  identity: CurveIdentity,
  kind: CurveResultKind,
  variant = "default"
): CurveAnalysisResultDependency[] => resolveAnalysisDependencies(registry, store, identity, kind, variant);

export const createCurveAnalysisResultStore = (): CurveAnalysisResultStore =>
  createAnalysisResultStore<CurveResultKind, CurveIdentity>();

export const upsertCurveAnalysisResult = <TPayload>(
  store: CurveAnalysisResultStore,
  options: Omit<UpsertAnalysisResultOptions<TPayload, CurveResultKind, CurveIdentity>, "identity"> & { identity: CurveIdentity }
): CurveAnalysisResultStore => upsertAnalysisResult(store, options, {
  lineageKey: (identity) => identity.curveId,
  defaultBackend: "Curve Analysis",
  maxResults: 48,
  maxHistory: 192,
});

export const getCurveAnalysisResult = <TPayload = CurveAnalysisPayload>(
  store: CurveAnalysisResultStore,
  identity: CurveIdentity | null | undefined,
  kind: CurveResultKind,
  variant = "default"
): CurveAnalysisResult<TPayload> | null => getAnalysisResult<TPayload, CurveResultKind, CurveIdentity>(store, identity, kind, variant);

export const getCurveAnalysisResultForParameters = <TPayload = CurveAnalysisPayload>(
  store: CurveAnalysisResultStore,
  identity: CurveIdentity | null | undefined,
  kind: CurveResultKind,
  parameters: AnalysisParameters,
  variant = "default"
): CurveAnalysisResult<TPayload> | null =>
  getAnalysisResultForParameters<TPayload, CurveResultKind, CurveIdentity>(store, identity, kind, parameters, variant);

export const invalidateCurveAnalysisResult = (
  store: CurveAnalysisResultStore,
  identity: CurveIdentity,
  kind: CurveResultKind,
  variant = "default",
  now = Date.now()
): CurveAnalysisResultStore => invalidateAnalysisResult(store, identity, kind, variant, now);

export const createCurveAnalysisRequest = (input: {
  requestId: string;
  kind: CurveResultKind;
  definition: CanonicalCurveDefinition;
  domain: CurveAnalysisDomain;
  method: CurveAnalysisMethod;
  parameters?: AnalysisParameters;
  requestedOutputs?: readonly string[];
  variant?: string;
}): CurveAnalysisRequest => ({
  version: 1,
  requestId: input.requestId,
  kind: input.kind,
  variant: input.variant ?? "default",
  identity: input.definition.identity,
  domain: input.domain,
  method: input.method,
  parameters: {
    ...input.parameters,
    curveId: input.definition.identity.curveId,
    curveRevision: input.definition.identity.curveRevision,
    representation: input.definition.representation,
    method: input.method,
  },
  requestedOutputs: [...(input.requestedOutputs ?? [])],
});

export const publishCurveAnalysisResult = (args: {
  store: CurveAnalysisResultStore;
  registry: CurveAnalysisRegistry;
  request: CurveAnalysisRequest;
  state?: "queued" | "running" | "ready" | "cancelled" | "deferred" | "stale" | "error";
  payload?: CurveAnalysisPayload | null;
  progress?: number | null;
  error?: string | null;
  computeTimeMs?: number | null;
  backend?: string;
  now?: number;
}): CurveAnalysisResultStore => {
  if (!getCurveAnalysisDefinition(args.registry, args.request.kind, args.request.variant)) {
    throw new Error(`Curve analysis ${args.request.kind}:${args.request.variant} is not registered.`);
  }
  const dependencies = resolveCurveAnalysisDependencies(
    args.registry,
    args.store,
    args.request.identity,
    args.request.kind,
    args.request.variant
  );
  return upsertCurveAnalysisResult(args.store, {
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

export const inspectCurveAnalysisResult = (
  result: CurveAnalysisResult<CurveAnalysisPayload>
): CurveResultInspection => ({
  resultKind: result.kind,
  state: result.state,
  curveId: result.identity.curveId,
  curveRevision: result.identity.curveRevision,
  representation: result.identity.representation,
  sourceModule: result.identity.sourceModule,
  method: result.payload?.method ?? (typeof result.parameters.method === "string" ? result.parameters.method as CurveAnalysisMethod : "unknown"),
  units: result.payload?.units ?? null,
  warnings: result.payload?.warnings ?? (result.error ? [result.error] : []),
  dependencyStates: result.dependencies.map((dependency) => ({
    kind: dependency.kind,
    state: dependency.state,
    resultVersion: dependency.resultVersion,
  })),
});
