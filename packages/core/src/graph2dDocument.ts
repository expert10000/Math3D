import {
  canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  defineDocumentFieldPolicy, isDocumentIdentity, structuralHash,
  type CanonicalJsonValue, type DocumentIdentity,
} from "./documentIdentity";
import type { ValidationResult } from "./validation";
import { parseGraph2DExpression, type Graph2DExpressionAst } from "./graph2dExpression";
import { GRAPH2D_PARAMETERS_CAPABILITY, GRAPH2D_PARAMETER_EXPRESSIONS_CAPABILITY, isGraph2DParameter, type Graph2DParameter } from "./graph2dParameterTypes";
import { graph2DParameterExpressionsCurrent } from "./graph2dParameterExpressions";
import { isGraph2DFieldReference, isGraph2DFieldLocator,
  type Graph2DFieldReference, type Graph2DFieldLocator } from "./graph2dFieldReference";
import { isGraph2DVectorFieldReference, type Graph2DVectorFieldReference } from "./graph2dVectorFieldReference";
import { isGraph2DViewport } from "./graph2dViewport";
import { parseVectorField3DDocument, type VectorField3DLinkedLineProfile,
  type VectorField3DOverlayRegion } from "./vectorField3DDocument";
import { GRAPH2D_GRID_CAPABILITY, isGraph2DGridOptions, type Graph2DGridOptions } from "./graph2dGridOptions";
import { GRAPH2D_CONSTRUCTIONS_CAPABILITY, GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY, GRAPH2D_CURVATURE_CONSTRUCTIONS_CAPABILITY, GRAPH2D_OSCULATING_CIRCLE_CONSTRUCTIONS_CAPABILITY, validateGraph2DConstructionSet,
  type Graph2DConstructionSet } from "./graph2dConstructions";
export const GRAPH2D_SCALES_CAPABILITY = "graph2d.scales.v1" as const;

export const GRAPH2D_DOCUMENT_FORMAT = "math3d.graph2d-document" as const;
export const GRAPH2D_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const GRAPH2D_EXPLICIT_CAPABILITY = "graph2d.explicit.v1" as const;
export const GRAPH2D_PROBES_CAPABILITY = "graph2d.probes.v1" as const;
export const GRAPH2D_PROBE_VISIBILITY_CAPABILITY = "graph2d.probe-visibility.v1" as const;
export const GRAPH2D_MAX_PINNED_PROBES = 8;
export type Graph2DPinnedProbe = Readonly<{ id: string; label: string; objectId: string;
  x: number; y: number; sourceHash: string; visible?: boolean }>;
export const GRAPH2D_PARAMETRIC_CAPABILITY = "graph2d.parametric.v1" as const;
export const GRAPH2D_POLAR_CAPABILITY = "graph2d.polar.v1" as const;
export const GRAPH2D_IMPLICIT_CAPABILITY = "graph2d.implicit.v1" as const;
export const GRAPH2D_INEQUALITY_CAPABILITY = "graph2d.inequality.v1" as const;
export const GRAPH2D_POINT_SERIES_CAPABILITY = "graph2d.point-series.v1" as const;
export const GRAPH2D_SCIENTIFIC_DATASET_CAPABILITY = "graph2d.scientific-dataset.v1" as const;
export const GRAPH2D_SCIENTIFIC_DATASET_SLICE_CAPABILITY = "graph2d.scientific-dataset-slice.v1" as const;
export const GRAPH2D_FIELD_REFERENCE_CAPABILITY = "graph2d.field-reference.v1" as const;
export const GRAPH2D_VECTOR_FIELD_REFERENCE_CAPABILITY = "graph2d.vector-field-reference.v1" as const;
export const GRAPH2D_PIECEWISE_CAPABILITY = "graph2d.piecewise.v1" as const;
export const GRAPH2D_SLOPE_FIELD_CAPABILITY = "graph2d.slope-field.v1" as const;
export const GRAPH2D_TRAJECTORY_CAPABILITY = "graph2d.trajectory.v1" as const;
export const GRAPH2D_PHASE_PORTRAIT_CAPABILITY = "graph2d.phase-portrait.v1" as const;
export const GRAPH2D_TIME_ODE_CAPABILITY = "graph2d.time-ode.v1" as const;
export const GRAPH2D_OBJECT_KINDS = ["explicit-cartesian", "parametric", "polar", "implicit", "inequality", "point-series", "piecewise", "slope-field", "trajectory", "phase-portrait", "time-ode"] as const;
export type Graph2DObjectKind = (typeof GRAPH2D_OBJECT_KINDS)[number];
export const GRAPH2D_RESERVED_OBJECT_KINDS = GRAPH2D_OBJECT_KINDS.slice(1);
export const GRAPH2D_MAX_DOCUMENT_BYTES = 256 * 1024;
export const GRAPH2D_MAX_OBJECTS = 64;
export const GRAPH2D_MAX_EXPRESSION_LENGTH = 2048;

export type Graph2DDomain = Readonly<{ min: number; max: number; includeMin: boolean; includeMax: boolean }>;
export type Graph2DExplicitObject = Readonly<{
  id: string;
  kind: "explicit-cartesian";
  label: string;
  expression: Readonly<{ source: string; variable: "x"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
}>;
export type Graph2DParametricObject = Readonly<{
  id: string;
  kind: "parametric";
  label: string;
  xExpression: Readonly<{ source: string; variable: "t"; ast: Graph2DExpressionAst }>;
  yExpression: Readonly<{ source: string; variable: "t"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
}>;
export type Graph2DPolarObject = Readonly<{
  id: string;
  kind: "polar";
  label: string;
  rExpression: Readonly<{ source: string; variable: "theta"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
}>;
export type Graph2DImplicitObject = Readonly<{
  id: string;
  kind: "implicit";
  label: string;
  expression: Readonly<{ source: string; variable: "xy"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
  yDomain: Graph2DDomain;
}>;
export type Graph2DInequalityClause = Readonly<{
  source: string;
  variable: "xy";
  ast: Graph2DExpressionAst;
  comparator: "<" | "<=" | ">" | ">=";
}>;
export type Graph2DInequalityObject = Readonly<{
  id: string;
  kind: "inequality";
  label: string;
  clauses: readonly Graph2DInequalityClause[];
  operator: "all" | "any";
  domain: Graph2DDomain;
  yDomain: Graph2DDomain;
}>;
export type Graph2DPointTableReference = Readonly<{
  id: string;
  checksum: string;
  rowCount: number;
  encoding: "math3d.graph2d-point-table.v1";
}>;
export type Graph2DScientificDatasetOrigin = Readonly<{
  schema: "scientific-scene/v1"; sceneId: string; datasetId: string;
  locator?: Graph2DFieldLocator;
  fieldDocument?: Readonly<{ id: string; revision: number; structuralHash: string; sourceHash: string }>;
  component?: string;
  slice?: Readonly<{ varyingAxis: 0 | 1; fixedIndex: number; fixedCoordinate: number;
    fixedName: string; fixedUnit: string }> | Readonly<{
    varyingAxis: 0 | 1 | 2; fixedAxis: 0 | 1 | 2; fixedIndex: number;
    fixedCoordinate: number; fixedName: string; fixedUnit: string;
    plane: Readonly<{ normalAxis: 0 | 1 | 2; fixedIndex: number;
      fixedCoordinate: number; fixedName: string; fixedUnit: string }>;
  }>;
  sceneFingerprint: string; resourceSha256: string;
  sourceProducer: string; sourceId: string; sourceSchema: string; sourceSha256: string;
  xName: string; xUnit: string; yName: string; yUnit: string;
}>;
export type Graph2DAnalyticFieldOrigin = Readonly<{
  kind: "vector-field3d-expression-line";
  documentId: string; revision: number; structuralHash: string;
  component: "p" | "q" | "r" | "speed"; varyingAxis: 0 | 1 | 2;
  fixedCoordinates: readonly (number | null)[];
  expressions: readonly string[];
  xName: string; xUnit: string; yUnit: string;
}>;
export type Graph2DDerivedFieldOrigin = Readonly<{
  kind: "vector-field3d-derived-line";
  sourceDocumentJson: string;
  operation: "divergence" | "curl-x" | "curl-y" | "curl-z" |
    "grad-speed-x" | "grad-speed-y" | "grad-speed-z" | "grad-speed-magnitude" |
    "laplacian-speed";
  normalAxis: 0 | 1 | 2; fixedCoordinate: number;
  varyingAxis: 0 | 1 | 2; profileFixedCoordinate: number;
  stencilGrid?: "source";
  xName: string; xUnit: string; yUnit: string;
  sourceHash: string; lineSha256: string;
  verifiedSamples: readonly Readonly<{ name: string; sampleSha256: string;
    verifiedChunks?: number; totalChunks?: number; verifiedTiles?: number; totalTiles?: number }>[];
}>;
type Graph2DLinkedOverlayCommon = Readonly<{
  pairId: string;
  vectorDocumentJson: string;
  profile: Readonly<Omit<VectorField3DLinkedLineProfile, "point"> & { point: readonly number[] }>;
  xName: string; xUnit: string; yUnit: string;
  vectorSourceHash: string; vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[];
  scalarSampleSha256: string; rowsSha256: string;
}>;
export type Graph2DLinkedLineOrigin =
  | (Graph2DLinkedOverlayCommon & Readonly<{
    kind: "vector-scalar-linked-line/v1"; series: "vector" | "scalar";
    scalarReference: Graph2DFieldReference }>)
  | (Graph2DLinkedOverlayCommon & Readonly<{
    kind: "vector-complex-linked-line/v1"; series: "vector" | "complex";
    realReference: Graph2DFieldReference; imaginaryReference: Graph2DFieldReference;
    mode: "magnitude" | "phase";
    realSampleSha256: string; imaginarySampleSha256: string }>);
type Graph2DLinkedRegionCommon = Readonly<{
  pairId: string; vectorDocumentJson: string; region: VectorField3DOverlayRegion;
  xName: string; xUnit: string; yUnit: string;
  vectorSourceHash: string;
  vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[];
  scalarSampleSha256: string; rowsSha256: string;
}>;
export type Graph2DLinkedRegionOrigin =
  | (Graph2DLinkedRegionCommon & Readonly<{
    kind: "vector-scalar-linked-region/v1"; series: "vector" | "scalar";
    scalarReference: Graph2DFieldReference }> )
  | (Graph2DLinkedRegionCommon & Readonly<{
    kind: "vector-complex-linked-region/v1"; series: "vector" | "complex";
    realReference: Graph2DFieldReference; imaginaryReference: Graph2DFieldReference;
    mode: "magnitude" | "phase";
    realSampleSha256: string; imaginarySampleSha256: string }>);
export type Graph2DLinkedCombinedRegionOrigin = Readonly<{
  kind: "vector-scalar-complex-linked-region/v2" | "vector-scalar-complex-divergence-linked-region/v3" |
    "vector-scalar-complex-curl-linked-region/v4";
  pairId: string; series: "vector" | "scalar" | "complex-magnitude" | "complex-phase" |
    "divergence" | "curl-magnitude";
  /** Omitted in saved column profiles; 1 selects the second physical slice axis. */
  profileAxis?: 1;
  vectorDocumentJson: string; region: VectorField3DOverlayRegion;
  xName: string; xUnit: string; yUnit: string;
  vectorSourceHash: string;
  vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[];
  scalarReference: Graph2DFieldReference;
  realReference: Graph2DFieldReference; imaginaryReference: Graph2DFieldReference;
  scalarSampleSha256: string; realSampleSha256: string;
  imaginarySampleSha256: string; rowsSha256: string;
  derivedSamples?: readonly Readonly<{ name: string; sampleSha256: string }>[];
}>;
export type Graph2DLinkedVectorRegionOrigin = Readonly<{
  kind: "vector-derived-linked-region/v1";
  pairId: string; series: "vector" | "divergence" | "curl-magnitude";
  vectorDocumentJson: string; region: VectorField3DOverlayRegion;
  xName: string; xUnit: string; yUnit: string;
  vectorSourceHash: string; vectorSamples: readonly Readonly<{
    name: string; sampleSha256: string }>[];
  derivedSamples: readonly Readonly<{ name: string; sampleSha256: string }>[];
  rowsSha256: string;
}>;
export type Graph2DLinkedOverlayOrigin = Graph2DLinkedLineOrigin |
  Graph2DLinkedRegionOrigin | Graph2DLinkedCombinedRegionOrigin |
  Graph2DLinkedVectorRegionOrigin;
export type Graph2DPointSeriesObject = Readonly<{
  id: string;
  kind: "point-series";
  label: string;
  table: Graph2DPointTableReference;
  mode: "points" | "line";
  missing: "gap";
  domain: Graph2DDomain;
  origin?: Graph2DScientificDatasetOrigin;
  analyticOrigin?: Graph2DAnalyticFieldOrigin;
  derivedOrigin?: Graph2DDerivedFieldOrigin;
  linkedOrigin?: Graph2DLinkedOverlayOrigin;
}>;
export type Graph2DPiece = Readonly<{
  expression: Readonly<{ source: string; variable: "x"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
}>;
export type Graph2DPiecewiseObject = Readonly<{
  id: string;
  kind: "piecewise";
  label: string;
  pieces: readonly Graph2DPiece[];
}>;
export type Graph2DSlopeFieldObject = Readonly<{
  id: string;
  kind: "slope-field";
  label: string;
  expression: Readonly<{ source: string; variable: "xy"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
  yDomain: Graph2DDomain;
}>;
export type Graph2DTrajectoryObject = Readonly<{
  id: string;
  kind: "trajectory";
  label: string;
  sourceFieldId: string;
  seed: Readonly<{ x: number; y: number }>;
}>;
export type Graph2DPhasePortraitObject = Readonly<{
  id: string;
  kind: "phase-portrait";
  label: string;
  xDerivative: Readonly<{ source: string; variable: "xy"; ast: Graph2DExpressionAst }>;
  yDerivative: Readonly<{ source: string; variable: "xy"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
  yDomain: Graph2DDomain;
  timeSpan: number;
  seeds: readonly Readonly<{ x: number; y: number }>[];
  fieldDensity?: number;
  fieldUnits?: Readonly<{ x: string; y: string; time: string }>;
}>;
export type Graph2DTimeOdeObject = Readonly<{
  id: string; kind: "time-ode"; label: string;
  expression: Readonly<{ source: string; variable: "tx"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain; stateDomain: Graph2DDomain;
  seed: Readonly<{ t: number; x: number }>;
}>;
export type Graph2DGraphObject = Graph2DExplicitObject | Graph2DParametricObject | Graph2DPolarObject |
  Graph2DImplicitObject | Graph2DInequalityObject | Graph2DPointSeriesObject | Graph2DPiecewiseObject |
  Graph2DSlopeFieldObject | Graph2DTrajectoryObject | Graph2DPhasePortraitObject | Graph2DTimeOdeObject;
export type Graph2DSource = Readonly<{
  objects: readonly Graph2DGraphObject[];
  variables: readonly Graph2DParameter[];
  assumptions: readonly string[];
  constructions?: Graph2DConstructionSet;
  fieldReferences?: readonly Graph2DFieldReference[];
  vectorFieldReferences?: readonly Graph2DVectorFieldReference[];
}>;
export const graph2DRequiredCapabilities = (source: Graph2DSource, display?: Pick<Graph2DDisplay, "pinnedProbes"> & Partial<Pick<Graph2DDisplay, "viewport" | "axes">>): Graph2DDocument["requiredCapabilities"] =>
  [GRAPH2D_EXPLICIT_CAPABILITY,
    ...(source.objects.some((object) => object.kind === "parametric") ? [GRAPH2D_PARAMETRIC_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "polar") ? [GRAPH2D_POLAR_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "implicit") ? [GRAPH2D_IMPLICIT_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "inequality") ? [GRAPH2D_INEQUALITY_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "point-series") ? [GRAPH2D_POINT_SERIES_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "point-series" && object.origin) ? [GRAPH2D_SCIENTIFIC_DATASET_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "point-series" && object.origin?.slice) ?
      [GRAPH2D_SCIENTIFIC_DATASET_SLICE_CAPABILITY] : []),
    ...(source.fieldReferences?.length ? [GRAPH2D_FIELD_REFERENCE_CAPABILITY] : []),
    ...(source.vectorFieldReferences?.length ? [GRAPH2D_VECTOR_FIELD_REFERENCE_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "piecewise") ? [GRAPH2D_PIECEWISE_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "slope-field") ? [GRAPH2D_SLOPE_FIELD_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "trajectory") ? [GRAPH2D_TRAJECTORY_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "phase-portrait") ? [GRAPH2D_PHASE_PORTRAIT_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "time-ode") ? [GRAPH2D_TIME_ODE_CAPABILITY] : []),
    ...(source.constructions !== undefined ? [GRAPH2D_CONSTRUCTIONS_CAPABILITY] : []),
    ...(source.constructions?.objects.some(object => ["root", "minimum", "maximum", "intersection"].includes(object.kind)) ?
      [GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY] : []),
    ...(source.constructions?.objects.some(object => object.kind === "curvature") ?
      [GRAPH2D_CURVATURE_CONSTRUCTIONS_CAPABILITY] : []),
    ...(source.constructions?.objects.some(object => object.kind === "osculating-circle") ?
      [GRAPH2D_OSCULATING_CIRCLE_CONSTRUCTIONS_CAPABILITY] : []),
    ...(display?.pinnedProbes !== undefined ? [GRAPH2D_PROBES_CAPABILITY] : []),
    ...(display?.pinnedProbes?.some(p => p.visible !== undefined) ? [GRAPH2D_PROBE_VISIBILITY_CAPABILITY] : []),
    ...(source.variables.some(variable => variable.control !== undefined || variable.expression !== undefined) ? [GRAPH2D_PARAMETERS_CAPABILITY] : []),
    ...(source.variables.some(variable => variable.expression !== undefined) ? [GRAPH2D_PARAMETER_EXPRESSIONS_CAPABILITY] : []),
    ...(display?.viewport && ["xScale", "yScale", "continuation"].some(key => key in display.viewport!) ? [GRAPH2D_SCALES_CAPABILITY] : []),
    ...(display?.axes?.gridOptions !== undefined ? [GRAPH2D_GRID_CAPABILITY] : [])];
export type Graph2DObjectDisplay = Readonly<{
  objectId: string;
  visible: boolean;
  color: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
}>;
export type Graph2DDisplay = Readonly<{
  pinnedProbes?: readonly Graph2DPinnedProbe[];
  viewport: Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number; aspect: "free" | "equal";
    xScale?: "linear" | "log10"; yScale?: "linear" | "log10"; continuation?: boolean }>;
  axes: Readonly<{ x: boolean; y: boolean; grid: boolean; labels: boolean;
    gridMode?: "cartesian" | "polar"; gridOptions?: Graph2DGridOptions }>;
  objects: readonly Graph2DObjectDisplay[];
  sampling: Readonly<{ maxSamples: number; maxDepth: number; tolerancePx: number }>;
}>;
export type Graph2DProbe = Readonly<{ objectId: string; x: number; y: number; parameter?: number; rowId?: string }>;
export type Graph2DLinkedRegionSelection = Readonly<{
  pairId: string;
  physical: Readonly<{ kind: "point"; x: number }> |
    Readonly<{ kind: "interval"; min: number; max: number }>;
}>;
export type Graph2DSelection = Readonly<{ objectId: string | null; probe: Graph2DProbe | null;
  linkedRegion?: Graph2DLinkedRegionSelection }>;
export type Graph2DDocument = Readonly<{
  format: typeof GRAPH2D_DOCUMENT_FORMAT;
  schemaVersion: typeof GRAPH2D_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  requiredCapabilities: readonly (typeof GRAPH2D_EXPLICIT_CAPABILITY | typeof GRAPH2D_PARAMETRIC_CAPABILITY |
    typeof GRAPH2D_POLAR_CAPABILITY | typeof GRAPH2D_IMPLICIT_CAPABILITY |
    typeof GRAPH2D_INEQUALITY_CAPABILITY | typeof GRAPH2D_POINT_SERIES_CAPABILITY |
    typeof GRAPH2D_PIECEWISE_CAPABILITY | typeof GRAPH2D_SLOPE_FIELD_CAPABILITY | typeof GRAPH2D_TRAJECTORY_CAPABILITY | typeof GRAPH2D_PHASE_PORTRAIT_CAPABILITY | typeof GRAPH2D_TIME_ODE_CAPABILITY | typeof GRAPH2D_CONSTRUCTIONS_CAPABILITY | typeof GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY | typeof GRAPH2D_CURVATURE_CONSTRUCTIONS_CAPABILITY | typeof GRAPH2D_OSCULATING_CIRCLE_CONSTRUCTIONS_CAPABILITY | typeof GRAPH2D_SCIENTIFIC_DATASET_CAPABILITY | typeof GRAPH2D_SCIENTIFIC_DATASET_SLICE_CAPABILITY | typeof GRAPH2D_FIELD_REFERENCE_CAPABILITY | typeof GRAPH2D_VECTOR_FIELD_REFERENCE_CAPABILITY | typeof GRAPH2D_PROBES_CAPABILITY | typeof GRAPH2D_PROBE_VISIBILITY_CAPABILITY | typeof GRAPH2D_PARAMETERS_CAPABILITY | typeof GRAPH2D_PARAMETER_EXPRESSIONS_CAPABILITY | typeof GRAPH2D_SCALES_CAPABILITY | typeof GRAPH2D_GRID_CAPABILITY)[];
  source: Graph2DSource;
  display: Graph2DDisplay;
  selection: Graph2DSelection;
  metadata: Readonly<{ title: string }>;
}>;

export const GRAPH2D_DOCUMENT_FIELD_POLICY = defineDocumentFieldPolicy({
  format: "persistent-metadata", schemaVersion: "persistent-metadata", identity: "persistent-metadata",
  requiredCapabilities: "persistent-metadata", source: "structural", display: "persistent-display",
  selection: "persistent-metadata", metadata: "persistent-metadata",
});

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const bounded = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
const objectId = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
const integerWithin = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;
const validExpression = (value: unknown, variables: readonly string[], variable: "x" | "t" | "theta" | "xy" | "tx" = "x"): boolean => {
  if (!record(value) || !exact(value, ["source", "variable", "ast"]) ||
      !bounded(value.source, GRAPH2D_MAX_EXPRESSION_LENGTH) || value.variable !== variable) return false;
  const parsed = parseGraph2DExpression(value.source, variables);
  if (!parsed.ok) return false;
  try { return canonicalJsonStringify(value.ast) === canonicalJsonStringify(parsed.ast); }
  catch { return false; }
};

const validDomain = (value: unknown): value is Graph2DDomain => record(value) &&
  exact(value, ["min", "max", "includeMin", "includeMax"]) && finite(value.min) && finite(value.max) &&
  value.min < value.max && typeof value.includeMin === "boolean" && typeof value.includeMax === "boolean";
const validObject = (value: unknown, variables: readonly string[]): value is Graph2DExplicitObject => record(value) &&
  exact(value, ["id", "kind", "label", "expression", "domain"]) && objectId(value.id) &&
  value.kind === "explicit-cartesian" && bounded(value.label, 160) && validExpression(value.expression, variables) && validDomain(value.domain);
const validParametricObject = (value: unknown, variables: readonly string[]): value is Graph2DParametricObject => record(value) &&
  exact(value, ["id", "kind", "label", "xExpression", "yExpression", "domain"]) && objectId(value.id) &&
  value.kind === "parametric" && bounded(value.label, 160) &&
  validExpression(value.xExpression, variables, "t") && validExpression(value.yExpression, variables, "t") &&
  validDomain(value.domain);
const validPolarObject = (value: unknown, variables: readonly string[]): value is Graph2DPolarObject => record(value) &&
  exact(value, ["id", "kind", "label", "rExpression", "domain"]) && objectId(value.id) &&
  value.kind === "polar" && bounded(value.label, 160) &&
  validExpression(value.rExpression, variables, "theta") && validDomain(value.domain);
const validImplicitObject = (value: unknown, variables: readonly string[]): value is Graph2DImplicitObject => record(value) &&
  exact(value, ["id", "kind", "label", "expression", "domain", "yDomain"]) && objectId(value.id) &&
  value.kind === "implicit" && bounded(value.label, 160) &&
  validExpression(value.expression, variables, "xy") && validDomain(value.domain) && validDomain(value.yDomain);
const validSlopeFieldObject = (value: unknown, variables: readonly string[]): value is Graph2DSlopeFieldObject => record(value) &&
  exact(value, ["id", "kind", "label", "expression", "domain", "yDomain"]) && objectId(value.id) &&
  value.kind === "slope-field" && bounded(value.label, 160) &&
  validExpression(value.expression, variables, "xy") && validDomain(value.domain) && validDomain(value.yDomain);
const validTrajectoryObject = (value: unknown): value is Graph2DTrajectoryObject => record(value) &&
  exact(value, ["id", "kind", "label", "sourceFieldId", "seed"]) && objectId(value.id) &&
  value.kind === "trajectory" && bounded(value.label, 160) && objectId(value.sourceFieldId) &&
  record(value.seed) && exact(value.seed, ["x", "y"]) && finite(value.seed.x) && finite(value.seed.y);
const validPhasePortraitObject = (value: unknown, variables: readonly string[]): value is Graph2DPhasePortraitObject =>
  record(value) && exact(value, ["id", "kind", "label", "xDerivative", "yDerivative", "domain", "yDomain", "timeSpan", "seeds",
    ...(value.fieldDensity === undefined ? [] : ["fieldDensity"]), ...(value.fieldUnits === undefined ? [] : ["fieldUnits"])]) &&
  objectId(value.id) && value.kind === "phase-portrait" && bounded(value.label, 160) &&
  validExpression(value.xDerivative, variables, "xy") && validExpression(value.yDerivative, variables, "xy") &&
  validDomain(value.domain) && validDomain(value.yDomain) && finite(value.timeSpan) && value.timeSpan > 0 && value.timeSpan <= 100 &&
  (value.fieldDensity === undefined || integerWithin(value.fieldDensity, 4, 24)) &&
  (value.fieldUnits === undefined || record(value.fieldUnits) && exact(value.fieldUnits, ["x", "y", "time"]) &&
    [value.fieldUnits.x, value.fieldUnits.y, value.fieldUnits.time].every(unit =>
      typeof unit === "string" && unit.length <= 24 && unit.trim() === unit)) &&
  Array.isArray(value.seeds) && value.seeds.length <= 8 &&
  value.seeds.every((seed: unknown) => record(seed) && exact(seed, ["x", "y"]) && finite(seed.x) && finite(seed.y) &&
    seed.x >= (value.domain as Graph2DDomain).min && seed.x <= (value.domain as Graph2DDomain).max &&
    seed.y >= (value.yDomain as Graph2DDomain).min && seed.y <= (value.yDomain as Graph2DDomain).max);
const validTimeOdeObject = (value: unknown, variables: readonly string[]): value is Graph2DTimeOdeObject =>
  record(value) && exact(value, ["id", "kind", "label", "expression", "domain", "stateDomain", "seed"]) &&
  objectId(value.id) && value.kind === "time-ode" && bounded(value.label, 160) &&
  validExpression(value.expression, variables, "tx") && validDomain(value.domain) && validDomain(value.stateDomain) &&
  (value.domain as Graph2DDomain).includeMin && (value.domain as Graph2DDomain).includeMax &&
  (value.stateDomain as Graph2DDomain).includeMin && (value.stateDomain as Graph2DDomain).includeMax &&
  record(value.seed) && exact(value.seed, ["t", "x"]) && finite(value.seed.t) && finite(value.seed.x) &&
  value.seed.t >= (value.domain as Graph2DDomain).min && value.seed.t <= (value.domain as Graph2DDomain).max &&
  value.seed.x >= (value.stateDomain as Graph2DDomain).min && value.seed.x <= (value.stateDomain as Graph2DDomain).max &&
  value.seed.t - (value.domain as Graph2DDomain).min <= 100 &&
  (value.domain as Graph2DDomain).max - value.seed.t <= 100;
const validInequalityObject = (value: unknown, variables: readonly string[]): value is Graph2DInequalityObject => record(value) &&
  exact(value, ["id", "kind", "label", "clauses", "operator", "domain", "yDomain"]) && objectId(value.id) &&
  value.kind === "inequality" && bounded(value.label, 160) && ["all", "any"].includes(String(value.operator)) &&
  Array.isArray(value.clauses) && value.clauses.length >= 1 && value.clauses.length <= 8 &&
  value.clauses.every((clause: unknown) => record(clause) &&
    exact(clause, ["source", "variable", "ast", "comparator"]) &&
    ["<", "<=", ">", ">="].includes(String(clause.comparator)) &&
    validExpression({ source: clause.source, variable: clause.variable, ast: clause.ast }, variables, "xy")) &&
  validDomain(value.domain) && validDomain(value.yDomain);
export const validPointTableReference = (value: unknown): value is Graph2DPointTableReference => record(value) &&
  exact(value, ["id", "checksum", "rowCount", "encoding"]) &&
  typeof value.id === "string" && /^graph2d-table:[0-9a-f]{32}$/.test(value.id) &&
  typeof value.checksum === "string" && /^sha256:[0-9a-f]{64}$/.test(value.checksum) &&
  integerWithin(value.rowCount, 1, 10000) && value.encoding === "math3d.graph2d-point-table.v1" &&
  value.id === `graph2d-table:${value.checksum.slice(7, 39)}`;
export const validGraph2DScientificDatasetOrigin = (value: unknown): value is Graph2DScientificDatasetOrigin => record(value) &&
  exact(value, ["schema", "sceneId", "datasetId", "sceneFingerprint", "resourceSha256", "sourceProducer", "sourceId",
    "sourceSchema", "sourceSha256", "xName", "xUnit", "yName", "yUnit",
    ...(value.component === undefined ? [] : ["component"]), ...(value.slice === undefined ? [] : ["slice"]),
    ...(value.locator === undefined ? [] : ["locator"]),
    ...(value.fieldDocument === undefined ? [] : ["fieldDocument"])]) &&
  (value.locator === undefined || isGraph2DFieldLocator(value.locator)) &&
  (value.fieldDocument === undefined || record(value.fieldDocument) &&
    exact(value.fieldDocument, ["id", "revision", "structuralHash", "sourceHash"]) &&
    typeof value.fieldDocument.id === "string" &&
    value.fieldDocument.id.startsWith("math3d:scientific-field:") &&
    integerWithin(value.fieldDocument.revision, 1, 1e9) &&
    [value.fieldDocument.structuralHash, value.fieldDocument.sourceHash].every(hash =>
      typeof hash === "string" && /^sha256:[a-f0-9]{64}$/.test(hash))) &&
  value.schema === "scientific-scene/v1" &&
  [value.sceneId, value.datasetId, value.sourceProducer, value.sourceId].every(item =>
    typeof item === "string" && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(item)) &&
  (value.component === undefined || typeof value.component === "string" && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value.component)) &&
  (value.slice === undefined || record(value.slice) &&
    (value.slice.plane === undefined ?
      exact(value.slice, ["varyingAxis", "fixedIndex", "fixedCoordinate", "fixedName", "fixedUnit"]) &&
      (value.slice.varyingAxis === 0 || value.slice.varyingAxis === 1) :
      exact(value.slice, ["varyingAxis", "fixedAxis", "fixedIndex", "fixedCoordinate", "fixedName", "fixedUnit", "plane"]) &&
      [0, 1, 2].includes(value.slice.varyingAxis as number) &&
      [0, 1, 2].includes(value.slice.fixedAxis as number) &&
      record(value.slice.plane) && exact(value.slice.plane, ["normalAxis", "fixedIndex", "fixedCoordinate", "fixedName", "fixedUnit"]) &&
      [0, 1, 2].includes(value.slice.plane.normalAxis as number) &&
      new Set([value.slice.varyingAxis, value.slice.fixedAxis, value.slice.plane.normalAxis]).size === 3 &&
      integerWithin(value.slice.plane.fixedIndex, 0, 255) &&
      finite(value.slice.plane.fixedCoordinate) && Math.abs(value.slice.plane.fixedCoordinate) <= 1e12 &&
      bounded(value.slice.plane.fixedName, 160) && bounded(value.slice.plane.fixedUnit, 80)) &&
    integerWithin(value.slice.fixedIndex, 0, 255) && finite(value.slice.fixedCoordinate) &&
    Math.abs(value.slice.fixedCoordinate) <= 1e12 && bounded(value.slice.fixedName, 160) &&
    bounded(value.slice.fixedUnit, 80)) &&
  typeof value.sourceSchema === "string" && /^[A-Za-z][A-Za-z0-9._-]*\/v[1-9][0-9]*$/.test(value.sourceSchema) &&
  [value.sceneFingerprint, value.resourceSha256, value.sourceSha256].every(item =>
    typeof item === "string" && /^[a-f0-9]{64}$/.test(item)) &&
  [value.xName, value.yName].every(item => bounded(item, 160)) &&
  [value.xUnit, value.yUnit].every(item => bounded(item, 80));
export const validGraph2DAnalyticFieldOrigin = (value: unknown): value is Graph2DAnalyticFieldOrigin =>
  record(value) && exact(value, ["kind", "documentId", "revision", "structuralHash", "component",
    "varyingAxis", "fixedCoordinates", "expressions", "xName", "xUnit", "yUnit"]) &&
  value.kind === "vector-field3d-expression-line" && bounded(value.documentId, 160) &&
  integerWithin(value.revision, 1, 1e9) && typeof value.structuralHash === "string" &&
  /^sha256:[a-f0-9]{64}$/.test(value.structuralHash) &&
  ["p", "q", "r", "speed"].includes(String(value.component)) &&
  [0, 1, 2].includes(value.varyingAxis as number) &&
  Array.isArray(value.fixedCoordinates) && value.fixedCoordinates.length === 3 &&
  value.fixedCoordinates.every((item, index) => index === value.varyingAxis ? item === null :
    finite(item) && Math.abs(item) <= 1e9) &&
  Array.isArray(value.expressions) && value.expressions.length === 3 &&
  value.expressions.every(item => bounded(item, 2048)) &&
  bounded(value.xName, 160) && bounded(value.xUnit, 80) && bounded(value.yUnit, 80);
export const validGraph2DDerivedFieldOrigin = (value: unknown): value is Graph2DDerivedFieldOrigin => {
  if (!record(value) || !exact(value, ["kind", "sourceDocumentJson", "operation", "normalAxis",
    "fixedCoordinate", "varyingAxis", "profileFixedCoordinate", "xName", "xUnit", "yUnit",
    "sourceHash", "lineSha256", "verifiedSamples",
    ...(value.stencilGrid === undefined ? [] : ["stencilGrid"])]) ||
    value.kind !== "vector-field3d-derived-line" ||
    !["divergence", "curl-x", "curl-y", "curl-z", "grad-speed-x", "grad-speed-y",
      "grad-speed-z", "grad-speed-magnitude", "laplacian-speed"].includes(String(value.operation)) ||
    ![0, 1, 2].includes(value.normalAxis as number) ||
    ![0, 1, 2].includes(value.varyingAxis as number) || value.normalAxis === value.varyingAxis ||
    (value.stencilGrid !== undefined && value.stencilGrid !== "source") ||
    !finite(value.fixedCoordinate) || !finite(value.profileFixedCoordinate) ||
    !bounded(value.xName, 160) || !bounded(value.xUnit, 80) || !bounded(value.yUnit, 80) ||
    typeof value.sourceHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.sourceHash) ||
    typeof value.lineSha256 !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.lineSha256) ||
    !Array.isArray(value.verifiedSamples) || value.verifiedSamples.length !== 3 ||
    !value.verifiedSamples.every((part: unknown) => record(part) &&
      exact(part, ["name", "sampleSha256", ...(part.verifiedChunks === undefined ? [] :
        ["verifiedChunks", "totalChunks"]), ...(part.verifiedTiles === undefined ? [] :
        ["verifiedTiles", "totalTiles"])]) && bounded(part.name, 64) &&
      typeof part.sampleSha256 === "string" && /^[a-f0-9]{64}$/.test(part.sampleSha256) &&
      (part.verifiedChunks === undefined || integerWithin(part.verifiedChunks, 1, 1e6) &&
        integerWithin(part.totalChunks, 1, 1e6)) &&
      (part.verifiedTiles === undefined || integerWithin(part.verifiedTiles, 1, 1e6) &&
        integerWithin(part.totalTiles, 1, 1e6)))) return false;
  if (typeof value.sourceDocumentJson !== "string" || value.sourceDocumentJson.length > 256 * 1024)
    return false;
  try { return parseVectorField3DDocument(value.sourceDocumentJson).source.field.kind === "scientific-bundle"; }
  catch { return false; }
};
export const validGraph2DLinkedOverlayOrigin = (value: unknown): value is Graph2DLinkedOverlayOrigin => {
  if (record(value) && value.kind === "vector-derived-linked-region/v1") {
    if (!exact(value, ["kind", "pairId", "series", "vectorDocumentJson", "region",
      "xName", "xUnit", "yUnit", "vectorSourceHash", "vectorSamples",
      "derivedSamples", "rowsSha256"]) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(value.pairId)) ||
      !["vector", "divergence", "curl-magnitude"].includes(String(value.series)) ||
      typeof value.vectorDocumentJson !== "string" || value.vectorDocumentJson.length > 256 * 1024 ||
      !record(value.region) || !exact(value.region, ["normalAxis", "fixedCoordinate",
        "bounds", "vectorChannel", "visible"]) ||
      ![0, 1, 2].includes(value.region.normalAxis as number) ||
      !finite(value.region.fixedCoordinate) || value.region.vectorChannel !== "speed" ||
      value.region.visible !== true || !Array.isArray(value.region.bounds) ||
      value.region.bounds.length !== 2 || !value.region.bounds.every((bounds: unknown) =>
        Array.isArray(bounds) && bounds.length === 2 && bounds.every(finite) &&
        bounds[1] > bounds[0]) ||
      !bounded(value.xName, 160) || !bounded(value.xUnit, 80) ||
      !bounded(value.yUnit, 80) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(value.vectorSourceHash)) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(value.rowsSha256)) ||
      !Array.isArray(value.vectorSamples) || !Array.isArray(value.derivedSamples) ||
      ![value.vectorSamples, value.derivedSamples].every(samples =>
        Array.isArray(samples) && [0, 3].includes(samples.length) &&
        samples.every((part: unknown) => record(part) &&
          exact(part, ["name", "sampleSha256"]) && bounded(part.name, 64) &&
          /^[a-f0-9]{64}$/.test(String(part.sampleSha256))))) return false;
    try {
      const document = parseVectorField3DDocument(value.vectorDocumentJson);
      return document.identity.structuralHash === value.vectorSourceHash &&
        canonicalJsonStringify(document.workspace?.overlayRegion) ===
          canonicalJsonStringify(value.region) &&
        (document.source.field.kind === "scientific-bundle" ?
          value.vectorSamples.length === 3 && value.derivedSamples.length === 3 :
          value.vectorSamples.length === 0 && value.derivedSamples.length === 0);
    } catch { return false; }
  }
  if (record(value) && (value.kind === "vector-scalar-complex-linked-region/v2" ||
      value.kind === "vector-scalar-complex-divergence-linked-region/v3" ||
      value.kind === "vector-scalar-complex-curl-linked-region/v4")) {
    const derived = value.kind !== "vector-scalar-complex-linked-region/v2";
    const curl = value.kind === "vector-scalar-complex-curl-linked-region/v4";
    if (!exact(value, ["kind", "pairId", "series", "vectorDocumentJson", "region",
      ...(value.profileAxis === undefined ? [] : ["profileAxis"]),
      "xName", "xUnit", "yUnit", "vectorSourceHash", "vectorSamples",
      "scalarReference", "realReference", "imaginaryReference",
      "scalarSampleSha256", "realSampleSha256", "imaginarySampleSha256", "rowsSha256",
      ...(derived ? ["derivedSamples"] : [])]) ||
      typeof value.pairId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.pairId) ||
      (value.profileAxis !== undefined && value.profileAxis !== 1) ||
      (derived && value.profileAxis !== undefined) ||
      !(curl ? ["vector", "scalar", "complex-magnitude", "complex-phase", "divergence",
        "curl-magnitude"] : derived ?
        ["vector", "scalar", "complex-magnitude", "complex-phase", "divergence"] :
        ["vector", "scalar", "complex-magnitude", "complex-phase"]).includes(String(value.series)) ||
      typeof value.vectorDocumentJson !== "string" || value.vectorDocumentJson.length > 256 * 1024 ||
      !isGraph2DFieldReference(value.scalarReference) ||
      value.scalarReference.semanticType !== "scalar-field" ||
      !isGraph2DFieldReference(value.realReference) ||
      !isGraph2DFieldReference(value.imaginaryReference) ||
      value.realReference.semanticType !== "complex-scalar-field" ||
      value.imaginaryReference.semanticType !== "complex-scalar-field" ||
      value.realReference.component !== "real" ||
      value.imaginaryReference.component !== "imaginary" ||
      value.realReference.sceneFingerprint !== value.imaginaryReference.sceneFingerprint ||
      value.realReference.datasetId !== value.imaginaryReference.datasetId ||
      !record(value.region) || !exact(value.region, ["normalAxis", "fixedCoordinate",
        "bounds", "vectorChannel", "visible"]) ||
      ![0, 1, 2].includes(value.region.normalAxis as number) ||
      !finite(value.region.fixedCoordinate) || value.region.visible !== true ||
      !Array.isArray(value.region.bounds) || value.region.bounds.length !== 2 ||
      !value.region.bounds.every((bounds: unknown) => Array.isArray(bounds) &&
        bounds.length === 2 && bounds.every(finite) && bounds[1] > bounds[0]) ||
      !["p", "q", "r", "speed"].includes(String(value.region.vectorChannel)) ||
      !bounded(value.xName, 160) || !bounded(value.xUnit, 80) ||
      !bounded(value.yUnit, 80) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(value.vectorSourceHash)) ||
      !Array.isArray(value.vectorSamples) || ![0, 3].includes(value.vectorSamples.length) ||
      !value.vectorSamples.every((part: unknown) => record(part) &&
        exact(part, ["name", "sampleSha256"]) && bounded(part.name, 64) &&
        /^[a-f0-9]{64}$/.test(String(part.sampleSha256))) ||
      derived && (!Array.isArray(value.derivedSamples) ||
        ![0, 3].includes(value.derivedSamples.length) ||
        !value.derivedSamples.every((part: unknown) => record(part) &&
          exact(part, ["name", "sampleSha256"]) && bounded(part.name, 64) &&
          /^[a-f0-9]{64}$/.test(String(part.sampleSha256)))) ||
      ![value.scalarSampleSha256, value.realSampleSha256,
        value.imaginarySampleSha256].every(hash => /^[a-f0-9]{64}$/.test(String(hash))) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(value.rowsSha256))) return false;
    try {
      const document = parseVectorField3DDocument(value.vectorDocumentJson);
      const region = document.workspace?.overlayRegion;
      if (!region || canonicalJsonStringify(region) !== canonicalJsonStringify(value.region))
        return false;
      const profileAxis = value.profileAxis === 1 ? 1 : 0;
      const sourceAxis = [0, 1, 2].filter(axis => axis !== region.normalAxis)[profileAxis]!;
      return document.source.axes[sourceAxis]!.label === value.xName &&
        document.source.axes[sourceAxis]!.unit === value.xUnit &&
        canonicalJsonStringify(document.workspace?.scalarOverlay?.reference) ===
          canonicalJsonStringify(value.scalarReference) &&
        canonicalJsonStringify(document.workspace?.complexOverlay?.real) ===
          canonicalJsonStringify(value.realReference) &&
        canonicalJsonStringify(document.workspace?.complexOverlay?.imaginary) ===
          canonicalJsonStringify(value.imaginaryReference) &&
        (document.source.field.kind === "expressions" ? value.vectorSamples.length === 0 &&
          (!derived || (value.derivedSamples as unknown[]).length === 0) :
          value.vectorSamples.length === 3 &&
          (!derived || (value.derivedSamples as unknown[]).length === 3));
    } catch { return false; }
  }
  if (record(value) && ["vector-scalar-linked-region/v1", "vector-complex-linked-region/v1"]
    .includes(String(value.kind))) {
    if (!exact(value, ["kind", "pairId", "series", "vectorDocumentJson", "region",
      ...(value.kind === "vector-scalar-linked-region/v1" ? ["scalarReference"] :
        ["realReference", "imaginaryReference", "mode", "realSampleSha256",
          "imaginarySampleSha256"]), "xName", "xUnit", "yUnit", "vectorSourceHash",
      "vectorSamples", "scalarSampleSha256", "rowsSha256"]) ||
      typeof value.pairId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.pairId) ||
      !(value.kind === "vector-scalar-linked-region/v1" ?
        ["vector", "scalar"].includes(String(value.series)) :
        ["vector", "complex"].includes(String(value.series))) ||
      typeof value.vectorDocumentJson !== "string" || value.vectorDocumentJson.length > 256 * 1024 ||
      (value.kind === "vector-scalar-linked-region/v1" ?
        !isGraph2DFieldReference(value.scalarReference) ||
          value.scalarReference.semanticType !== "scalar-field" :
        !isGraph2DFieldReference(value.realReference) ||
        !isGraph2DFieldReference(value.imaginaryReference) ||
        value.realReference.semanticType !== "complex-scalar-field" ||
        value.imaginaryReference.semanticType !== "complex-scalar-field" ||
        value.realReference.component !== "real" ||
        value.imaginaryReference.component !== "imaginary" ||
        value.realReference.datasetId !== value.imaginaryReference.datasetId ||
        value.realReference.sceneFingerprint !== value.imaginaryReference.sceneFingerprint ||
        !["magnitude", "phase"].includes(String(value.mode)) ||
        !/^[a-f0-9]{64}$/.test(String(value.realSampleSha256)) ||
        !/^[a-f0-9]{64}$/.test(String(value.imaginarySampleSha256))) ||
      !record(value.region) || !exact(value.region, ["normalAxis", "fixedCoordinate",
        "bounds", "vectorChannel", "visible"]) ||
      ![0, 1, 2].includes(value.region.normalAxis as number) ||
      !finite(value.region.fixedCoordinate) ||
      !Array.isArray(value.region.bounds) || value.region.bounds.length !== 2 ||
      !value.region.bounds.every((bounds: unknown) => Array.isArray(bounds) &&
        bounds.length === 2 && bounds.every(finite) && bounds[1] > bounds[0]) ||
      !["p", "q", "r", "speed"].includes(String(value.region.vectorChannel)) ||
      value.region.visible !== true ||
      !bounded(value.xName, 160) || !bounded(value.xUnit, 80) || !bounded(value.yUnit, 80) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(value.vectorSourceHash)) ||
      !Array.isArray(value.vectorSamples) || ![0, 3].includes(value.vectorSamples.length) ||
      !value.vectorSamples.every((part: unknown) => record(part) && exact(part, ["name", "sampleSha256"]) &&
        bounded(part.name, 64) && typeof part.sampleSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(part.sampleSha256)) ||
      !/^[a-f0-9]{64}$/.test(String(value.scalarSampleSha256)) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(value.rowsSha256))) return false;
    try {
      const document = parseVectorField3DDocument(value.vectorDocumentJson);
      return canonicalJsonStringify(document.workspace?.overlayRegion) ===
          canonicalJsonStringify(value.region) &&
        (document.source.field.kind === "expressions" ? value.vectorSamples.length === 0 :
          value.vectorSamples.length === 3);
    } catch { return false; }
  }
  if (!record(value) || !["vector-scalar-linked-line/v1", "vector-complex-linked-line/v1"]
    .includes(String(value.kind)) ||
    !exact(value, ["kind", "pairId", "series", "vectorDocumentJson",
      ...(value.kind === "vector-scalar-linked-line/v1" ? ["scalarReference"] :
        ["realReference", "imaginaryReference", "mode", "realSampleSha256",
          "imaginarySampleSha256"]),
      "profile", "xName", "xUnit", "yUnit", "vectorSourceHash",
      "vectorSamples", "scalarSampleSha256", "rowsSha256"]) ||
    typeof value.pairId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.pairId) ||
    !(value.kind === "vector-scalar-linked-line/v1" ?
      ["vector", "scalar"].includes(String(value.series)) :
      ["vector", "complex"].includes(String(value.series))) ||
    typeof value.vectorDocumentJson !== "string" || value.vectorDocumentJson.length > 256 * 1024 ||
    (value.kind === "vector-scalar-linked-line/v1" ?
      !isGraph2DFieldReference(value.scalarReference) ||
        value.scalarReference.semanticType !== "scalar-field" :
      !isGraph2DFieldReference(value.realReference) ||
      !isGraph2DFieldReference(value.imaginaryReference) ||
      value.realReference.semanticType !== "complex-scalar-field" ||
      value.imaginaryReference.semanticType !== "complex-scalar-field" ||
      value.realReference.component !== "real" ||
      value.imaginaryReference.component !== "imaginary" ||
      value.realReference.datasetId !== value.imaginaryReference.datasetId ||
      value.realReference.sceneFingerprint !== value.imaginaryReference.sceneFingerprint ||
      !["magnitude", "phase"].includes(String(value.mode)) ||
      !/^[a-f0-9]{64}$/.test(String(value.realSampleSha256)) ||
      !/^[a-f0-9]{64}$/.test(String(value.imaginarySampleSha256))) ||
    !record(value.profile) || !exact(value.profile, ["normalAxis", "varyingAxis", "point",
      "vectorChannel", "visible"]) ||
    ![0, 1, 2].includes(value.profile.normalAxis as number) ||
    ![0, 1, 2].includes(value.profile.varyingAxis as number) ||
    value.profile.normalAxis === value.profile.varyingAxis ||
    !Array.isArray(value.profile.point) || value.profile.point.length !== 3 ||
    !value.profile.point.every(finite) ||
    !["p", "q", "r", "speed"].includes(String(value.profile.vectorChannel)) ||
    typeof value.profile.visible !== "boolean" ||
    !bounded(value.xName, 160) || !bounded(value.xUnit, 80) || !bounded(value.yUnit, 80) ||
    !/^sha256:[a-f0-9]{64}$/.test(String(value.vectorSourceHash)) ||
    !Array.isArray(value.vectorSamples) || ![0, 3].includes(value.vectorSamples.length) ||
    !value.vectorSamples.every((part: unknown) => record(part) && exact(part, ["name", "sampleSha256"]) &&
      bounded(part.name, 64) && typeof part.sampleSha256 === "string" && /^[a-f0-9]{64}$/.test(part.sampleSha256)) ||
    !/^[a-f0-9]{64}$/.test(String(value.scalarSampleSha256)) ||
    !/^sha256:[a-f0-9]{64}$/.test(String(value.rowsSha256))) return false;
  try {
    const field = parseVectorField3DDocument(value.vectorDocumentJson).source.field;
    return field.kind === "expressions" ? value.vectorSamples.length === 0 : value.vectorSamples.length === 3;
  } catch { return false; }
};
const validPointSeriesObject = (value: unknown): value is Graph2DPointSeriesObject => record(value) &&
  exact(value, ["id", "kind", "label", "table", "mode", "missing", "domain",
    ...(value.origin === undefined ? [] : ["origin"]),
    ...(value.analyticOrigin === undefined ? [] : ["analyticOrigin"]),
    ...(value.derivedOrigin === undefined ? [] : ["derivedOrigin"]),
    ...(value.linkedOrigin === undefined ? [] : ["linkedOrigin"])]) && objectId(value.id) &&
  value.kind === "point-series" && bounded(value.label, 160) && validPointTableReference(value.table) &&
  ["points", "line"].includes(String(value.mode)) && value.missing === "gap" && validDomain(value.domain) &&
  [value.origin, value.analyticOrigin, value.derivedOrigin, value.linkedOrigin].filter(item => item !== undefined).length <= 1 &&
  (value.origin === undefined || validGraph2DScientificDatasetOrigin(value.origin)) &&
  (value.analyticOrigin === undefined || validGraph2DAnalyticFieldOrigin(value.analyticOrigin)) &&
  (value.derivedOrigin === undefined || validGraph2DDerivedFieldOrigin(value.derivedOrigin)) &&
  (value.linkedOrigin === undefined || validGraph2DLinkedOverlayOrigin(value.linkedOrigin));
const validPiecewiseObject = (value: unknown, variables: readonly string[]): value is Graph2DPiecewiseObject => {
  if (!record(value) || !exact(value, ["id", "kind", "label", "pieces"]) || !objectId(value.id) ||
      value.kind !== "piecewise" || !bounded(value.label, 160) || !Array.isArray(value.pieces) ||
      value.pieces.length < 1 || value.pieces.length > 16 || !value.pieces.every((piece: unknown) => record(piece) &&
        exact(piece, ["expression", "domain"]) && validExpression(piece.expression, variables) && validDomain(piece.domain))) return false;
  for (let index = 1; index < value.pieces.length; index += 1) {
    const previous = value.pieces[index - 1] as Graph2DPiece;
    const current = value.pieces[index] as Graph2DPiece;
    if (current.domain.min < previous.domain.max || current.domain.min === previous.domain.max &&
        current.domain.includeMin && previous.domain.includeMax) return false;
  }
  return true;
};
const validSource = (value: unknown): value is Graph2DSource => {
  if (!record(value) || !exact(value, ["objects", "variables", "assumptions", ...(value.constructions !== undefined ? ["constructions"] : []),
      ...(value.fieldReferences !== undefined ? ["fieldReferences"] : []),
      ...(value.vectorFieldReferences !== undefined ? ["vectorFieldReferences"] : [])]) || !Array.isArray(value.objects) ||
      value.objects.length > GRAPH2D_MAX_OBJECTS ||
      !Array.isArray(value.variables) || value.variables.length > 16 ||
      !value.variables.every(isGraph2DParameter) ||
      new Set(value.variables.map((entry: { name: string }) => entry.name)).size !== value.variables.length ||
      !graph2DParameterExpressionsCurrent(value.variables) ||
      !Array.isArray(value.assumptions) || value.assumptions.length > 32 ||
      !value.assumptions.every((entry: unknown) => bounded(entry, 160)) ||
      (value.fieldReferences !== undefined && (!Array.isArray(value.fieldReferences) ||
        value.fieldReferences.length < 1 || value.fieldReferences.length > 16 ||
        !value.fieldReferences.every(isGraph2DFieldReference) ||
        new Set(value.fieldReferences.map((entry: Graph2DFieldReference) => entry.id)).size !== value.fieldReferences.length)) ||
      (value.vectorFieldReferences !== undefined && (!Array.isArray(value.vectorFieldReferences) ||
        value.vectorFieldReferences.length < 1 || value.vectorFieldReferences.length > 8 ||
        !value.vectorFieldReferences.every(isGraph2DVectorFieldReference) ||
        new Set(value.vectorFieldReferences.map((entry: Graph2DVectorFieldReference) => entry.id)).size !==
          value.vectorFieldReferences.length))) return false;
  const names = value.variables.map((entry: { name: string }) => entry.name);
  if (names.includes("t") && value.objects.some((entry: Graph2DGraphObject) => entry.kind === "parametric" || entry.kind === "time-ode")) return false;
  if (names.includes("theta") && value.objects.some((entry: Graph2DGraphObject) => entry.kind === "polar")) return false;
  if (names.includes("y") && value.objects.some((entry: Graph2DGraphObject) =>
    entry.kind === "implicit" || entry.kind === "inequality" || entry.kind === "slope-field" || entry.kind === "phase-portrait")) return false;
  return value.objects.every((entry: unknown) => validObject(entry, ["x", ...names]) ||
    validParametricObject(entry, ["t", ...names]) || validPolarObject(entry, ["theta", ...names]) ||
    validImplicitObject(entry, ["x", "y", ...names]) || validInequalityObject(entry, ["x", "y", ...names]) ||
    validPointSeriesObject(entry) || validPiecewiseObject(entry, ["x", ...names]) ||
    validSlopeFieldObject(entry, ["x", "y", ...names]) || validTrajectoryObject(entry) ||
    validTimeOdeObject(entry, ["t", "x", ...names]) ||
    validPhasePortraitObject(entry, ["x", "y", ...names])) &&
    new Set(value.objects.map((entry: Graph2DGraphObject) => entry.id)).size === value.objects.length &&
    (value.objects as Graph2DGraphObject[]).every((entry) => entry.kind !== "trajectory" ||
      (value.objects as Graph2DGraphObject[]).some((source) => source.kind === "slope-field" &&
        source.id === entry.sourceFieldId && entry.seed.x >= source.domain.min && entry.seed.x <= source.domain.max &&
        entry.seed.y >= source.yDomain.min && entry.seed.y <= source.yDomain.max)) &&
    (value.constructions === undefined || validateGraph2DConstructionSet(value.constructions, value.objects).length === 0);
};
const validDisplay = (value: unknown, source: Graph2DSource): value is Graph2DDisplay => {
  if (!record(value) || !exact(value, ["viewport", "axes", "objects", "sampling", ...(value.pinnedProbes !== undefined ? ["pinnedProbes"] : [])]) ||
      !isGraph2DViewport(value.viewport) ||
      !record(value.axes) || ![4, 5, 6].includes(Object.keys(value.axes).length) ||
      !["x", "y", "grid", "labels"].every((key) => Object.prototype.hasOwnProperty.call(value.axes, key)) ||
      Object.keys(value.axes).some((key) => !["x", "y", "grid", "labels", "gridMode", "gridOptions"].includes(key)) ||
      [value.axes.x, value.axes.y, value.axes.grid, value.axes.labels].some((item) => typeof item !== "boolean") ||
      (value.axes.gridMode !== undefined && !["cartesian", "polar"].includes(String(value.axes.gridMode))) ||
      (value.axes.gridMode === "polar" && (value.viewport.xScale === "log10" || value.viewport.yScale === "log10")) ||
      (value.axes.gridOptions !== undefined && !isGraph2DGridOptions(value.axes.gridOptions, value.viewport, String(value.axes.gridMode))) ||
      !Array.isArray(value.objects) || value.objects.length !== source.objects.length ||
      !value.objects.every((item: unknown, index: number) => record(item) && exact(item, ["objectId", "visible", "color", "lineWidth", "lineStyle"]) &&
        item.objectId === source.objects[index]?.id && typeof item.visible === "boolean" &&
        typeof item.color === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color) &&
        finite(item.lineWidth) && item.lineWidth >= 0.5 && item.lineWidth <= 12 &&
        ["solid", "dashed", "dotted"].includes(String(item.lineStyle))) ||
      !record(value.sampling) || !exact(value.sampling, ["maxSamples", "maxDepth", "tolerancePx"]) ||
      !integerWithin(value.sampling.maxSamples, 32, 200000) || !integerWithin(value.sampling.maxDepth, 1, 24) ||
      !finite(value.sampling.tolerancePx) || value.sampling.tolerancePx < 0.1 || value.sampling.tolerancePx > 16) return false;
  if (value.pinnedProbes !== undefined && (!Array.isArray(value.pinnedProbes) || value.pinnedProbes.length > GRAPH2D_MAX_PINNED_PROBES ||
    !value.pinnedProbes.every((probe: unknown) => record(probe) && exact(probe, ["id", "label", "objectId", "x", "y", "sourceHash", ...(probe.visible !== undefined ? ["visible"] : [])]) &&
      (probe.visible === undefined || typeof probe.visible === "boolean") &&
      objectId(probe.id) && bounded(probe.label, 80) && finite(probe.x) && finite(probe.y) &&
      typeof probe.sourceHash === "string" && /^sha256:[0-9a-f]{64}$/.test(probe.sourceHash) &&
      source.objects.some((object) => object.id === probe.objectId && object.kind === "explicit-cartesian")) ||
    new Set(value.pinnedProbes.map((probe: Graph2DPinnedProbe) => probe.id)).size !== value.pinnedProbes.length)) return false;
  return true;
};
const validSelection = (value: unknown, source: Graph2DSource): value is Graph2DSelection => {
  if (!record(value) || !exact(value, ["objectId", "probe",
    ...(value.linkedRegion === undefined ? [] : ["linkedRegion"])])) return false;
  const ids = new Set(source.objects.map((entry) => entry.id));
  if (value.objectId !== null && (typeof value.objectId !== "string" || !ids.has(value.objectId))) return false;
  if (value.linkedRegion !== undefined) {
    const linked = value.linkedRegion;
    if (!record(linked) || !exact(linked, ["pairId", "physical"]) ||
        typeof linked.pairId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(linked.pairId) ||
        !record(linked.physical)) return false;
    const physical = linked.physical;
    if (!(physical.kind === "point" ? exact(physical, ["kind", "x"]) &&
          finite(physical.x) : physical.kind === "interval" &&
          exact(physical, ["kind", "min", "max"]) && finite(physical.min) &&
          finite(physical.max) && physical.min <= physical.max)) return false;
    const selection = physical as Graph2DLinkedRegionSelection["physical"];
    if (!source.objects.some(object => {
      if (object.kind !== "point-series" || object.id !== value.objectId ||
          !object.linkedOrigin || object.linkedOrigin.pairId !== linked.pairId ||
          !("region" in object.linkedOrigin)) return false;
      const axis = object.linkedOrigin.kind ===
        "vector-scalar-complex-linked-region/v2" ?
          object.linkedOrigin.profileAxis ?? 0 : 0;
      const [min, max] = object.linkedOrigin.region.bounds[axis];
      return selection.kind === "point" ?
        selection.x >= min - 1e-9 && selection.x <= max + 1e-9 :
        selection.min >= min - 1e-9 && selection.max <= max + 1e-9;
    })) return false;
  }
  if (value.probe === null) return true;
  if (!record(value.probe) || ![3, 4].includes(Object.keys(value.probe).length) ||
    !["objectId", "x", "y"].every((key) => Object.prototype.hasOwnProperty.call(value.probe, key))) return false;
  const selected = source.objects.find((entry) => entry.id === value.objectId);
  if (selected?.kind === "slope-field" || selected?.kind === "trajectory" || selected?.kind === "phase-portrait" || selected?.kind === "time-ode") return false;
  const needsParameter = selected?.kind === "parametric" || selected?.kind === "polar";
  if (needsParameter !== Object.prototype.hasOwnProperty.call(value.probe, "parameter")) return false;
  const needsRow = selected?.kind === "point-series";
  if (needsRow !== Object.prototype.hasOwnProperty.call(value.probe, "rowId")) return false;
  return Object.keys(value.probe).every((key) => ["objectId", "x", "y", "parameter", "rowId"].includes(key)) &&
    typeof value.probe.objectId === "string" && value.probe.objectId === value.objectId &&
    finite(value.probe.x) && finite(value.probe.y) &&
    (!needsRow || typeof value.probe.rowId === "string" && /^row_[1-9][0-9]{0,4}$/.test(value.probe.rowId) &&
      Number(value.probe.rowId.slice(4)) <= selected.table.rowCount) &&
    (!needsParameter || finite(value.probe.parameter) && value.probe.parameter >= selected.domain.min &&
      value.probe.parameter <= selected.domain.max);
};

export const normalizeGraph2DDocument = (value: unknown): ValidationResult<Graph2DDocument> => {
  if (!record(value) || value.format !== GRAPH2D_DOCUMENT_FORMAT || value.schemaVersion !== GRAPH2D_DOCUMENT_SCHEMA_VERSION)
    return { ok: false, errors: ["Unsupported Graph2D document format or version."] };
  const errors: string[] = [];
  if (!exact(value, ["format", "schemaVersion", "identity", "requiredCapabilities", "source", "display", "selection", "metadata"]))
    errors.push("Graph2D document contains unknown or missing fields.");
  if (!isDocumentIdentity(value.identity) || !record(value.identity) ||
      !exact(value.identity, ["schemaVersion", "id", "revision", "structuralHash"]) ||
      !String(value.identity.id).startsWith("math3d:graph2d:")) errors.push("Invalid Graph2D identity.");
  const expectedCapabilities = validSource(value.source) ? graph2DRequiredCapabilities(value.source, record(value.display) ? value.display : undefined) :
    [GRAPH2D_EXPLICIT_CAPABILITY];
  if (!Array.isArray(value.requiredCapabilities) ||
      canonicalJsonStringify(value.requiredCapabilities) !== canonicalJsonStringify(expectedCapabilities))
    errors.push("Unsupported Graph2D required capabilities.");
  if (!validSource(value.source)) errors.push("Invalid Graph2D source or object list.");
  if (validSource(value.source) && !validDisplay(value.display, value.source)) errors.push("Invalid Graph2D display intent.");
  if (validSource(value.source) && !validSelection(value.selection, value.source)) errors.push("Invalid Graph2D selection or probe.");
  if (!record(value.metadata) || !exact(value.metadata, ["title"]) || !bounded(value.metadata.title, 160))
    errors.push("Invalid Graph2D metadata.");
  if (errors.length) return { ok: false, errors };
  try {
    const text = canonicalJsonStringify(value);
    if (new TextEncoder().encode(text).length > GRAPH2D_MAX_DOCUMENT_BYTES)
      return { ok: false, errors: ["Graph2D document exceeds size limit."] };
    const document = JSON.parse(text) as Graph2DDocument;
    if (document.identity.structuralHash !== structuralHash(document.source))
      return { ok: false, errors: ["Graph2D structural hash does not match source."] };
    return { ok: true, value: document };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

export const createGraph2DDocument = (input: {
  source: Graph2DSource;
  stableKey: CanonicalJsonValue;
  title?: string;
  identity?: DocumentIdentity;
  display?: Graph2DDisplay;
  selection?: Graph2DSelection;
}): Graph2DDocument => {
  const source = clone(input.source);
  const display = input.display ?? { viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, aspect: "equal" },
    axes: { x: true, y: true, grid: true, labels: true },
    objects: source.objects.map((object) => ({ objectId: object.id, visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" })),
    sampling: { maxSamples: 12000, maxDepth: 12, tolerancePx: 0.75 } };
  const candidate = {
    format: GRAPH2D_DOCUMENT_FORMAT, schemaVersion: GRAPH2D_DOCUMENT_SCHEMA_VERSION,
    identity: input.identity ?? createDocumentIdentity(createStableDocumentId("graph2d", input.stableKey), source),
    requiredCapabilities: graph2DRequiredCapabilities(source, display), source,
    display,
    selection: input.selection ?? { objectId: null, probe: null }, metadata: { title: input.title ?? "Graphs" },
  };
  const normalized = normalizeGraph2DDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const createEmptyGraph2DDocument = (stableKey: CanonicalJsonValue, title = "Graphs"): Graph2DDocument =>
  createGraph2DDocument({ source: { objects: [], variables: [], assumptions: [] }, stableKey, title });

export const serializeGraph2DDocument = (document: Graph2DDocument): string => {
  const normalized = normalizeGraph2DDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return canonicalJsonStringify(normalized.value);
};
export const parseGraph2DDocument = (text: string): Graph2DDocument => {
  if (new TextEncoder().encode(text).length > GRAPH2D_MAX_DOCUMENT_BYTES) throw new TypeError("Graph2D document exceeds size limit.");
  const normalized = normalizeGraph2DDocument(JSON.parse(text));
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
