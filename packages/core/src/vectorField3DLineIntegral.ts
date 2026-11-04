import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, createStableDocumentId, structuralHash,
  type CanonicalJsonValue } from "./documentIdentity";
import { createDocumentRelation } from "./documentRelations";
import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { normalizeScientificSelection, type ScientificSelection } from "./scientificSelection";
import { type VectorField3DDocument } from "./vectorField3DDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const VECTOR_FIELD3D_LINE_INTEGRAL_RESULT_TYPE = "vector3d.line-integral" as const;
export const VECTOR_FIELD3D_LINE_INTEGRAL_MAX_EVALUATIONS = 8192;
export type VectorField3DLineIntegralMode = "line-integral" | "circulation";
export type VectorField3DLineIntegralAnalysis = Readonly<{
  state: "complete" | "partial" | "unavailable";
  reason: "open-path" | "source-unavailable" | "incompatible-units" |
    "out-of-domain" | "undefined-field" | "evaluation-cap" | null;
  mode: VectorField3DLineIntegralMode; orientation: "forward" | "reverse";
  value: number | null; partialValue: number | null; errorEstimate: number | null;
  unit: string | null; method: "composite-simpson-8-richardson";
  coveredLength: number; totalLength: number; coverage: number;
  completedSegments: number; segmentCount: number; evaluations: number;
}>;

type Point = readonly [number, number, number];
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const sourceDocument = (project: Math3DProject, id: string): VectorField3DDocument | null => {
  const entry = project.workspace.entries.find(item => item.module === "vector3d" && item.expected.id === id);
  return entry?.checkpoint.format === "math3d.vector-field3d-document" ? entry.checkpoint : null;
};

/** Ordered physical vertices and direction are saved intent; no source provenance is inferred. */
export function createOrientedPolylineSelection(document: VectorField3DDocument,
  vertices: readonly Point[], closed: boolean, direction: "forward" | "reverse",
  stableKey: string): ScientificSelection {
  const selection = { format: "math3d.scientific-selection", schemaVersion: 1,
    identity: { kind: "authored", id: createStableDocumentId("scientific-selection",
      { sourceId: document.identity.id, stableKey }) }, role: "analysis",
    source: { kind: "document", documentId: document.identity.id,
      checkpoint: { revision: document.identity.revision,
        structuralHash: document.identity.structuralHash } },
    frame: { kind: "cartesian", axes: document.source.axes.map(axis =>
      ({ name: axis.label, unit: axis.unit })) },
    geometry: { kind: "oriented-polyline", vertices, closed, direction },
  };
  const checked = normalizeScientificSelection(selection);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}

/** Bounded segmentwise quadrature. A failed segment contributes no numerical claim. */
export function analyzeVectorField3DLineIntegral(document: VectorField3DDocument,
  selection: ScientificSelection, mode: VectorField3DLineIntegralMode,
  maxEvaluations = VECTOR_FIELD3D_LINE_INTEGRAL_MAX_EVALUATIONS): VectorField3DLineIntegralAnalysis {
  if (selection.identity.kind !== "authored" || selection.geometry.kind !== "oriented-polyline" ||
      selection.source?.kind !== "document" || selection.source.documentId !== document.identity.id)
    throw new TypeError("Choose a saved oriented polyline for this vector source.");
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 40 ||
      maxEvaluations > VECTOR_FIELD3D_LINE_INTEGRAL_MAX_EVALUATIONS)
    throw new RangeError("Line-integral evaluation cap must be 40–8192.");
  const geometry = selection.geometry, vertices = geometry.vertices as readonly Point[];
  const pairs = vertices.slice(1).map((point, i) => [vertices[i]!, point] as const);
  if (geometry.closed) pairs.push([vertices[vertices.length - 1]!, vertices[0]!]);
  const totalLength = pairs.reduce((sum, [a, b]) => sum + distance(a, b), 0);
  const base = { mode, orientation: geometry.direction, unit: null,
    method: "composite-simpson-8-richardson" as const, totalLength,
    segmentCount: pairs.length, evaluations: 0 };
  const unavailable = (reason: VectorField3DLineIntegralAnalysis["reason"]): VectorField3DLineIntegralAnalysis =>
    ({ ...base, state: "unavailable", reason, value: null, partialValue: null,
      errorEstimate: null, coveredLength: 0, coverage: 0, completedSegments: 0 });
  if (mode === "circulation" && !geometry.closed) return unavailable("open-path");
  const field = document.source.field;
  if (field.kind !== "expressions") return unavailable("source-unavailable");
  const axes = document.source.axes;
  if (axes.some(axis => axis.unit !== axes[0].unit) ||
      field.components.some(component => component.unit !==
        field.components[0].unit)) return unavailable("incompatible-units");
  const unit = `${field.components[0].unit}·${axes[0].unit}`;
  const direction = geometry.direction === "forward" ? 1 : -1;
  let value = 0, error = 0, coveredLength = 0, completedSegments = 0, evaluations = 0;
  let firstFailure: VectorField3DLineIntegralAnalysis["reason"] = null;
  for (const [a, b] of pairs) {
    const delta: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let segmentValue = 0, segmentError = 0;
    const at = (t: number): number | null => {
      if (evaluations >= maxEvaluations) { firstFailure ??= "evaluation-cap"; return null; }
      evaluations++;
      const point: Point = [a[0] + t * delta[0], a[1] + t * delta[1], a[2] + t * delta[2]];
      if (point.some((coordinate, axis) => coordinate < axes[axis]!.min ||
          coordinate > axes[axis]!.max)) { firstFailure ??= "out-of-domain"; return null; }
      const values = field.components.map(component => evaluateGraph2DExpression(
          component.ast, { x: point[0], y: point[1], z: point[2] },
          { maxEvaluations: 256 }));
      if (values.length !== 3 || values.some(item => !item.ok || !Number.isFinite(item.value))) {
        firstFailure ??= "undefined-field"; return null;
      }
      return values.reduce((sum, item, axis) => sum + (item.ok ? item.value : 0) * delta[axis]!, 0);
    };
    let complete = true;
    for (let cell = 0; cell < 8; cell++) {
      const t = cell / 8, h = 1 / 8;
      const f0 = at(t), f1 = at(t + h / 4), f2 = at(t + h / 2),
        f3 = at(t + 3 * h / 4), f4 = at(t + h);
      if ([f0, f1, f2, f3, f4].some(item => item === null)) { complete = false; break; }
      const coarse = h * (f0! + 4 * f2! + f4!) / 6;
      const fine = h * (f0! + 4 * f1! + 2 * f2! + 4 * f3! + f4!) / 12;
      segmentValue += fine + (fine - coarse) / 15;
      segmentError += Math.abs(fine - coarse) / 15;
    }
    if (complete) { value += segmentValue; error += segmentError;
      coveredLength += distance(a, b); completedSegments++; }
    if (firstFailure === "evaluation-cap") break;
  }
  const state = completedSegments === pairs.length ? "complete" :
    completedSegments ? "partial" : "unavailable";
  return { ...base, unit, state, reason: state === "complete" ? null : firstFailure,
    value: state === "complete" ? direction * value : null,
    partialValue: state === "partial" ? direction * value : null,
    errorEstimate: state === "complete" ? error : null,
    coveredLength, coverage: totalLength > 0 ? coveredLength / totalLength : 0,
    completedSegments, evaluations };
}

export function createVectorField3DLineIntegralResult(document: VectorField3DDocument,
  selection: ScientificSelection, analysis: VectorField3DLineIntegralAnalysis,
  elapsedMs = 0): AnalysisResultEnvelope {
  if (selection.identity.kind !== "authored" || selection.geometry.kind !== "oriented-polyline" ||
      selection.source?.kind !== "document" || selection.source.checkpoint?.revision !==
        document.identity.revision || selection.source.checkpoint.structuralHash !==
        document.identity.structuralHash || selection.source.documentId !== document.identity.id)
    throw new TypeError("Selection source generation must match the current vector source.");
  const fresh = analyzeVectorField3DLineIntegral(document, selection, analysis.mode);
  if (canonicalJsonStringify(fresh) !== canonicalJsonStringify(analysis))
    throw new TypeError("Line-integral analysis no longer matches the saved source and path.");
  const source = viewerSourceFromDocument(document), selectionHash = structuralHash(selection);
  const summary: Record<string, CanonicalJsonValue> = {
    state: analysis.state, reason: analysis.reason, value: analysis.value,
    partialValue: analysis.partialValue, unit: analysis.unit,
    errorEstimate: analysis.errorEstimate, method: analysis.method,
    coveredLength: analysis.coveredLength, totalLength: analysis.totalLength,
    coverage: analysis.coverage, completedSegments: analysis.completedSegments,
    segmentCount: analysis.segmentCount, evaluations: analysis.evaluations,
  };
  const parameters: Record<string, CanonicalJsonValue> = { selectionId: selection.identity.id,
    selectionHash, mode: analysis.mode, orientation: analysis.orientation,
    summaryHash: structuralHash(summary) };
  const resultId = `vector3d-line-integral:${structuralHash({ source, parameters }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId,
    status: analysis.state === "complete" ? "numerical" : "unsupported",
    provenance: { source, operation: { type: VECTOR_FIELD3D_LINE_INTEGRAL_RESULT_TYPE,
      algorithm: analysis.method, algorithmVersion: "1", parameters },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D line integral", version: "1" }, elapsedMs },
    summary, warnings: analysis.state === "complete" ? [] :
      [`Line integral ${analysis.state}: ${analysis.reason ?? "incomplete coverage"}.`],
    diagnostics: [], artifacts: [] });
}

export function upsertProjectLineIntegralResult(project: Math3DProject,
  result: AnalysisResultEnvelope): Math3DProject {
  if (result.provenance.operation.type !== VECTOR_FIELD3D_LINE_INTEGRAL_RESULT_TYPE)
    throw new TypeError("Expected a line-integral result.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const selectionId = result.provenance.operation.parameters.selectionId;
  const selection = current.workspace.scientificSelections?.find(item =>
    item.identity.kind === "authored" && item.identity.id === selectionId);
  const source = sourceDocument(current, result.provenance.source.documentId);
  if (typeof selectionId !== "string" || !selection || !source)
    throw new TypeError("Save the source and oriented selection in this Project first.");
  const mode = result.provenance.operation.parameters.mode;
  if (mode !== "line-integral" && mode !== "circulation")
    throw new TypeError("Unknown line-integral measurement.");
  const expected = createVectorField3DLineIntegralResult(source, selection,
    analyzeVectorField3DLineIntegral(source, selection, mode));
  if (expected.resultId !== result.resultId || expected.status !== result.status ||
      canonicalJsonStringify(expected.provenance.operation) !==
        canonicalJsonStringify(result.provenance.operation) ||
      canonicalJsonStringify(expected.summary) !== canonicalJsonStringify(result.summary))
    throw new TypeError("Line-integral result does not match the saved Project source and path.");
  const relation = createDocumentRelation({ kind: "analysis-of", sources: [result.provenance.source],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: VECTOR_FIELD3D_LINE_INTEGRAL_RESULT_TYPE },
    operation: VECTOR_FIELD3D_LINE_INTEGRAL_RESULT_TYPE,
    parameters: result.provenance.operation.parameters });
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace,
    results: [...current.workspace.results.filter(item => item.resultId !== result.resultId), result],
    relations: [...current.workspace.relations.filter(item => item.relationId !== relation.relationId), relation] }));
}

export function projectLineIntegralStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, liveDocument?: VectorField3DDocument): Readonly<{ status: "current" | "withheld";
    reason: string | null; value: number | null }> {
  if (result.provenance.operation.type !== VECTOR_FIELD3D_LINE_INTEGRAL_RESULT_TYPE)
    return { status: "withheld", reason: "wrong-result-type", value: null };
  if (liveDocument && (liveDocument.identity.id !== result.provenance.source.documentId ||
      liveDocument.identity.revision !== result.provenance.source.revision ||
      liveDocument.identity.structuralHash !== result.provenance.source.structuralHash))
    return { status: "withheld", reason: "source-changed", value: null };
  const source = sourceDocument(project, result.provenance.source.documentId);
  if (!source) return { status: "withheld", reason: "source-missing", value: null };
  if (source.identity.revision !== result.provenance.source.revision ||
      source.identity.structuralHash !== result.provenance.source.structuralHash)
    return { status: "withheld", reason: "source-changed", value: null };
  const selection = project.workspace.scientificSelections?.find(item => item.identity.kind === "authored" &&
    item.identity.id === result.provenance.operation.parameters.selectionId);
  if (!selection) return { status: "withheld", reason: "selection-missing", value: null };
  if (structuralHash(selection) !== result.provenance.operation.parameters.selectionHash)
    return { status: "withheld", reason: "selection-changed", value: null };
  if (structuralHash(result.summary) !== result.provenance.operation.parameters.summaryHash)
    return { status: "withheld", reason: "result-changed", value: null };
  const state = result.summary.state;
  if (state !== "complete" || typeof result.summary.value !== "number")
    return { status: "withheld", reason: state === "partial" ? "partial-coverage" :
      String(result.summary.reason ?? "unavailable"), value: null };
  return { status: "current", reason: null, value: result.summary.value };
}
