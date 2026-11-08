import type {
  AnalysisParameters,
} from "../analysis/contracts";
import type {
  CanonicalSurfaceDefinition,
  SurfaceAnalysisMethod,
  SurfaceAnalysisPayload,
  SurfaceCurveLayerKind,
  SurfaceCurveLayersPayload,
  SurfaceCurveResultLayer,
  SurfaceFeatureLayerKind,
  SurfaceFeatureLayersPayload,
  SurfaceFeatureResultLayer,
  SurfaceLayerPolicy,
  SurfaceLayerSelectionSource,
} from "./contracts";

type Vec3 = readonly [number, number, number];

export const SURFACE_CURVE_LAYER_KINDS: readonly SurfaceCurveLayerKind[] = ["geodesic", "principal-k1", "principal-k2", "asymptotic", "level"];
export const SURFACE_FEATURE_LAYER_KINDS: readonly SurfaceFeatureLayerKind[] = ["ridge", "valley", "umbilic", "parabolic", "critical-point", "representation-singularity"];

export const DEFAULT_SURFACE_LAYER_POLICY: SurfaceLayerPolicy = {
  confidenceMinimum: 0,
  stopping: "Stop at boundary, singularity, invalid sample, tolerance failure, or configured maximum length.",
  branchPolicy: "Preserve deterministic branches and record each branch as a separate polyline.",
  periodicDomain: false,
  boundaryBehavior: "Stop unless the represented domain declares a periodic seam.",
  singularBehavior: "Stop and retain the final valid point; never interpolate through a singular region.",
};

const stableValue = (value: unknown): unknown => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stableValue(entry)]))
    : value;
const hash = (value: unknown): string => {
  const text = JSON.stringify(stableValue(value));
  let result = 2166136261;
  for (let index = 0; index < text.length; index += 1) result = Math.imul(result ^ text.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
};
const finitePoint = (point: Vec3) => point.length === 3 && point.every(Number.isFinite);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cleanLines = (lines: ReadonlyArray<ReadonlyArray<Vec3>>): Vec3[][] => lines.flatMap(line => {
  const runs: Vec3[][] = [];
  let run: Vec3[] = [];
  for (const point of line) {
    if (finitePoint(point)) run.push(point);
    else { if (run.length >= 2) runs.push(run); run = []; }
  }
  if (run.length >= 2) runs.push(run);
  return runs;
});
const cleanMappedLines = (lines: ReadonlyArray<ReadonlyArray<Vec3>>,
  parameters: ReadonlyArray<ReadonlyArray<readonly [number, number]>>) => {
  if (lines.length !== parameters.length)
    throw new TypeError("Surface layer parameter lines must match the geometry lines.");
  const polylines: Vec3[][] = [], parameterPolylines: Array<Array<readonly [number, number]>> = [];
  lines.forEach((line, lineIndex) => {
    const mapped = parameters[lineIndex];
    if (line.length !== mapped.length)
      throw new TypeError("Surface layer parameter points must match geometry points.");
    let spatial: Vec3[] = [], chart: Array<readonly [number, number]> = [];
    const flush = () => {
      if (spatial.length >= 2) { polylines.push(spatial); parameterPolylines.push(chart); }
      spatial = []; chart = [];
    };
    line.forEach((point, index) => {
      const uv = mapped[index]!;
      if (finitePoint(point) && uv.length === 2 && uv.every(Number.isFinite)) {
        spatial.push(point); chart.push(uv);
      } else flush();
    });
    flush();
  });
  return { polylines, parameterPolylines };
};
const lineStatistics = (lines: ReadonlyArray<ReadonlyArray<Vec3>>) => {
  const lengths = lines.map((line) => line.slice(1).reduce((sum, point, index) => sum + distance(line[index], point), 0));
  return {
    curveCount: lines.length,
    pointCount: lines.reduce((sum, line) => sum + line.length, 0),
    totalLength: lengths.reduce((sum, length) => sum + length, 0),
    minimumLength: lengths.length ? Math.min(...lengths) : null,
    maximumLength: lengths.length ? Math.max(...lengths) : null,
  };
};
const defaultSource: SurfaceLayerSelectionSource = { kind: "automatic", references: [] };

export const surfaceLayerMethod = (definition: CanonicalSurfaceDefinition, smoothMethod: SurfaceAnalysisMethod = "surface-sampling"): SurfaceAnalysisMethod =>
  definition.representation === "mesh-backed" ? "mesh-approximation" : smoothMethod;

export const createSurfaceCurveLayer = (args: {
  definition: CanonicalSurfaceDefinition;
  layerKind: SurfaceCurveLayerKind;
  label?: string;
  method?: SurfaceAnalysisMethod;
  parameters?: AnalysisParameters;
  selectionSource?: SurfaceLayerSelectionSource;
  policy?: Partial<SurfaceLayerPolicy>;
  polylines?: ReadonlyArray<ReadonlyArray<Vec3>>;
  parameterPolylines?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  warnings?: readonly string[];
  visible?: boolean;
}): SurfaceCurveResultLayer => {
  const cleaned = args.parameterPolylines
    ? cleanMappedLines(args.polylines ?? [], args.parameterPolylines)
    : { polylines: cleanLines(args.polylines ?? []), parameterPolylines: undefined };
  const { polylines, parameterPolylines } = cleaned;
  const inputPointCount = (args.polylines ?? []).reduce((sum, line) => sum + line.length, 0);
  const retainedPointCount = polylines.reduce((sum, line) => sum + line.length, 0);
  const omitted = inputPointCount - retainedPointCount;
  const method = surfaceLayerMethod(args.definition, args.method);
  const parameters = { ...(args.parameters ?? {}) };
  const selectionSource = args.selectionSource ?? defaultSource;
  const layerId = `${args.definition.identity.key}:curve:${args.layerKind}:${hash({ parameters, selectionSource })}`;
  return {
    layerId, identity: args.definition.identity, layerKind: args.layerKind, label: args.label ?? args.layerKind, state: polylines.length ? "ready" : "empty",
    visible: args.visible ?? true, selected: false, method, parameters, selectionSource,
    policy: { ...DEFAULT_SURFACE_LAYER_POLICY, periodicDomain: args.definition.domain.kind === "parameter" && (!!args.definition.domain.u.periodic || !!args.definition.domain.v.periodic), ...(args.policy ?? {}) },
    polylines, parameterPolylines, statistics: lineStatistics(polylines),
    warnings: [...(args.warnings ?? []),
      ...(omitted ? [`${omitted} invalid or isolated Surface sample(s) were omitted; disconnected runs remain separate.`] : []),
      ...(!polylines.length ? ["No computed polyline is currently available for this layer."] : [])],
  };
};

export const createSurfaceFeatureLayer = (args: {
  definition: CanonicalSurfaceDefinition;
  layerKind: SurfaceFeatureLayerKind;
  label?: string;
  method?: SurfaceAnalysisMethod;
  parameters?: AnalysisParameters;
  selectionSource?: SurfaceLayerSelectionSource;
  policy?: Partial<SurfaceLayerPolicy>;
  points?: readonly Vec3[];
  polylines?: ReadonlyArray<ReadonlyArray<Vec3>>;
  confidence?: ArrayLike<number>;
  warnings?: readonly string[];
  visible?: boolean;
}): SurfaceFeatureResultLayer => {
  const inputPoints = args.points ?? [];
  const retainedIndices = inputPoints.flatMap((point, index) => finitePoint(point) ? [index] : []);
  const points = retainedIndices.map(index => inputPoints[index]!);
  const polylines = cleanLines(args.polylines ?? []);
  if (args.confidence && args.confidence.length !== inputPoints.length)
    throw new TypeError("Surface feature confidence must match the input feature points.");
  if (args.confidence) for (let index = 0; index < args.confidence.length; index += 1) {
    const value = args.confidence[index];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
      throw new RangeError("Surface feature confidence must be finite and within [0, 1].");
  }
  const confidence = args.confidence
    ? Float32Array.from(retainedIndices.map(index => args.confidence![index]!))
    : new Float32Array();
  let confidenceSum = 0;
  for (const value of confidence) confidenceSum += value;
  const method = surfaceLayerMethod(args.definition, args.method);
  const parameters = { ...(args.parameters ?? {}) };
  const selectionSource = args.selectionSource ?? defaultSource;
  const layerId = `${args.definition.identity.key}:feature:${args.layerKind}:${hash({ parameters, selectionSource })}`;
  const populated = points.length > 0 || polylines.length > 0;
  return {
    layerId, identity: args.definition.identity, layerKind: args.layerKind, label: args.label ?? args.layerKind, state: populated ? "ready" : "empty",
    visible: args.visible ?? true, selected: false, method, parameters, selectionSource,
    policy: { ...DEFAULT_SURFACE_LAYER_POLICY, periodicDomain: args.definition.domain.kind === "parameter" && (!!args.definition.domain.u.periodic || !!args.definition.domain.v.periodic), ...(args.policy ?? {}) },
    points, polylines, confidence,
    statistics: { pointCount: points.length, curveCount: polylines.length, curvePointCount: polylines.reduce((sum, line) => sum + line.length, 0), meanConfidence: confidence.length ? confidenceSum / confidence.length : null },
    warnings: [...(args.warnings ?? []),
      ...(!args.confidence && points.length ? ["Feature point confidence is unavailable for this layer."] : []),
      ...(!populated ? ["No computed feature geometry is currently available for this layer."] : [])],
  };
};

export const createSurfaceLayersPayload = (args: {
  definition: CanonicalSurfaceDefinition;
  method: SurfaceAnalysisMethod;
  data: SurfaceCurveLayersPayload | SurfaceFeatureLayersPayload;
  warnings?: readonly string[];
}): SurfaceAnalysisPayload => ({
  version: 1, surfaceId: args.definition.identity.surfaceId, surfaceRevision: args.definition.identity.surfaceRevision,
  representation: args.definition.representation, method: surfaceLayerMethod(args.definition, args.method), units: args.definition.units,
  orientation: args.definition.orientation, warnings: [...new Set([...args.definition.warnings, ...(args.warnings ?? [])])], data: args.data,
});

export const updateSurfaceResultLayer = <T extends SurfaceCurveResultLayer | SurfaceFeatureResultLayer>(
  layers: readonly T[] | readonly SurfaceCurveResultLayer[] | readonly SurfaceFeatureResultLayer[],
  layerId: string,
  patch: Partial<Pick<T, "visible" | "selected">>
): Array<SurfaceCurveResultLayer | SurfaceFeatureResultLayer> => layers.map((layer) => layer.layerId === layerId ? { ...layer, ...patch } : patch.selected ? { ...layer, selected: false } : layer);

export const removeSurfaceResultLayer = (
  layers: readonly SurfaceCurveResultLayer[] | readonly SurfaceFeatureResultLayer[],
  layerId: string
): Array<SurfaceCurveResultLayer | SurfaceFeatureResultLayer> => layers.filter((layer) => layer.layerId !== layerId);

export const compareSurfaceResultLayers = (left: SurfaceCurveResultLayer | SurfaceFeatureResultLayer, right: SurfaceCurveResultLayer | SurfaceFeatureResultLayer) => ({
  sameKind: left.layerKind === right.layerKind,
  geometryCountDelta: "curveCount" in left.statistics && "curveCount" in right.statistics
    ? right.statistics.curveCount - left.statistics.curveCount
    : 0,
  warningCountDelta: right.warnings.length - left.warnings.length,
});
