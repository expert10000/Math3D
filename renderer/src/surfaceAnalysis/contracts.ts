import type { AnalysisIdentity, AnalysisParameters, AnalysisResultState } from "../analysis/contracts";

export type SurfaceRepresentation =
  | "explicit"
  | "implicit"
  | "parametric"
  | "spline"
  | "constructed"
  | "weierstrass"
  | "mesh-backed";

export type SurfaceAnalysisMethod =
  | "analytic"
  | "symbolic"
  | "automatic-differentiation"
  | "numerical-derivatives"
  | "surface-sampling"
  | "mesh-approximation"
  | "vtk"
  | "cgal";

export type SurfaceResultKind =
  | "surface-definition"
  | "surface-samples"
  | "differential-geometry"
  | "curvature-field"
  | "surface-probe"
  | "surface-curves"
  | "surface-features"
  | "chart-diagnostics"
  | "derived-surface-mesh"
  | "surface-comparison"
  | "surface-report"
  | (string & {});

export type SurfaceAnalysisDomain = "surface" | "point" | "curve" | "feature" | "chart" | "derived-mesh" | "mixed";

export type SurfaceAxisDomain = {
  min: number;
  max: number;
  periodic?: boolean;
  label?: string;
};

export type SurfaceDomain =
  | { kind: "parameter"; u: SurfaceAxisDomain; v: SurfaceAxisDomain }
  | { kind: "graph"; x: SurfaceAxisDomain; y: SurfaceAxisDomain }
  | { kind: "spatial-bounds"; min: readonly [number, number, number]; max: readonly [number, number, number] }
  | { kind: "mesh"; vertexCount: number; faceCount: number };

export type SurfaceSampling = {
  uSegments?: number;
  vSegments?: number;
  resolution?: number;
  adaptive?: boolean;
  tolerance?: number;
  maximumSamples?: number;
};

export type SurfaceUnits = {
  length: string;
  angle: "rad" | "deg";
  parameter?: string;
};

export type SurfaceOrientation = {
  convention: "parameter-cross" | "graph-up" | "gradient" | "mesh-winding" | "source-defined";
  sign: 1 | -1;
  description: string;
};

export type SurfaceIdentity = AnalysisIdentity & {
  surfaceId: string;
  surfaceRevision: number;
  representation: SurfaceRepresentation;
};

export type SurfaceDefinitionSource = {
  familyId: string;
  expressions?: Readonly<Record<string, string>>;
  settings?: Readonly<Record<string, number | string | boolean | null>>;
  sourceIds?: readonly string[];
  meshId?: string;
};

export type CanonicalSurfaceDefinition = {
  version: 1;
  fingerprint: string;
  identity: SurfaceIdentity;
  representation: SurfaceRepresentation;
  domain: SurfaceDomain;
  sampling: SurfaceSampling;
  units: SurfaceUnits;
  orientation: SurfaceOrientation;
  source: SurfaceDefinitionSource;
  warnings: string[];
};

export type SurfacePointwisePayload = {
  kind: "pointwise";
  parameter?: readonly [number, number];
  position: readonly [number, number, number];
  normal?: readonly [number, number, number];
  tangentBasis?: readonly [readonly [number, number, number], readonly [number, number, number]];
  firstFundamentalForm?: readonly [number, number, number];
  secondFundamentalForm?: readonly [number, number, number];
  gaussianCurvature?: number;
  meanCurvature?: number;
  principalCurvatures?: readonly [number, number];
  principalDirections?: readonly [readonly [number, number, number], readonly [number, number, number]];
  valid: boolean;
};

export type SurfaceFieldPayload = {
  kind: "scalar-field" | "vector-field" | "tensor-field";
  quantity: string;
  domain: "sample" | "parameter" | "vertex" | "face";
  values: Float32Array | Float64Array | Int32Array | Uint32Array;
  validMask?: Uint8Array;
  components: number;
  unit: string;
};

export type SurfaceCurvePayload = {
  kind: "curves";
  curveKind: string;
  polylines: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;
  parameters?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
};

export type SurfaceFeaturePayload = {
  kind: "features";
  featureKind: string;
  points: ReadonlyArray<readonly [number, number, number]>;
  confidence?: Float32Array;
};

export type SurfaceChartPayload = {
  kind: "chart";
  quantity: string;
  values?: Float32Array | Float64Array;
  invalidRegions: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
};

export type SurfaceDerivedMeshPayload = {
  kind: "derived-mesh";
  meshId: string;
  sourceSurfaceId: string;
  sourceRevision: number;
  live: boolean;
  vertexCount: number;
  faceCount: number;
  correspondenceId?: string;
};

export type SurfaceDifferentialFieldPayload = {
  kind: "differential";
  sampleCount: number;
  parameters: Float64Array;
  positions: Float64Array;
  firstDerivatives: Float64Array;
  secondDerivatives: Float64Array;
  normals: Float64Array;
  firstFundamentalForms: Float64Array;
  secondFundamentalForms: Float64Array;
  shapeOperators: Float64Array;
  gaussianCurvature: Float64Array;
  meanCurvature: Float64Array;
  principalCurvatures: Float64Array;
  principalDirections: Float64Array;
  validityMask: Uint8Array;
  uncertaintyMask: Uint8Array;
  boundaryMask: Uint8Array;
  degeneracyMask: Uint8Array;
  singularityMask: Uint8Array;
  umbilicMask: Uint8Array;
};

export type SurfaceAnalysisPayload = {
  version: 1;
  surfaceId: string;
  surfaceRevision: number;
  representation: SurfaceRepresentation;
  method: SurfaceAnalysisMethod;
  units: SurfaceUnits;
  orientation: SurfaceOrientation;
  warnings: string[];
  data:
    | SurfacePointwisePayload
    | SurfaceFieldPayload
    | SurfaceCurvePayload
    | SurfaceFeaturePayload
    | SurfaceChartPayload
    | SurfaceDerivedMeshPayload
    | SurfaceDifferentialFieldPayload
    | { kind: "summary"; values: Readonly<Record<string, number | string | boolean | null>> };
};

export type SurfaceAnalysisRequest = {
  version: 1;
  requestId: string;
  kind: SurfaceResultKind;
  variant: string;
  identity: SurfaceIdentity;
  domain: SurfaceAnalysisDomain;
  method: SurfaceAnalysisMethod;
  parameters: AnalysisParameters;
  requestedOutputs: readonly string[];
};

export type SurfaceResultInspection = {
  resultKind: SurfaceResultKind;
  state: AnalysisResultState;
  surfaceId: string;
  surfaceRevision: number;
  representation: SurfaceRepresentation;
  method: SurfaceAnalysisMethod | "unknown";
  units: SurfaceUnits | null;
  warnings: readonly string[];
  dependencyStates: ReadonlyArray<{ kind: SurfaceResultKind; state: AnalysisResultState; resultVersion?: number }>;
};

export type SurfaceAdapterInput = {
  id: string;
  revision: number;
  label: string;
  sourceRevision?: string;
  domain: SurfaceDomain;
  sampling?: SurfaceSampling;
  units?: Partial<SurfaceUnits>;
  orientation?: Partial<SurfaceOrientation> & Pick<SurfaceOrientation, "convention">;
  warnings?: readonly string[];
} & (
  | { representation: "explicit"; formula: string }
  | { representation: "implicit"; formula: string; isoValue?: number }
  | { representation: "parametric"; expressions: { x: string; y: string; z: string }; familyId?: string }
  | { representation: "spline"; familyId: "bezier" | "b-spline" | "nurbs" | string; settings: Readonly<Record<string, number | string | boolean | null>> }
  | { representation: "constructed"; familyId: string; sourceIds: readonly string[]; settings?: Readonly<Record<string, number | string | boolean | null>> }
  | { representation: "weierstrass"; gExpression: string; phiExpression: string; settings?: Readonly<Record<string, number | string | boolean | null>> }
  | { representation: "mesh-backed"; meshId: string; sourceLabel?: string }
);
