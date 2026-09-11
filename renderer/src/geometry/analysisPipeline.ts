import type { AnalysisParameters, AnalysisParameterValue } from "../analysis/contracts";
import type { UnifiedSelection } from "../selection/unifiedSelection";
import {
  analyzeExactCurve,
  type ExactCurveAnalysisResult,
  type GeometryAnalyticCurveDefinition,
} from "./exactCurveAnalysis";
import {
  analyzeExactSurface,
  type ExactSurfaceAnalysisResult,
  type GeometryAnalyticSurfaceDefinition,
} from "./exactSurfaceAnalysis";
import {
  analyzeIntrinsicGeometry,
  type IntrinsicGeometryResult,
  type IntrinsicParameterPoint,
} from "./intrinsicGeometry";
import {
  analyzeCharacteristicGeometry,
  type CharacteristicGeometryResult,
  type GeometryIntersectionProbe,
} from "./characteristicGeometry";
import {
  computeGeometryAnalysisBasicMetrics,
  computeGeometryAnalysisTopologySummary,
  type GeometryAnalysisBasicMetrics,
  type GeometryAnalysisSnapshot,
  type GeometryAnalysisTopologySummary,
  type GeometrySectionAnalysisSummary,
} from "./analysisBridge";
import {
  createGeometryAnalysisIdentity,
  geometryAnalysisResultKey,
  getGeometryAnalysisDefinition,
  getGeometryAnalysisResultForParameters,
  resolveGeometryAnalysisDependencies,
  upsertGeometryAnalysisResult,
  type GeometryAnalysisDomain,
  type GeometryAnalysisIdentity,
  type GeometryAnalysisRegistry,
  type GeometryAnalysisResult,
  type GeometryAnalysisResultKind,
  type GeometryAnalysisResultStore,
} from "./analysisInfrastructure";

export type GeometryAnalysisOutputKind =
  | "scalar"
  | "vector"
  | "curve"
  | "point"
  | "table"
  | "summary"
  | "warning";

type GeometryAnalysisOutputBase = {
  id: string;
  label: string;
  kind: GeometryAnalysisOutputKind;
  unit?: string;
};

export type GeometryAnalysisOutput =
  | (GeometryAnalysisOutputBase & { kind: "scalar"; value: number })
  | (GeometryAnalysisOutputBase & { kind: "vector"; value: readonly [number, number, number] })
  | (GeometryAnalysisOutputBase & { kind: "point"; value: readonly [number, number, number] })
  | (GeometryAnalysisOutputBase & { kind: "curve"; points: readonly (readonly [number, number, number])[]; closed: boolean })
  | (GeometryAnalysisOutputBase & { kind: "table"; columns: readonly string[]; rows: readonly (readonly AnalysisParameterValue[])[] })
  | (GeometryAnalysisOutputBase & { kind: "summary"; value: string })
  | (GeometryAnalysisOutputBase & { kind: "warning"; value: string; severity: "info" | "warning" | "error" });

export type GeometryAnalysisTargetMetadata = {
  objectId: string;
  objectLabel: string;
  sceneEntityId: string | null;
  sourceRevision: number;
  snapshotId: string;
};

export type GeometryAnalysisSelectionMetadata = {
  entityId: string;
  entityType: "object" | "face" | "edge" | "vertex" | "point" | "curve" | "surface";
  semanticEntityId: string | null;
  semanticKind: string | null;
  sourceRevision: number | null;
};

export type GeometryAnalysisSamplingMetadata = {
  strategy: "exact" | "mesh" | "adaptive" | "uniform";
  sampleCount?: number;
  tolerance?: number;
};

export type GeometryAnalysisPrecisionMetadata = {
  mode: "exact" | "double" | "adaptive";
  digits: number;
  tolerance: number;
};

export type GeometryAnalysisRequest = {
  id: string;
  kind: GeometryAnalysisResultKind;
  variant: string;
  target: GeometryAnalysisTargetMetadata;
  selection: GeometryAnalysisSelectionMetadata | null;
  domain: GeometryAnalysisDomain;
  sampling: GeometryAnalysisSamplingMetadata;
  parameters: AnalysisParameters;
  precision: GeometryAnalysisPrecisionMetadata;
  requestedOutputs: readonly GeometryAnalysisOutputKind[];
  createdAt: number;
};

export type GeometryAnalysisPayload = {
  request: GeometryAnalysisRequest;
  sourceSnapshot: GeometryAnalysisSnapshot;
  outputs: GeometryAnalysisOutput[];
  summary: Record<string, string | number | boolean | null>;
  warnings: string[];
  provenance: {
    backend: string;
    algorithm: string;
    sourceRevision: number;
    snapshotId: string;
  };
  selectionSnapshot?: UnifiedSelection | null;
  basicMetrics?: GeometryAnalysisBasicMetrics;
  topologySummary?: GeometryAnalysisTopologySummary;
  sectionSummary?: GeometrySectionAnalysisSummary;
  curveAnalysis?: ExactCurveAnalysisResult;
  surfaceAnalysis?: ExactSurfaceAnalysisResult;
  intrinsicGeometry?: IntrinsicGeometryResult;
  characteristicGeometry?: CharacteristicGeometryResult;
};

export type GeometryAnalysisExecutionContext = {
  sectionSummary?: GeometrySectionAnalysisSummary;
  exactCurve?: {
    definition: GeometryAnalyticCurveDefinition;
    parameter: number;
    sampleCount: number;
    tolerance: number;
  };
  exactSurface?: {
    definition: GeometryAnalyticSurfaceDefinition;
    u: number;
    v: number;
    uCount: number;
    vCount: number;
    normalCurvatureAngle: number;
    tolerance: number;
  };
  intrinsicGeometry?: {
    definition: GeometryAnalyticSurfaceDefinition;
    start: IntrinsicParameterPoint;
    destination: IntrinsicParameterPoint;
    evaluation: IntrinsicParameterPoint;
    sampleCount: number;
    gridResolution: number;
    tolerance: number;
    endpointSemantic?: "parameter" | "picked-surface-point";
  };
  characteristicGeometry?: {
    definition: GeometryAnalyticSurfaceDefinition;
    uCount: number;
    vCount: number;
    tolerance: number;
    viewDirection?: readonly [number, number, number];
    lightDirection?: readonly [number, number, number];
    isophoteLevel?: number;
    intersectionProbes?: GeometryIntersectionProbe[];
  };
};

export type GeometryAnalysisDomainImplementation = (args: {
  request: GeometryAnalysisRequest;
  snapshot: GeometryAnalysisSnapshot;
  context: GeometryAnalysisExecutionContext;
}) => Omit<GeometryAnalysisPayload, "request" | "sourceSnapshot" | "provenance"> & {
  algorithm: string;
  backend?: string;
};

export type GeometryAnalysisImplementationRegistry = ReadonlyMap<GeometryAnalysisResultKind, GeometryAnalysisDomainImplementation>;

const finiteRevision = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;

export const createGeometryAnalysisRequest = (input: {
  id: string;
  kind: GeometryAnalysisResultKind;
  snapshot: GeometryAnalysisSnapshot;
  sourceRevision: number;
  sceneEntityId?: string | null;
  selection?: GeometryAnalysisSelectionMetadata | null;
  domain: GeometryAnalysisDomain;
  sampling?: Partial<GeometryAnalysisSamplingMetadata>;
  parameters?: AnalysisParameters;
  precision?: Partial<GeometryAnalysisPrecisionMetadata>;
  requestedOutputs: readonly GeometryAnalysisOutputKind[];
  variant?: string;
  createdAt?: number;
}): GeometryAnalysisRequest => ({
  id: input.id,
  kind: input.kind,
  variant: input.variant?.trim() || "default",
  target: {
    objectId: input.snapshot.sourceObjectId,
    objectLabel: input.snapshot.sourceObjectName,
    sceneEntityId: input.sceneEntityId ?? null,
    sourceRevision: finiteRevision(input.sourceRevision),
    snapshotId: input.snapshot.id,
  },
  selection: input.selection ?? null,
  domain: input.domain,
  sampling: {
    strategy: input.sampling?.strategy ?? "mesh",
    ...(input.sampling?.sampleCount == null ? {} : { sampleCount: Math.max(1, Math.floor(input.sampling.sampleCount)) }),
    ...(input.sampling?.tolerance == null ? {} : { tolerance: Math.max(0, input.sampling.tolerance) }),
  },
  parameters: input.parameters ?? {},
  precision: {
    mode: input.precision?.mode ?? "double",
    digits: Math.max(1, Math.floor(input.precision?.digits ?? 12)),
    tolerance: Math.max(0, input.precision?.tolerance ?? 1e-9),
  },
  requestedOutputs: [...new Set(input.requestedOutputs)],
  createdAt: input.createdAt ?? Date.now(),
});

export const geometryAnalysisRequestParameters = (request: GeometryAnalysisRequest): AnalysisParameters => ({
  ...request.parameters,
  domain: request.domain,
  sampling: request.sampling as unknown as AnalysisParameterValue,
  precision: request.precision as unknown as AnalysisParameterValue,
  requestedOutputs: request.requestedOutputs,
  target: {
    objectId: request.target.objectId,
    sceneEntityId: request.target.sceneEntityId,
    sourceRevision: request.target.sourceRevision,
  },
  selection: request.selection as unknown as AnalysisParameterValue,
});

export const geometryAnalysisIdentityForRequest = (
  request: GeometryAnalysisRequest,
  snapshot: GeometryAnalysisSnapshot
): GeometryAnalysisIdentity => createGeometryAnalysisIdentity(snapshot, request.target.sourceRevision);

const tuple = (value: { x: number; y: number; z: number }): readonly [number, number, number] =>
  [value.x, value.y, value.z];

const builtinImplementationEntries: Array<[GeometryAnalysisResultKind, GeometryAnalysisDomainImplementation]> = [
  ["basic-metrics", ({ snapshot }) => {
    const basicMetrics = computeGeometryAnalysisBasicMetrics(snapshot.mesh);
    const outputs: GeometryAnalysisOutput[] = [
      { id: "volume", label: "Volume", kind: "scalar", value: basicMetrics.volume, unit: "scene-unit³" },
      { id: "area", label: "Area", kind: "scalar", value: basicMetrics.area, unit: "scene-unit²" },
    ];
    if (basicMetrics.centroid) outputs.push({ id: "centroid", label: "Centroid", kind: "point", value: tuple(basicMetrics.centroid), unit: "scene-unit" });
    if (basicMetrics.bounds) outputs.push({
      id: "bounds",
      label: "Bounds",
      kind: "table",
      columns: ["axis", "min", "max"],
      rows: [
        ["x", basicMetrics.bounds.min[0], basicMetrics.bounds.max[0]],
        ["y", basicMetrics.bounds.min[1], basicMetrics.bounds.max[1]],
        ["z", basicMetrics.bounds.min[2], basicMetrics.bounds.max[2]],
      ],
    });
    return {
      algorithm: "triangulated-object-metrics-v1",
      outputs,
      summary: { volume: basicMetrics.volume, area: basicMetrics.area },
      warnings: snapshot.readiness.notes.slice(0, 4),
      basicMetrics,
    };
  }],
  ["topology-summary", ({ snapshot }) => {
    const topologySummary = computeGeometryAnalysisTopologySummary(snapshot.mesh);
    const warnings = [...snapshot.readiness.notes];
    if (!topologySummary.manifold) warnings.unshift(`Non-manifold edges detected: ${topologySummary.nonManifoldEdgeCount}.`);
    return {
      algorithm: "triangle-incidence-topology-v1",
      outputs: [{
        id: "topology",
        label: "Topology",
        kind: "table",
        columns: ["quantity", "value"],
        rows: [
          ["vertices", topologySummary.vertexCount],
          ["edges", topologySummary.edgeCount],
          ["faces", topologySummary.faceCount],
          ["Euler characteristic", topologySummary.eulerCharacteristic],
          ["boundaries", topologySummary.boundaryCount],
          ["manifold", topologySummary.manifold],
        ],
      }],
      summary: {
        vertexCount: topologySummary.vertexCount,
        edgeCount: topologySummary.edgeCount,
        faceCount: topologySummary.faceCount,
        manifold: topologySummary.manifold,
      },
      warnings: warnings.slice(0, 4),
      topologySummary,
    };
  }],
  ["section-analysis", ({ snapshot, context }) => {
    if (!context.sectionSummary) throw new Error("Section analysis requires a valid section preview.");
    const sectionSummary = context.sectionSummary;
    return {
      algorithm: "geometry-section-measurement-v1",
      outputs: [
        { id: "section-length", label: "Section length", kind: "scalar", value: sectionSummary.sectionLength, unit: "scene-unit" },
        { id: "section-area", label: "Section enclosed area", kind: "scalar", value: sectionSummary.sectionEnclosedArea, unit: "scene-unit²" },
      ],
      summary: { sectionLength: sectionSummary.sectionLength, sectionEnclosedArea: sectionSummary.sectionEnclosedArea },
      warnings: snapshot.readiness.notes.slice(0, 4),
      sectionSummary,
    };
  }],
  ["curve-analysis", ({ context }) => {
    if (!context.exactCurve) throw new Error("Exact curve analysis requires an analytic curve definition.");
    const curveAnalysis = analyzeExactCurve(context.exactCurve);
    const point = curveAnalysis.point;
    const outputs: GeometryAnalysisOutput[] = [
      {
        id: "curve",
        label: curveAnalysis.definition.label,
        kind: "curve",
        points: curveAnalysis.visualization.curve,
        closed: curveAnalysis.definition.domain.closed,
        unit: curveAnalysis.definition.units.position,
      },
      { id: "speed", label: "Speed", kind: "scalar", value: point.speed, unit: `${curveAnalysis.definition.units.position}/${curveAnalysis.definition.units.parameter}` },
      { id: "position", label: "Position", kind: "point", value: point.position, unit: curveAnalysis.definition.units.position },
      {
        id: "pointwise",
        label: "Pointwise differential quantities",
        kind: "table",
        columns: ["quantity", "x/value", "y", "z"],
        rows: [
          ["r(t)", point.position[0], point.position[1], point.position[2]],
          ["r'(t)", point.derivative1[0], point.derivative1[1], point.derivative1[2]],
          ["r''(t)", point.derivative2[0], point.derivative2[1], point.derivative2[2]],
          ["r'''(t)", point.derivative3[0], point.derivative3[1], point.derivative3[2]],
          ["curvature", point.curvature, null, null],
          ["radius", point.radiusOfCurvature, null, null],
          ["torsion", point.torsion, null, null],
        ],
      },
      { id: "arc-length", label: "Arc length", kind: "scalar", value: curveAnalysis.arcLength.value, unit: curveAnalysis.definition.units.position },
    ];
    if (point.tangent) outputs.push({ id: "tangent", label: "Unit tangent", kind: "vector", value: point.tangent });
    if (point.normal) outputs.push({ id: "normal", label: "Unit normal", kind: "vector", value: point.normal });
    if (point.binormal) outputs.push({ id: "binormal", label: "Unit binormal", kind: "vector", value: point.binormal });
    curveAnalysis.warnings.forEach((warning, index) => outputs.push({
      id: `warning-${index}`,
      label: "Curve diagnostic",
      kind: "warning",
      value: warning,
      severity: "warning",
    }));
    return {
      algorithm: `analytic-curve-differential-v${curveAnalysis.definition.revision}`,
      backend: "Geometry exact curve core",
      outputs,
      summary: {
        parameter: point.t,
        speed: point.speed,
        curvature: point.curvature,
        radiusOfCurvature: point.radiusOfCurvature,
        torsion: point.torsion,
        arcLength: curveAnalysis.arcLength.value,
        stationary: point.stationary,
        degenerate: point.degenerate,
      },
      warnings: curveAnalysis.warnings,
      curveAnalysis,
    };
  }],
  ["surface-analysis", ({ context }) => {
    if (!context.exactSurface) throw new Error("Exact surface analysis requires an analytic surface definition.");
    const surfaceAnalysis = analyzeExactSurface(context.exactSurface);
    const point = surfaceAnalysis.point;
    const outputs: GeometryAnalysisOutput[] = [
      { id: "position", label: "Position", kind: "point", value: point.position, unit: surfaceAnalysis.definition.units.position },
      { id: "ru", label: "r_u", kind: "vector", value: point.derivativeU },
      { id: "rv", label: "r_v", kind: "vector", value: point.derivativeV },
      {
        id: "fundamental-forms",
        label: "Fundamental forms and shape operator",
        kind: "table",
        columns: ["matrix", "11", "12", "21", "22"],
        rows: [
          ["I / metric", point.metricTensor[0][0], point.metricTensor[0][1], point.metricTensor[1][0], point.metricTensor[1][1]],
          ["II", point.secondFundamentalForm.matrix?.[0][0] ?? null, point.secondFundamentalForm.matrix?.[0][1] ?? null, point.secondFundamentalForm.matrix?.[1][0] ?? null, point.secondFundamentalForm.matrix?.[1][1] ?? null],
          ["Shape", point.shapeOperator?.[0][0] ?? null, point.shapeOperator?.[0][1] ?? null, point.shapeOperator?.[1][0] ?? null, point.shapeOperator?.[1][1] ?? null],
        ],
      },
      { id: "jacobian", label: "Jacobian / area element", kind: "scalar", value: point.jacobian },
    ];
    if (point.normal) outputs.push({ id: "normal", label: "Oriented normal", kind: "vector", value: point.normal });
    if (point.principalDirections.d1) outputs.push({ id: "principal-d1", label: "Principal direction d1", kind: "vector", value: point.principalDirections.d1 });
    if (point.principalDirections.d2) outputs.push({ id: "principal-d2", label: "Principal direction d2", kind: "vector", value: point.principalDirections.d2 });
    for (const [id, label, value] of [
      ["k1", "Principal curvature k1", point.principalCurvatures.k1],
      ["k2", "Principal curvature k2", point.principalCurvatures.k2],
      ["H", "Mean curvature H", point.meanCurvature],
      ["K", "Gaussian curvature K", point.gaussianCurvature],
      ["normal-curvature", "Normal curvature", point.normalCurvature.value],
    ] as const) {
      if (value != null) outputs.push({ id, label, kind: "scalar", value, unit: `1/${surfaceAnalysis.definition.units.position}` });
    }
    outputs.push({ id: "classification", label: "Surface classification", kind: "summary", value: point.classification });
    surfaceAnalysis.warnings.forEach((warning, index) => outputs.push({ id: `warning-${index}`, label: "Surface diagnostic", kind: "warning", value: warning, severity: "warning" }));
    return {
      algorithm: `analytic-surface-differential-v${surfaceAnalysis.definition.revision}`,
      backend: "Geometry exact surface core",
      outputs,
      summary: {
        u: point.u,
        v: point.v,
        jacobian: point.jacobian,
        k1: point.principalCurvatures.k1,
        k2: point.principalCurvatures.k2,
        H: point.meanCurvature,
        K: point.gaussianCurvature,
        classification: point.classification,
        degenerate: point.degenerate,
      },
      warnings: surfaceAnalysis.warnings,
      surfaceAnalysis,
    };
  }],
  ["intrinsic-geometry", ({ context }) => {
    if (!context.intrinsicGeometry) throw new Error("Intrinsic geometry requires an analytic surface definition and endpoints.");
    const intrinsicGeometry = analyzeIntrinsicGeometry(context.intrinsicGeometry);
    const metric = intrinsicGeometry.metricPoint;
    const outputs: GeometryAnalysisOutput[] = [
      { id: "geodesic", label: "Preferred geodesic", kind: "curve", points: intrinsicGeometry.paths.find((path) => path.id === intrinsicGeometry.preferredPathId)?.points ?? [], closed: false },
      { id: "metric", label: "Metric tensor", kind: "table", columns: ["matrix", "11", "12", "21", "22"], rows: [["g", metric.metric[0][0], metric.metric[0][1], metric.metric[1][0], metric.metric[1][1]]] },
      { id: "christoffel-u", label: "Christoffel Γ^u", kind: "table", columns: ["matrix", "11", "12", "21", "22"], rows: [["Γ^u", metric.christoffel?.[0][0][0] ?? null, metric.christoffel?.[0][0][1] ?? null, metric.christoffel?.[0][1][0] ?? null, metric.christoffel?.[0][1][1] ?? null]] },
      { id: "jacobian", label: "Jacobian magnitude", kind: "scalar", value: metric.jacobianMagnitude },
      { id: "surface-area", label: "Surface area", kind: "scalar", value: intrinsicGeometry.surfaceArea, unit: "scene-unit²" },
      { id: "engine", label: "Geodesic engine", kind: "summary", value: `${intrinsicGeometry.engine.backend} · ${intrinsicGeometry.engine.algorithm}` },
    ];
    if (intrinsicGeometry.curveArcLength != null) outputs.push({ id: "arc-length", label: "Geodesic arc length", kind: "scalar", value: intrinsicGeometry.curveArcLength, unit: "scene-unit" });
    if (intrinsicGeometry.enclosedVolume != null) outputs.push({ id: "volume", label: "Enclosed volume", kind: "scalar", value: intrinsicGeometry.enclosedVolume, unit: "scene-unit³" });
    intrinsicGeometry.warnings.forEach((warning, index) => outputs.push({ id: `warning-${index}`, label: "Intrinsic diagnostic", kind: "warning", value: warning, severity: "warning" }));
    return {
      algorithm: intrinsicGeometry.engine.algorithm,
      backend: intrinsicGeometry.engine.backend,
      outputs,
      summary: {
        arcLength: intrinsicGeometry.curveArcLength,
        surfaceArea: intrinsicGeometry.surfaceArea,
        volume: intrinsicGeometry.enclosedVolume,
        jacobian: metric.jacobianMagnitude,
        anisotropy: metric.anisotropy,
        conditionNumber: metric.metricConditionNumber,
        pathCount: intrinsicGeometry.paths.length,
        exact: intrinsicGeometry.engine.exact,
      },
      warnings: intrinsicGeometry.warnings,
      intrinsicGeometry,
    };
  }],
  ["feature-analysis", ({ context }) => {
    if (!context.characteristicGeometry) throw new Error("Characteristic analysis requires an analytic surface definition.");
    const characteristicGeometry = analyzeCharacteristicGeometry(context.characteristicGeometry);
    const outputs: GeometryAnalysisOutput[] = characteristicGeometry.layers.map((entry) => entry.polylines.length
      ? { id: entry.id, label: entry.label, kind: "curve" as const, points: entry.polylines.flat(), closed: false }
      : { id: entry.id, label: entry.label, kind: "table" as const, columns: ["feature", "count", "confidence", "uncertainty"], rows: [[entry.feature, entry.points.length, entry.confidence, entry.uncertainty]] });
    outputs.push({ id: "intersection-types", label: "Intersection classifications", kind: "table", columns: ["pair", "type", "confidence", "uncertainty"], rows: characteristicGeometry.intersections.map((entry) => [entry.pair, entry.type, entry.confidence, entry.uncertainty]) });
    characteristicGeometry.warnings.forEach((warning, index) => outputs.push({ id: `warning-${index}`, label: "Characteristic diagnostic", kind: "warning", value: warning, severity: "warning" }));
    return {
      algorithm: "analytic-characteristic-geometry-v1",
      backend: "Geometry characteristic analysis core",
      outputs,
      summary: { ...characteristicGeometry.counts, singularityCount: characteristicGeometry.singularities.length, intersectionCount: characteristicGeometry.intersections.length, displayOnly: true },
      warnings: characteristicGeometry.warnings,
      characteristicGeometry,
    };
  }],
  ["differential-geometry", ({ snapshot }) => ({
    algorithm: "mesh-analyze-handoff-v1",
    outputs: [{ id: "handoff", label: "Mesh Analyze handoff", kind: "summary", value: "Analysis-ready mesh snapshot" }],
    summary: { handoff: "mesh-analyze", ready: true },
    warnings: snapshot.readiness.notes.slice(0, 4),
  })],
] as Array<[GeometryAnalysisResultKind, GeometryAnalysisDomainImplementation]>;

const builtinImplementations: GeometryAnalysisImplementationRegistry = new Map(builtinImplementationEntries);

export const DEFAULT_GEOMETRY_ANALYSIS_IMPLEMENTATIONS = builtinImplementations;

export const executeGeometryAnalysisRequest = (args: {
  store: GeometryAnalysisResultStore;
  registry: GeometryAnalysisRegistry;
  request: GeometryAnalysisRequest;
  snapshot: GeometryAnalysisSnapshot;
  context?: GeometryAnalysisExecutionContext;
  selectionSnapshot?: UnifiedSelection | null;
  implementations?: GeometryAnalysisImplementationRegistry;
  now?: number;
}): { store: GeometryAnalysisResultStore; result: GeometryAnalysisResult<GeometryAnalysisPayload>; cacheHit: boolean } => {
  const definition = getGeometryAnalysisDefinition(args.registry, args.request.kind, args.request.variant)
    ?? getGeometryAnalysisDefinition(args.registry, args.request.kind);
  if (!definition) throw new Error(`Geometry analysis ${args.request.kind}:${args.request.variant} is not registered.`);
  const identity = geometryAnalysisIdentityForRequest(args.request, args.snapshot);
  const parameters = geometryAnalysisRequestParameters(args.request);
  const registeredVariant = definition.variant ?? "default";
  const cached = getGeometryAnalysisResultForParameters<GeometryAnalysisPayload>(
    args.store,
    identity,
    args.request.kind,
    parameters,
    registeredVariant
  );
  if (cached) return { store: args.store, result: cached, cacheHit: true };

  const implementation = (args.implementations ?? DEFAULT_GEOMETRY_ANALYSIS_IMPLEMENTATIONS).get(args.request.kind);
  if (!implementation) throw new Error(`Geometry analysis ${args.request.kind} has no domain implementation.`);
  const dependencies = resolveGeometryAnalysisDependencies(
    args.registry,
    args.store,
    identity,
    args.request.kind,
    registeredVariant
  );
  const startedAt = args.now ?? Date.now();
  let nextStore = upsertGeometryAnalysisResult(args.store, {
    identity,
    kind: args.request.kind,
    variant: registeredVariant,
    state: "running",
    progress: 0,
    parameters,
    dependencies,
    backend: "Geometry analysis adapter",
    now: startedAt,
  });
  try {
    const computed = implementation({ request: args.request, snapshot: args.snapshot, context: args.context ?? {} });
    const finishedAt = args.now == null ? Date.now() : startedAt + 1;
    const backend = computed.backend ?? "Geometry analytical core";
    const payload: GeometryAnalysisPayload = {
      request: args.request,
      sourceSnapshot: args.snapshot,
      outputs: computed.outputs,
      summary: computed.summary,
      warnings: computed.warnings,
      ...(computed.basicMetrics ? { basicMetrics: computed.basicMetrics } : {}),
      ...(computed.topologySummary ? { topologySummary: computed.topologySummary } : {}),
      ...(computed.sectionSummary ? { sectionSummary: computed.sectionSummary } : {}),
      ...(computed.curveAnalysis ? { curveAnalysis: computed.curveAnalysis } : {}),
      ...(computed.surfaceAnalysis ? { surfaceAnalysis: computed.surfaceAnalysis } : {}),
      ...(computed.intrinsicGeometry ? { intrinsicGeometry: computed.intrinsicGeometry } : {}),
      ...(computed.characteristicGeometry ? { characteristicGeometry: computed.characteristicGeometry } : {}),
      provenance: {
        backend,
        algorithm: computed.algorithm,
        sourceRevision: args.request.target.sourceRevision,
        snapshotId: args.snapshot.id,
      },
      selectionSnapshot: args.selectionSnapshot ?? null,
    };
    nextStore = upsertGeometryAnalysisResult(nextStore, {
      identity,
      kind: args.request.kind,
      variant: registeredVariant,
      state: "ready",
      progress: 1,
      parameters,
      payload,
      dependencies,
      computeTimeMs: Math.max(0, finishedAt - startedAt),
      backend,
      now: finishedAt,
    });
    const result = nextStore.entries[
      geometryAnalysisResultKey(identity, args.request.kind, registeredVariant)
    ] as GeometryAnalysisResult<GeometryAnalysisPayload>;
    return { store: nextStore, result, cacheHit: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    nextStore = upsertGeometryAnalysisResult(nextStore, {
      identity,
      kind: args.request.kind,
      variant: registeredVariant,
      state: "error",
      parameters,
      dependencies,
      error: message,
      backend: "Geometry analysis adapter",
      now: args.now == null ? Date.now() : startedAt + 1,
    });
    const result = nextStore.entries[
      geometryAnalysisResultKey(identity, args.request.kind, registeredVariant)
    ] as GeometryAnalysisResult<GeometryAnalysisPayload>;
    return { store: nextStore, result, cacheHit: false };
  }
};
