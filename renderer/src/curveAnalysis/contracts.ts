import type {
  AnalysisIdentity,
  AnalysisParameters,
  AnalysisResultState,
} from "../analysis/contracts";

export type CurveRepresentation =
  | "parametric"
  | "explicit"
  | "implicit"
  | "polar"
  | "bezier"
  | "b-spline"
  | "nurbs"
  | "polyline"
  | "curve-on-surface"
  | "derived";

export type CurveAnalysisMethod =
  | "analytic"
  | "symbolic"
  | "automatic-differentiation"
  | "numerical-derivatives"
  | "polyline-estimate"
  | "vtk"
  | "cgal";

export type CurveResultKind =
  | "curve-definition"
  | "curve-samples"
  | "differential-geometry"
  | "curve-probe"
  | "curve-diagnostics"
  | "curve-continuity"
  | "curve-intersections"
  | "derived-curve"
  | "derived-curve-mesh"
  | "curve-comparison"
  | "curve-report"
  | (string & {});

export type CurveAnalysisDomain =
  | "curve"
  | "point"
  | "segment"
  | "control"
  | "path"
  | "derived-mesh"
  | "mixed";

export type CurveParameterDomain = {
  parameter: string;
  min: number;
  max: number;
  closed: boolean;
  periodic: boolean;
};

export type CurveSamplingStrategy =
  | "uniform-parameter"
  | "adaptive"
  | "curvature-aware"
  | "tangent-angle-aware"
  | "uniform-arc-length"
  | "source-samples";

export type CurveSamplingPolicy = {
  strategy: CurveSamplingStrategy;
  tolerance?: number;
  angularTolerance?: number;
  curvatureThreshold?: number;
  minimumSamples?: number;
  maximumSamples?: number;
  maximumDepth?: number;
};

export type CurveUnits = {
  position: string;
  parameter: string;
  angle: "rad" | "deg";
};

export type CurveOrientation = {
  convention: "increasing-parameter" | "polyline-order" | "source-defined";
  description: string;
  planeNormal?: readonly [number, number, number];
};

export type CurveDerivativeAvailability = "exact" | "provided" | "sampled" | "unavailable";

export type CurveDerivativeCapabilities = {
  position: "exact" | "provided" | "sampled";
  first: CurveDerivativeAvailability;
  second: CurveDerivativeAvailability;
  third: CurveDerivativeAvailability;
  arcLength: "closed-form" | "quadrature" | "polyline" | "unavailable";
};

export type CurveIdentity = AnalysisIdentity & {
  curveId: string;
  curveRevision: number;
  representation: CurveRepresentation;
  sourceModule: "curves" | "geometry" | "surfaces" | "mesh";
};

export type CurveDependency = {
  module: "curves" | "geometry" | "surfaces" | "mesh";
  objectId: string;
  revision: string;
  relation: string;
  correspondence?: string;
};

export type CurveDefinitionSource = {
  familyId: string;
  expressions?: Readonly<Record<string, string>>;
  settings?: Readonly<Record<string, number | string | boolean | null>>;
  sourceIds?: readonly string[];
  pointCount?: number;
  controlPointCount?: number;
  controlPoints?: readonly (readonly number[])[];
  knots?: readonly number[];
  weights?: readonly number[];
  surfaceLink?: { surfaceId: string; surfaceRevision: number };
};

export type CanonicalCurveDefinition = {
  version: 1;
  fingerprint: string;
  identity: CurveIdentity;
  representation: CurveRepresentation;
  dimension: 2 | 3;
  domain: CurveParameterDomain;
  sampling: CurveSamplingPolicy;
  units: CurveUnits;
  coordinateSystem: string;
  orientation: CurveOrientation;
  derivatives: CurveDerivativeCapabilities;
  source: CurveDefinitionSource;
  dependencies: CurveDependency[];
  warnings: string[];
};

export type CurveSamplePayload = {
  kind: "samples";
  sampleCount: number;
  parameters: Float64Array;
  arcLengths?: Float64Array;
  positions: Float64Array;
  validityMask: Uint8Array;
};

export type CurveDifferentialFieldPayload = {
  kind: "differential";
  sampleCount: number;
  parameters: Float64Array;
  positions: Float64Array;
  firstDerivatives: Float64Array;
  secondDerivatives: Float64Array;
  thirdDerivatives: Float64Array;
  speed: Float64Array;
  curvature: Float64Array;
  torsion: Float64Array;
  tangent: Float64Array;
  normal: Float64Array;
  binormal: Float64Array;
  validityMask: Uint8Array;
  uncertaintyMask: Uint8Array;
};

export type CurveProbePayload = {
  kind: "probe";
  probeId: string;
  parameter: number;
  normalizedParameter: number;
  normalizedArcLength?: number;
  position: readonly [number, number, number];
  tangent: readonly [number, number, number] | null;
  normal: readonly [number, number, number] | null;
  binormal: readonly [number, number, number] | null;
  speed: number | null;
  curvature: number | null;
  torsion: number | null;
  valid: boolean;
  missing: Readonly<Record<string, string>>;
};

export type CurveDiagnosticSeverity = "ok" | "info" | "warning" | "error";

export type CurveDiagnosticEntry = {
  id: string;
  severity: CurveDiagnosticSeverity;
  code: string;
  message: string;
  parameterInterval?: readonly [number, number];
};

export type CurveDiagnosticsPayload = {
  kind: "diagnostics";
  status: CurveDiagnosticSeverity;
  entries: readonly CurveDiagnosticEntry[];
};

export type CurveDerivedPayload = {
  kind: "derived-curve";
  curveId: string;
  operation: string;
  branchCount: number;
  sourceIds: readonly string[];
};

export type CurveMeshPayload = {
  kind: "derived-curve-mesh";
  meshId: string;
  outputMode: "points" | "polyline" | "tube" | "ribbon" | "swept-profile" | "frame-glyphs";
  vertexCount: number;
  faceCount: number;
  sourceCurveRevision: number;
};

export type CurveAnalysisPayload = {
  version: 1;
  curveId: string;
  curveRevision: number;
  representation: CurveRepresentation;
  method: CurveAnalysisMethod;
  units: CurveUnits;
  orientation: CurveOrientation;
  warnings: string[];
  data:
    | CurveSamplePayload
    | CurveDifferentialFieldPayload
    | CurveProbePayload
    | CurveDiagnosticsPayload
    | CurveDerivedPayload
    | CurveMeshPayload
    | { kind: "summary"; values: Readonly<Record<string, number | string | boolean | null>> };
};

export type CurveAnalysisRequest = {
  version: 1;
  requestId: string;
  kind: CurveResultKind;
  variant: string;
  identity: CurveIdentity;
  domain: CurveAnalysisDomain;
  method: CurveAnalysisMethod;
  parameters: AnalysisParameters;
  requestedOutputs: readonly string[];
};

export type CurveResultInspection = {
  resultKind: CurveResultKind;
  state: AnalysisResultState;
  curveId: string;
  curveRevision: number;
  representation: CurveRepresentation;
  sourceModule: CurveIdentity["sourceModule"];
  method: CurveAnalysisMethod | "unknown";
  units: CurveUnits | null;
  warnings: readonly string[];
  dependencyStates: ReadonlyArray<{ kind: CurveResultKind; state: AnalysisResultState; resultVersion?: number }>;
};

type CurveAdapterBase = {
  id: string;
  revision: number;
  label: string;
  dimension: 2 | 3;
  domain: CurveParameterDomain;
  sampling?: Partial<CurveSamplingPolicy>;
  units?: Partial<CurveUnits>;
  coordinateSystem?: string;
  orientation?: Partial<CurveOrientation> & Pick<CurveOrientation, "convention">;
  derivatives?: Partial<CurveDerivativeCapabilities>;
  sourceModule?: CurveIdentity["sourceModule"];
  dependencies?: readonly CurveDependency[];
  sourceExpressions?: Readonly<Record<string, string>>;
  warnings?: readonly string[];
};

export type CurveAdapterInput = CurveAdapterBase & (
  | { representation: "parametric"; expressions: { x: string; y: string; z?: string }; familyId?: string }
  | { representation: "explicit"; formula: string; independentVariable?: string }
  | { representation: "implicit"; formula: string; branch?: string }
  | { representation: "polar"; radiusExpression: string; angleParameter?: string }
  | { representation: "bezier"; controlPoints: readonly (readonly number[])[]; degree?: number }
  | { representation: "b-spline"; controlPoints: readonly (readonly number[])[]; degree: number; knots: readonly number[]; periodic?: boolean }
  | { representation: "nurbs"; controlPoints: readonly (readonly number[])[]; degree: number; knots: readonly number[]; weights: readonly number[]; periodic?: boolean }
  | { representation: "polyline"; points: readonly (readonly number[])[]; sourceLabel?: string }
  | { representation: "curve-on-surface"; surfaceId: string; surfaceRevision: number; parameterExpressions?: { u: string; v: string }; pointCount?: number }
  | { representation: "derived"; operation: string; sourceIds: readonly string[]; settings?: Readonly<Record<string, number | string | boolean | null>> }
);
