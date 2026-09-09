import type { MeshDiagnosticsAnalysisPayload } from "./analysisResultStore";
import type { MeshFieldCalculusResult } from "./meshSurfaceFieldCalculus";
import {
  MESH_TRIANGLE_QUALITY_DEFINITIONS,
  meshTriangleQualityDefinition,
  type MeshQualityReport,
  type MeshTriangleQualityMetricKey,
} from "./meshQualityReport";

export type MeshAnalysisFocusedSection =
  | "differential-geometry"
  | "vector-calculus"
  | "curvature-lines"
  | "ridges-valleys"
  | "chart-analysis"
  | "mesh-quality"
  | "geodesics"
  | "diagnostics";

export type MeshQualityMetricKey = MeshTriangleQualityMetricKey
  | "edgeLength"
  | "vertexValence"
  | "dihedralAngleDeg";

export const MESH_QUALITY_METRIC_OPTIONS: ReadonlyArray<{
  id: MeshQualityMetricKey;
  label: string;
  shortLabel: string;
}> = [
  ...MESH_TRIANGLE_QUALITY_DEFINITIONS.map(({ id, label, shortLabel }) => ({ id, label, shortLabel })),
  { id: "edgeLength", label: "Edge length", shortLabel: "Edge" },
  { id: "vertexValence", label: "Vertex valence", shortLabel: "Valence" },
  { id: "dihedralAngleDeg", label: "Dihedral angle", shortLabel: "Dihedral" },
];

export type MeshActiveAnalysisResultSummary = {
  category: string | null;
  result: string;
  state: "Ready" | "Running" | "Deferred" | "Unavailable";
  method?: string;
  domain?: string;
  statistics: Array<{ label: string; value: string }>;
  extrema?: Array<{ label: string; value: string }>;
  histogram?: MeshHistogramBin[];
  metadata: Array<{ label: string; value: string }>;
};

export type MeshCurvatureStatistics = {
  min: number;
  max: number;
  mean: number;
  std: number;
  count: number;
};

export type MeshHistogramBin = {
  min: number;
  max: number;
  count: number;
};

export type MeshCurvatureDetailedStatistics = MeshCurvatureStatistics & {
  median: number;
  minIndex: number;
  maxIndex: number;
  histogram: MeshHistogramBin[];
};

export const summarizeMeshScalarField = (
  values: ArrayLike<number> | null | undefined,
  selected?: ArrayLike<number | boolean> | null,
  requestedBinCount = 12
): MeshCurvatureDetailedStatistics | null => {
  if (!values?.length) return null;
  const useSelection = !!selected && selected.length === values.length;
  const samples: Array<{ value: number; index: number }> = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let minIndex = -1;
  let maxIndex = -1;
  let sum = 0;
  let sumSquares = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (useSelection && !selected[index]) continue;
    const value = Number(values[index]);
    if (!Number.isFinite(value)) continue;
    samples.push({ value, index });
    sum += value;
    sumSquares += value * value;
    if (value < min) {
      min = value;
      minIndex = index;
    }
    if (value > max) {
      max = value;
      maxIndex = index;
    }
  }

  if (!samples.length) return null;
  const count = samples.length;
  const mean = sum / count;
  const std = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
  const sorted = samples.map((sample) => sample.value).sort((a, b) => a - b);
  const middle = Math.floor(count / 2);
  const median = count % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  const binCount = Number.isFinite(requestedBinCount)
    ? Math.max(1, Math.min(32, Math.round(requestedBinCount)))
    : 12;
  const span = max - min;
  const histogram = Array.from({ length: binCount }, (_, index) => ({
    min: span > 0 ? min + (span * index) / binCount : min,
    max: span > 0 ? min + (span * (index + 1)) / binCount : max,
    count: 0,
  }));
  for (const sample of samples) {
    const binIndex = span > 0
      ? Math.min(binCount - 1, Math.floor(((sample.value - min) / span) * binCount))
      : 0;
    histogram[binIndex].count += 1;
  }

  return { min, max, mean, median, std, count, minIndex, maxIndex, histogram };
};

export type MeshSphereSanitySummary = {
  ok: boolean;
  expectedK: number;
  expectedH: number;
  measuredK: number | null;
  measuredH: number | null;
};

export type MeshActiveAnalysisResultInput = {
  section: MeshAnalysisFocusedSection;
  deferred: boolean;
  qualityMetric: MeshQualityMetricKey;
  qualityReport: MeshQualityReport | null;
  qualityBusy: boolean;
  qualityThreshold: number;
  qualityCacheHit: boolean;
  qualityUpdatedAt: number | null;
  qualityEdgeCount: number | null;
  geodesicBusy: boolean;
  geodesicLength: number | null;
  geodesicUseContinuous: boolean;
  geodesicHasStart: boolean;
  geodesicHasEnd: boolean;
  diagnostics: MeshDiagnosticsAnalysisPayload | null;
  diagnosticsMode: "none" | "boundary" | "duplicates" | "boundary-clean" | "duplicates-clean";
  diagnosticsUpdatedAt: number | null;
  vectorMagnitudeRange: { min: number; max: number } | null;
  showGaussMap: boolean;
  calculusActiveVectorField: string;
  calculusScalarSource: string;
  calculusVectorSource: string;
  calculusLastResult: MeshFieldCalculusResult | null;
  calculusCacheHit: boolean;
  calculusUpdatedAt: number | null;
  showRidges: boolean;
  showValleys: boolean;
  showCurvatureLines: boolean;
  curvatureLineField: "d1" | "d2";
  curvatureSeedSource: "global" | "selection";
  curvatureMaxSteps: number;
  curvatureField: "K" | "H" | "k1" | "k2" | null;
  curvatureFieldLabel: string | null;
  curvatureStats: MeshCurvatureStatistics | null;
  curvatureRangeSource: string;
  curvatureClampRange: { min: number; max: number } | null;
  curvaturePalette: string;
  curvaturePaletteInverted: boolean;
  curvatureCacheReady: boolean;
  curvatureUpdatedAt: number | null;
  curvatureComputationMs: number | null;
  sphereSanity: MeshSphereSanitySummary | null;
  meshStats: { vertCount: number; triCount: number } | null;
  meshLabel: string;
  formatTimestamp?: (value: number | null) => string;
};

const formatNumber = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "n/a" : value.toFixed(4);

const formatCount = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "n/a" : Math.max(0, Math.round(value)).toLocaleString();

const qualityMetricDefinition: Record<
  MeshQualityMetricKey,
  { label: string; method: string; unit: string; sampleKind: "faces" | "edges" | "vertices" }
> = {
  triangleArea: {
    label: "Triangle area",
    method: meshTriangleQualityDefinition("triangleArea").method,
    unit: "mesh units^2",
    sampleKind: "faces",
  },
  aspectRatio: {
    label: "Aspect ratio",
    method: meshTriangleQualityDefinition("aspectRatio").method,
    unit: "ratio",
    sampleKind: "faces",
  },
  edgeRatio: {
    label: "Edge ratio",
    method: meshTriangleQualityDefinition("edgeRatio").method,
    unit: "ratio",
    sampleKind: "faces",
  },
  minimumAngleDeg: {
    label: "Minimum angle",
    method: meshTriangleQualityDefinition("minimumAngleDeg").method,
    unit: "degrees",
    sampleKind: "faces",
  },
  maximumAngleDeg: {
    label: "Maximum angle",
    method: meshTriangleQualityDefinition("maximumAngleDeg").method,
    unit: "degrees",
    sampleKind: "faces",
  },
  radiusRatio: {
    label: "Radius ratio",
    method: meshTriangleQualityDefinition("radiusRatio").method,
    unit: "ratio",
    sampleKind: "faces",
  },
  scaledJacobian: {
    label: "Scaled Jacobian",
    method: meshTriangleQualityDefinition("scaledJacobian").method,
    unit: "normalized",
    sampleKind: "faces",
  },
  edgeLength: {
    label: "Edge length",
    method: "Euclidean mesh edge length",
    unit: "mesh units",
    sampleKind: "edges",
  },
  vertexValence: {
    label: "Vertex valence",
    method: "Incident edge count per vertex",
    unit: "count",
    sampleKind: "vertices",
  },
  dihedralAngleDeg: {
    label: "Dihedral angle",
    method: "Angle between adjacent face normals",
    unit: "degrees",
    sampleKind: "edges",
  },
};

export const selectMeshActiveAnalysisResult = (
  input: MeshActiveAnalysisResultInput
): MeshActiveAnalysisResultSummary => {
  const timestamp =
    input.formatTimestamp ??
    ((value: number | null) => (value == null ? "Current session" : new Date(value).toLocaleString()));

  if (input.section === "mesh-quality") {
    const definition = qualityMetricDefinition[input.qualityMetric];
    const summary = input.qualityReport?.metrics[input.qualityMetric] ?? null;
    const values = input.qualityReport
      ? definition.sampleKind === "faces"
        ? input.qualityReport.fields.face[input.qualityMetric as MeshTriangleQualityMetricKey]
        : definition.sampleKind === "vertices"
          ? input.qualityReport.fields.vertexValence
          : input.qualityMetric === "edgeLength"
            ? input.qualityReport.fields.edgeLength
            : input.qualityReport.fields.dihedralAngleDeg
      : null;
    const detailed = summarizeMeshScalarField(values);
    const sampleCount = detailed?.count ??
      (definition.sampleKind === "faces"
        ? input.qualityReport?.faceCount
        : definition.sampleKind === "vertices"
          ? input.qualityReport?.vertexCount
          : input.qualityEdgeCount);
    const statistics = [
      { label: "Minimum", value: formatNumber(summary?.min) },
      { label: "Mean", value: formatNumber(summary?.avg) },
      { label: "Median", value: formatNumber(detailed?.median) },
      { label: "σ (sigma)", value: formatNumber(detailed?.std) },
      { label: "Maximum", value: formatNumber(summary?.max) },
      { label: "Samples", value: formatCount(sampleCount) },
    ];
    if (input.qualityMetric === "aspectRatio") {
      statistics.push({
        label: "Listed high-aspect faces",
        value: formatCount(input.qualityReport?.defects.highAspectFaces.length),
      });
    } else if (input.qualityMetric === "triangleArea") {
      statistics.push({
        label: "Degenerate faces",
        value: formatCount(input.qualityReport?.topology.degenerateFaceCount),
      });
    }
    return {
      category: "Mesh Quality",
      result: definition.label,
      state: input.qualityBusy ? "Running" : input.qualityReport ? "Ready" : input.deferred ? "Deferred" : "Unavailable",
      method: definition.method,
      domain: `${formatCount(sampleCount)} ${definition.sampleKind}`,
      statistics,
      extrema: detailed ? [
        { label: "Minimum", value: `${definition.sampleKind === "faces" ? "Face" : definition.sampleKind === "edges" ? "Edge" : "Vertex"} ${detailed.minIndex}` },
        { label: "Maximum", value: `${definition.sampleKind === "faces" ? "Face" : definition.sampleKind === "edges" ? "Edge" : "Vertex"} ${detailed.maxIndex}` },
      ] : undefined,
      histogram: detailed?.histogram,
      metadata: [
        { label: "Method", value: definition.method },
        { label: "Units", value: definition.unit },
        ...(input.qualityMetric === "aspectRatio"
          ? [{ label: "High-aspect threshold", value: formatNumber(input.qualityThreshold) }]
          : []),
        { label: "Scope", value: "whole mesh" },
        { label: "Cache", value: input.qualityCacheHit ? "Cached result" : "Current result" },
        { label: "Computed", value: timestamp(input.qualityUpdatedAt) },
      ],
    };
  }

  if (input.section === "geodesics") {
    return {
      category: "Distances & Geodesics",
      result: "Geodesic distance",
      state: input.geodesicBusy ? "Running" : input.geodesicLength != null ? "Ready" : "Unavailable",
      statistics: [{ label: "Path length", value: formatNumber(input.geodesicLength) }],
      metadata: [
        { label: "Method", value: input.geodesicUseContinuous ? "Continuous heat method" : "Mesh graph / heat method" },
        { label: "Endpoint state", value: input.geodesicHasStart && input.geodesicHasEnd ? "Two endpoints" : "Awaiting endpoints" },
      ],
    };
  }

  if (input.section === "diagnostics") {
    const result =
      input.diagnosticsMode === "boundary" || input.diagnosticsMode === "boundary-clean"
        ? "Boundary edges"
        : input.diagnosticsMode === "duplicates" || input.diagnosticsMode === "duplicates-clean"
          ? "Coincident vertices"
          : "Mesh diagnostics";
    return {
      category: "Topology & Integrity",
      result,
      state: input.diagnostics ? "Ready" : input.deferred ? "Deferred" : "Unavailable",
      statistics: [
        { label: "Boundary edges", value: formatCount(input.diagnostics?.boundaryEdgeCount) },
        { label: "Non-manifold edges", value: formatCount(input.diagnostics?.nonManifoldEdgeCount) },
        { label: "Degenerate triangles", value: formatCount(input.diagnostics?.degenerateTriangleCount) },
        { label: "Self intersections", value: formatCount(input.diagnostics?.selfIntersectionPairs) },
      ],
      metadata: [
        { label: "Method", value: input.diagnostics?.backend === "hybrid" ? "Math3D + CGAL state check" : "Math3D state check" },
        { label: "State check", value: input.diagnostics?.state ?? "Unverified" },
        { label: "Computed", value: timestamp(input.diagnosticsUpdatedAt) },
      ],
    };
  }

  if (input.section === "vector-calculus") {
    const calculus = input.calculusLastResult;
    const method = calculus?.operator === "laplacian"
      ? "Cotangent Laplace-Beltrami"
      : calculus?.operator === "gradient"
        ? "Piecewise-linear face gradient"
        : calculus?.operator === "divergence"
          ? "Weak FEM surface divergence"
          : calculus?.operator === "normal-curl"
            ? "Oriented weak FEM normal-curl"
            : undefined;
    return {
      category: "Vector Calculus",
      result: input.showGaussMap ? "Gauss map" : calculus ? `${calculus.operator}(${calculus.source})` : input.calculusActiveVectorField || "Vector field",
      state: calculus || input.vectorMagnitudeRange || input.showGaussMap ? "Ready" : "Unavailable",
      method,
      domain: calculus ? `${formatCount(calculus.validCount)} / ${formatCount(calculus.validMask.length)} vertices` : undefined,
      statistics: [
        { label: "Magnitude minimum", value: formatNumber(input.vectorMagnitudeRange?.min) },
        { label: "Magnitude maximum", value: formatNumber(input.vectorMagnitudeRange?.max) },
        ...(calculus ? [{ label: "Valid vertices", value: formatCount(calculus.validCount) }] : []),
      ],
      metadata: [
        { label: "Scalar source", value: input.calculusScalarSource },
        { label: "Vector source", value: input.calculusVectorSource || "none" },
        { label: "Gauss map", value: input.showGaussMap ? "Visible" : "Hidden" },
        ...(calculus ? [
          { label: "Mass", value: calculus.conventions.mass },
          { label: "Boundary", value: calculus.conventions.boundary },
          ...(calculus.operator === "normal-curl" ? [{ label: "Curl convention", value: calculus.conventions.normalCurl }] : []),
          { label: "Cache", value: input.calculusCacheHit ? "Cached result" : "Current result" },
          { label: "Computed", value: timestamp(input.calculusUpdatedAt) },
        ] : []),
      ],
    };
  }

  if (input.section === "curvature-lines" || input.section === "ridges-valleys") {
    const ridges = input.section === "ridges-valleys";
    return {
      category: "Surface Features",
      result: ridges ? "Ridges & valleys" : "Curvature lines",
      state: ridges
        ? input.showRidges || input.showValleys
          ? "Ready"
          : "Unavailable"
        : input.showCurvatureLines
          ? "Ready"
          : "Unavailable",
      statistics: [],
      metadata: ridges
        ? [{
            label: "Visible layers",
            value: [input.showRidges ? "Ridges" : null, input.showValleys ? "Valleys" : null].filter(Boolean).join(", ") || "none",
          }]
        : [
            { label: "Direction field", value: input.curvatureLineField },
            { label: "Seed source", value: input.curvatureSeedSource },
            { label: "Max steps", value: formatCount(input.curvatureMaxSteps) },
          ],
    };
  }

  if (input.section === "chart-analysis") {
    return {
      category: "Charts & Statistics",
      result: input.curvatureFieldLabel ?? "Field statistics",
      state: input.curvatureStats ? "Ready" : "Unavailable",
      statistics: input.curvatureStats
        ? [
            { label: "Minimum", value: formatNumber(input.curvatureStats.min) },
            { label: "Maximum", value: formatNumber(input.curvatureStats.max) },
            { label: "Mean", value: formatNumber(input.curvatureStats.mean) },
            { label: "Standard deviation", value: formatNumber(input.curvatureStats.std) },
          ]
        : [],
      metadata: [{ label: "Scope", value: input.curvatureRangeSource }],
    };
  }

  if (input.curvatureField && input.curvatureFieldLabel) {
    const method = input.curvatureField === "K"
      ? "Angle defect"
      : input.curvatureField === "H"
        ? "Cotangent Laplacian"
        : "Derived from K and H";
    const detailedStats = input.curvatureStats as MeshCurvatureDetailedStatistics | null;
    return {
      category: "Differential Geometry",
      result: input.curvatureFieldLabel,
      state: input.curvatureStats ? "Ready" : input.deferred ? "Deferred" : "Unavailable",
      method,
      domain: input.curvatureStats ? `${formatCount(input.curvatureStats.count)} vertices` : "No samples",
      statistics: input.curvatureStats
        ? [
            { label: "Minimum", value: formatNumber(input.curvatureStats.min) },
            { label: "Maximum", value: formatNumber(input.curvatureStats.max) },
            { label: "Mean", value: formatNumber(input.curvatureStats.mean) },
            { label: "Median", value: formatNumber(detailedStats?.median) },
            { label: "σ (sigma)", value: formatNumber(input.curvatureStats.std) },
          ]
        : [],
      extrema: detailedStats
        ? [
            { label: "Minimum", value: `Vertex ${formatCount(detailedStats.minIndex)}` },
            { label: "Maximum", value: `Vertex ${formatCount(detailedStats.maxIndex)}` },
          ]
        : undefined,
      histogram: detailedStats?.histogram,
      metadata: [
        { label: "Backend", value: "Renderer CPU" },
        { label: "Time", value: input.curvatureComputationMs == null ? "n/a" : `${input.curvatureComputationMs.toFixed(2)} ms` },
        { label: "Cached", value: input.curvatureCacheReady ? "Yes" : "No" },
        { label: "Scope", value: input.curvatureRangeSource },
        {
          label: "Display range",
          value: input.curvatureClampRange
            ? `${formatNumber(input.curvatureClampRange.min)} to ${formatNumber(input.curvatureClampRange.max)} (clamped)`
            : "Automatic",
        },
        { label: "Palette", value: `${input.curvaturePalette}${input.curvaturePaletteInverted ? " (inverted)" : ""}` },
        { label: "Computed", value: timestamp(input.curvatureUpdatedAt) },
        ...(input.sphereSanity
          ? [{
              label: "Sphere reference",
              value: `${input.sphereSanity.ok ? "Within tolerance" : "Review"}; K ${formatNumber(input.sphereSanity.measuredK)} / ${formatNumber(input.sphereSanity.expectedK)}, H ${formatNumber(input.sphereSanity.measuredH)} / ${formatNumber(input.sphereSanity.expectedH)}`,
            }]
          : []),
      ],
    };
  }

  return {
    category: null,
    result: "Overview",
    state: input.meshStats ? "Ready" : input.deferred ? "Deferred" : "Unavailable",
    statistics: input.meshStats
      ? [
          { label: "Vertices", value: formatCount(input.meshStats.vertCount) },
          { label: "Faces", value: formatCount(input.meshStats.triCount) },
        ]
      : [],
    metadata: [{ label: "Mesh", value: input.meshLabel }],
  };
};
