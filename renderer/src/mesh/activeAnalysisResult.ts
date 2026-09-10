import type { MeshDiagnosticsAnalysisPayload } from "./analysisResultStore";
import type {
  AnalysisDomain,
  AnalysisFieldMetadata,
  AnalysisHistogramBin,
  AnalysisPaletteRangeMetadata,
  ScientificAnalysisResultSummary,
} from "../analysis/contracts";
import {
  summarizeAnalysisScalarField,
  type AnalysisScalarStatistics,
  type AnalysisScalarSummary,
} from "../analysis/statistics";
import type { MeshFieldCalculusResult } from "./meshSurfaceFieldCalculus";
import type { SurfaceFeatureClass, SurfaceFeatureExtractionResult } from "./surfaceFeatureExtraction";
import type { RidgeValleyExtractionResult } from "./ridgeValleyExtraction";
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
  | "surface-features"
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

export type MeshActiveAnalysisResultSummary = ScientificAnalysisResultSummary;
export type MeshCurvatureStatistics = AnalysisScalarStatistics;
export type MeshHistogramBin = AnalysisHistogramBin;
export type MeshCurvatureDetailedStatistics = AnalysisScalarSummary;
export const summarizeMeshScalarField = summarizeAnalysisScalarField;

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
  geodesicMethod: "graph" | "surface" | "heat";
  geodesicSourceMode: "selected-vertex" | "selected-point" | "selection-set";
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
  ridgeValleyResult: RidgeValleyExtractionResult | null;
  ridgeValleyCacheHit: boolean;
  ridgeValleyUpdatedAt: number | null;
  showCurvatureLines: boolean;
  surfaceFeatures: SurfaceFeatureExtractionResult | null;
  surfaceFeatureClass: SurfaceFeatureClass;
  surfaceFeatureCacheHit: boolean;
  surfaceFeatureUpdatedAt: number | null;
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
  meshRevision: string | null;
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

type BaseMeshActiveAnalysisResultSummary = {
  category: string | null;
  result: string;
  state: MeshActiveAnalysisResultSummary["state"];
  method?: string;
  domain?: string;
  statistics: Array<{ label: string; value: string }>;
  percentiles?: Array<{ label: string; value: string }>;
  extrema?: Array<{ label: string; value: string }>;
  histogram?: MeshHistogramBin[];
  metadata: Array<{ label: string; value: string }>;
  provenance?: Array<{ label: string; value: string }>;
  warnings?: string[];
};

const selectMeshActiveAnalysisResultBase = (
  input: MeshActiveAnalysisResultInput
): BaseMeshActiveAnalysisResultSummary => {
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
      percentiles: detailed ? [
        { label: "P05", value: formatNumber(detailed.p05) },
        { label: "P25", value: formatNumber(detailed.p25) },
        { label: "P50", value: formatNumber(detailed.median) },
        { label: "P75", value: formatNumber(detailed.p75) },
        { label: "P95", value: formatNumber(detailed.p95) },
      ] : [],
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
        {
          label: "Method",
          value:
            input.geodesicMethod === "surface"
              ? "CGAL triangulated-surface shortest path"
              : input.geodesicMethod === "graph"
                ? "Approximate edge-graph routing"
                : input.geodesicUseContinuous
                  ? "Continuous ODE (experimental)"
                  : "Heat distance (experimental)",
        },
        { label: "Source semantics", value: input.geodesicSourceMode.replaceAll("-", " ") },
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

  if (input.section === "surface-features") {
    const features = input.surfaceFeatures;
    return {
      category: "Surface Features",
      result: features ? `Feature classification: ${input.surfaceFeatureClass}` : "Feature classification",
      state: features ? "Ready" : input.deferred ? "Deferred" : "Unavailable",
      domain: features ? `${formatCount(features.summary.vertexCount)} vertices / ${formatCount(features.summary.faceCount)} faces` : undefined,
      statistics: features ? [
        { label: "Class members", value: formatCount(features.summary.classCounts[input.surfaceFeatureClass]) },
        { label: "Uncertain vertices", value: formatCount(features.summary.uncertainVertexCount) },
        { label: "Feature edges", value: formatCount(features.summary.featureEdgeCount) },
        { label: "Parabolic segments", value: formatCount(features.summary.parabolicSegmentCount) },
      ] : [],
      metadata: features ? [
        { label: "Dependencies", value: "normals → curvature → principal directions" },
        { label: "Cache", value: input.surfaceFeatureCacheHit ? "Cached result" : "Current result" },
        { label: "Computed", value: timestamp(input.surfaceFeatureUpdatedAt) },
        { label: "Gaussian zero tolerance", value: formatNumber(features.parameters.gaussianZeroTolerance) },
        { label: "Umbilic tolerance", value: formatNumber(features.parameters.umbilicTolerance) },
      ] : [],
    };
  }

  if (input.section === "curvature-lines" || input.section === "ridges-valleys") {
    const ridges = input.section === "ridges-valleys";
    const ridgeValley = input.ridgeValleyResult;
    return {
      category: "Surface Features",
      result: ridges ? "Ridges & valleys" : "Curvature lines",
      state: ridges
        ? ridgeValley?.summary.ready
          ? "Ready"
          : input.deferred ? "Deferred" : "Unavailable"
        : input.showCurvatureLines
          ? "Ready"
          : "Unavailable",
      statistics: ridges && ridgeValley ? [
        { label: "Ridge candidates", value: formatCount(ridgeValley.summary.ridgeCandidateCount) },
        { label: "Valley candidates", value: formatCount(ridgeValley.summary.valleyCandidateCount) },
        { label: "Ridge lines", value: formatCount(ridgeValley.summary.ridgeLineCount) },
        { label: "Valley lines", value: formatCount(ridgeValley.summary.valleyLineCount) },
        { label: "Uncertain suppressed", value: formatCount(ridgeValley.summary.uncertainVertexCount) },
      ] : [],
      metadata: ridges
        ? [
            { label: "Method", value: ridgeValley?.provenance.method ?? "Waiting for validated principal directions" },
            { label: "Dependencies", value: ridgeValley?.provenance.dependencies.join(" → ") ?? "normals → curvature → principal directions" },
            { label: "Principal families", value: ridgeValley ? `ridge ${ridgeValley.parameters.ridgeFamily}; valley ${ridgeValley.parameters.valleyFamily}` : "n/a" },
            { label: "Cache", value: input.ridgeValleyCacheHit ? "Cached result" : "Current result" },
            { label: "Computed", value: timestamp(input.ridgeValleyUpdatedAt) },
            {
              label: "Visible layers",
              value: [input.showRidges ? "Ridges" : null, input.showValleys ? "Valleys" : null].filter(Boolean).join(", ") || "none",
            },
          ]
        : [
            { label: "Direction field", value: input.curvatureLineField },
            { label: "Seed source", value: input.curvatureSeedSource },
            { label: "Max steps", value: formatCount(input.curvatureMaxSteps) },
          ],
    };
  }

  if (input.section === "chart-analysis") {
    const detailedStats = input.curvatureStats as MeshCurvatureDetailedStatistics | null;
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
      percentiles: detailedStats?.p05 != null ? [
        { label: "P05", value: formatNumber(detailedStats.p05) },
        { label: "P25", value: formatNumber(detailedStats.p25) },
        { label: "P50", value: formatNumber(detailedStats.median) },
        { label: "P75", value: formatNumber(detailedStats.p75) },
        { label: "P95", value: formatNumber(detailedStats.p95) },
      ] : [],
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
      percentiles: detailedStats ? [
        { label: "P05", value: formatNumber(detailedStats.p05) },
        { label: "P25", value: formatNumber(detailedStats.p25) },
        { label: "P50", value: formatNumber(detailedStats.median) },
        { label: "P75", value: formatNumber(detailedStats.p75) },
        { label: "P95", value: formatNumber(detailedStats.p95) },
      ] : [],
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

const defaultScientificMethod = (input: MeshActiveAnalysisResultInput): string => {
  switch (input.section) {
    case "differential-geometry": return "Discrete differential geometry";
    case "vector-calculus": return "Surface finite-element operator";
    case "curvature-lines": return "Principal-direction streamline integration";
    case "surface-features": return "Curvature classification and feature-edge extraction";
    case "ridges-valleys": return "Principal-curvature directional extrema";
    case "chart-analysis": return "Descriptive scalar statistics";
    case "mesh-quality": return "VTK/Verdict-compatible mesh quality";
    case "geodesics": return "Mesh path computation";
    case "diagnostics": return "Canonical mesh health validation";
  }
};

const backendForResult = (input: MeshActiveAnalysisResultInput): string => {
  if (input.section === "diagnostics") {
    if (input.diagnostics?.backend === "hybrid") return "Math3D + CGAL";
    if (input.diagnostics?.backend === "cgal") return "CGAL";
    return "Math3D";
  }
  if (input.section === "geodesics" && input.geodesicMethod === "surface") return "CGAL";
  if (input.section === "mesh-quality") return "Math3D quality worker";
  if (input.section === "vector-calculus" || input.section === "chart-analysis" || input.section === "curvature-lines") return "Renderer CPU";
  return "Mesh analysis worker";
};

const normalizeScientificResult = (
  base: BaseMeshActiveAnalysisResultSummary,
  input: MeshActiveAnalysisResultInput
): MeshActiveAnalysisResultSummary => {
  const metadataMethod = base.metadata.find((entry) => entry.label === "Method")?.value;
  const provenance = base.provenance?.slice() ?? [];
  const addProvenance = (label: string, value: string | null | undefined) => {
    if (!value || provenance.some((entry) => entry.label === label)) return;
    provenance.push({ label, value });
  };
  addProvenance("Backend", base.metadata.find((entry) => entry.label === "Backend")?.value ?? backendForResult(input));
  addProvenance("Revision", input.meshRevision ?? "current session");
  for (const label of ["Cache", "Cached", "Computed", "Dependencies", "Source semantics", "Scope"]) {
    addProvenance(label, base.metadata.find((entry) => entry.label === label)?.value);
  }

  const warnings = new Set(base.warnings ?? []);
  if (base.state === "Unavailable") warnings.add("No valid current result is available for this quantity.");
  if (input.section === "diagnostics") {
    for (const warning of input.diagnostics?.warnings ?? []) warnings.add(warning);
  }
  if (input.section === "surface-features" && input.surfaceFeatures?.summary.uncertainVertexCount) {
    warnings.add(`${formatCount(input.surfaceFeatures.summary.uncertainVertexCount)} uncertain vertices are flagged in this classification.`);
  }
  if (input.section === "ridges-valleys" && input.ridgeValleyResult?.summary.uncertainVertexCount) {
    warnings.add(`${formatCount(input.ridgeValleyResult.summary.uncertainVertexCount)} vertices with unstable directions were suppressed.`);
  }
  if (input.sphereSanity && !input.sphereSanity.ok) warnings.add("Sphere-reference curvature is outside tolerance.");
  if (input.qualityReport?.topology.degenerateFaceCount) {
    warnings.add(`${formatCount(input.qualityReport.topology.degenerateFaceCount)} degenerate faces are excluded or flagged.`);
  }

  const fieldDomain: AnalysisDomain = input.section === "mesh-quality"
    ? qualityMetricDefinition[input.qualityMetric].sampleKind === "faces"
      ? "face"
      : qualityMetricDefinition[input.qualityMetric].sampleKind === "edges"
        ? "edge"
        : "vertex"
    : input.section === "geodesics" || input.section === "curvature-lines" || input.section === "ridges-valleys"
      ? "path"
      : input.section === "diagnostics"
        ? "mesh"
        : input.section === "surface-features"
          ? "mixed"
          : "vertex";
  const field: AnalysisFieldMetadata = {
    id: `${input.section}:${base.result.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "overview"}`,
    label: base.result,
    domain: fieldDomain,
    valueType: input.section === "surface-features" || input.section === "diagnostics"
      ? "category"
      : input.section === "geodesics" || input.section === "curvature-lines" || input.section === "ridges-valleys"
        ? "geometry"
        : input.section === "vector-calculus" && !input.calculusLastResult
          ? "vector"
          : "scalar",
    source: input.meshLabel,
  };
  const statisticsRange = input.curvatureStats
    ? { min: input.curvatureStats.min, max: input.curvatureStats.max }
    : input.vectorMagnitudeRange;
  const display: AnalysisPaletteRangeMetadata | undefined = field.valueType === "scalar"
    ? {
        palette: input.curvaturePalette,
        inverted: input.curvaturePaletteInverted,
        rangeMode: input.curvatureClampRange ? "manual" : "automatic",
        range: input.curvatureClampRange ?? statisticsRange ?? null,
        percentileRange: [2, 98],
      }
    : undefined;

  return {
    ...base,
    quantity: base.result,
    method: base.method ?? metadataMethod ?? defaultScientificMethod(input),
    domain: base.domain ?? (input.meshStats
      ? `${formatCount(input.meshStats.vertCount)} vertices / ${formatCount(input.meshStats.triCount)} faces`
      : "current mesh"),
    percentiles: base.percentiles ?? [],
    provenance,
    warnings: [...warnings],
    field,
    display,
  };
};

export const selectMeshActiveAnalysisResult = (
  input: MeshActiveAnalysisResultInput
): MeshActiveAnalysisResultSummary => normalizeScientificResult(selectMeshActiveAnalysisResultBase(input), input);
