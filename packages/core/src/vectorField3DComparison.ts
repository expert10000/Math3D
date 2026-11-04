import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { createDocumentRelation } from "./documentRelations";
import { structuralHash, type CanonicalJsonValue } from "./documentIdentity";
import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const VECTOR_FIELD3D_COMPARISON_RESULT_TYPE = "vector3d.field-comparison" as const;
export type VectorField3DComparisonPolicy = Readonly<{
  frame: "cartesian-identical";
  grid: readonly [number, number, number];
  units: "identical";
  interpolation: "analytic-direct";
  coverage: "complete-or-withhold";
}>;
export type VectorField3DComparison = Readonly<{
  policy: VectorField3DComparisonPolicy;
  sourceA: ReturnType<typeof viewerSourceFromDocument>;
  sourceB: ReturnType<typeof viewerSourceFromDocument>;
  sampled: number; valid: number; gaps: number; angularUndefined: number;
  vectorDifference: Readonly<{ mean: number | null; max: number | null; rms: number | null; unit: string }>;
  scalarMagnitudeDifference: Readonly<{ mean: number | null; maxAbsolute: number | null; unit: string }>;
  angularError: Readonly<{ meanRadians: number | null; maxRadians: number | null }>;
  status: "complete" | "incomplete";
}>;

/** Explicit first-gate policy: identical Cartesian domains and units, direct analytic sampling. */
export function compareVectorField3D(a: VectorField3DDocument, b: VectorField3DDocument,
  policy: VectorField3DComparisonPolicy): VectorField3DComparison {
  const left = normalizeVectorField3DDocument(a), right = normalizeVectorField3DDocument(b);
  if (!left.ok || !right.ok) throw new TypeError("Comparison sources must be valid Project documents.");
  if (a.identity.id === b.identity.id) throw new TypeError("Choose two distinct field sources.");
  if (policy.frame !== "cartesian-identical" || policy.units !== "identical" ||
      policy.interpolation !== "analytic-direct" || policy.coverage !== "complete-or-withhold")
    throw new TypeError("Frame, unit, interpolation and coverage policy must be explicit.");
  if (!Array.isArray(policy.grid) || policy.grid.length !== 3 || policy.grid.some(n =>
      !Number.isSafeInteger(n) || n < 2 || n > 16) ||
      policy.grid[0] * policy.grid[1] * policy.grid[2] > 4096)
    throw new RangeError("Comparison grid must contain 2–16 points per axis and at most 4096 points.");
  const aField = a.source.field, bField = b.source.field;
  if (aField.kind !== "expressions" || bField.kind !== "expressions")
    throw new TypeError("Analytic-direct comparison requires two authored expression fields; verified bundle resampling needs its own policy.");
  if (a.source.axes.some((axis, i) => axis.label !== b.source.axes[i]!.label ||
      axis.unit !== b.source.axes[i]!.unit || axis.min !== b.source.axes[i]!.min ||
      axis.max !== b.source.axes[i]!.max) ||
      aField.components.some((component, i) => component.unit !== bField.components[i]!.unit) ||
      new Set(aField.components.map(component => component.unit)).size !== 1)
    throw new TypeError("Both fields require identical Cartesian axes, domain and component units.");
  let valid = 0, angularUndefined = 0, vectorSum = 0, vectorSquared = 0;
  let vectorMax = 0, scalarSum = 0, scalarMax = 0, angleSum = 0, angleMax = 0;
  for (let i = 0; i < policy.grid[0]; i++) for (let j = 0; j < policy.grid[1]; j++)
    for (let k = 0; k < policy.grid[2]; k++) {
      const position = [i, j, k].map((index, axis) => {
        const bounds = a.source.axes[axis]!;
        return bounds.min + (bounds.max - bounds.min) * index / (policy.grid[axis]! - 1);
      });
      const variables = { x: position[0]!, y: position[1]!, z: position[2]! };
      const sample = (document: VectorField3DDocument) => document.source.field.kind === "expressions" ?
        document.source.field.components.map(component => evaluateGraph2DExpression(component.ast,
          variables, { maxEvaluations: 256 })) : [];
      const av = sample(a), bv = sample(b);
      if (av.some(value => !value.ok) || bv.some(value => !value.ok)) continue;
      const x = av.map(value => value.ok ? value.value : NaN),
        y = bv.map(value => value.ok ? value.value : NaN);
      if (![...x, ...y].every(Number.isFinite)) continue;
      const ma = Math.hypot(...x), mb = Math.hypot(...y),
        delta = Math.hypot(...x.map((value, index) => value - y[index]!));
      if (![ma, mb, delta].every(Number.isFinite)) continue;
      valid++; vectorSum += delta; vectorSquared += delta * delta;
      vectorMax = Math.max(vectorMax, delta);
      const scalar = ma - mb;
      scalarSum += scalar; scalarMax = Math.max(scalarMax, Math.abs(scalar));
      if (ma === 0 || mb === 0) { angularUndefined++; continue; }
      const cosine = x.reduce((sum, value, index) => sum + value * y[index]!, 0) / (ma * mb);
      const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
      angleSum += angle; angleMax = Math.max(angleMax, angle);
    }
  const sampled = policy.grid[0] * policy.grid[1] * policy.grid[2];
  const unit = aField.components[0].unit;
  return { policy, sourceA: viewerSourceFromDocument(a), sourceB: viewerSourceFromDocument(b),
    sampled, valid, gaps: sampled - valid, angularUndefined,
    vectorDifference: { mean: valid ? vectorSum / valid : null,
      max: valid ? vectorMax : null, rms: valid ? Math.sqrt(vectorSquared / valid) : null, unit },
    scalarMagnitudeDifference: { mean: valid ? scalarSum / valid : null,
      maxAbsolute: valid ? scalarMax : null, unit },
    angularError: { meanRadians: valid > angularUndefined ? angleSum / (valid - angularUndefined) : null,
      maxRadians: valid > angularUndefined ? angleMax : null },
    status: valid === sampled ? "complete" : "incomplete" };
}

export function createVectorField3DComparisonResult(comparison: VectorField3DComparison): AnalysisResultEnvelope {
  const parameters: Record<string, CanonicalJsonValue> = {
    secondSource: comparison.sourceB as unknown as CanonicalJsonValue,
    frame: comparison.policy.frame, counts: [...comparison.policy.grid],
    units: comparison.policy.units, interpolation: comparison.policy.interpolation,
    coverage: comparison.policy.coverage,
  };
  const summary = { sampled: comparison.sampled, valid: comparison.valid, gaps: comparison.gaps,
    angularUndefined: comparison.angularUndefined,
    vectorDifference: comparison.vectorDifference,
    scalarMagnitudeDifference: comparison.scalarMagnitudeDifference,
    angularError: comparison.angularError,
    state: comparison.status } as unknown as Record<string, CanonicalJsonValue>;
  parameters.summaryHash = structuralHash(summary);
  return createAnalysisResultEnvelope({
    resultId: `vector3d-comparison:${structuralHash({ a: comparison.sourceA,
      b: comparison.sourceB, parameters, summary }).slice(7)}`,
    status: comparison.status === "complete" ? "numerical" : "unsupported",
    provenance: { source: comparison.sourceA,
      operation: { type: VECTOR_FIELD3D_COMPARISON_RESULT_TYPE,
        algorithm: "bounded-cartesian-direct", algorithmVersion: "1", parameters },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary, warnings: comparison.status === "complete" ? [] :
      ["Coverage is incomplete; comparison values are withheld."], diagnostics: [], artifacts: [] });
}

export function projectVectorField3DComparisonStatus(project: Math3DProject,
  result: AnalysisResultEnvelope): Readonly<{ status: "current" | "withheld"; reason: string | null }> {
  if (result.provenance.operation.type !== VECTOR_FIELD3D_COMPARISON_RESULT_TYPE)
    return { status: "withheld", reason: "wrong-result-type" };
  if (result.provenance.operation.parameters.summaryHash !== structuralHash(result.summary))
    return { status: "withheld", reason: "result-changed" };
  const sources = [result.provenance.source,
    result.provenance.operation.parameters.secondSource];
  for (const [index, pin] of sources.entries()) {
    if (!pin || typeof pin !== "object" || Array.isArray(pin))
      return { status: "withheld", reason: "invalid-source-pin" };
    const expected = pin as { documentId?: string; revision?: number; structuralHash?: string };
    const document = project.workspace.entries.find(item => item.module === "vector3d" &&
      item.expected.id === expected.documentId)?.checkpoint;
    if (document?.format !== "math3d.vector-field3d-document")
      return { status: "withheld", reason: `source-${index + 1}-missing` };
    if (document.identity.revision !== expected.revision ||
        document.identity.structuralHash !== expected.structuralHash)
      return { status: "withheld", reason: `source-${index + 1}-changed` };
  }
  return result.status === "numerical" && result.summary.state === "complete" ?
    { status: "current", reason: null } : { status: "withheld", reason: "incomplete-coverage" };
}

export function upsertProjectVectorField3DComparison(project: Math3DProject,
  result: AnalysisResultEnvelope): Math3DProject {
  const current = parseMath3DProject(serializeMath3DProject(project));
  if (projectVectorField3DComparisonStatus(current, result).status !== "current")
    throw new TypeError("Both pinned sources and complete coverage are required to save comparison values.");
  const pin = result.provenance.operation.parameters.secondSource as { documentId: string };
  const first = current.workspace.entries.find(item => item.expected.id ===
    result.provenance.source.documentId)!.checkpoint as VectorField3DDocument;
  const second = current.workspace.entries.find(item => item.expected.id === pin.documentId)!
    .checkpoint as VectorField3DDocument;
  const parameters = result.provenance.operation.parameters;
  const policy = { frame: parameters.frame, grid: parameters.counts,
    units: parameters.units, interpolation: parameters.interpolation,
    coverage: parameters.coverage } as VectorField3DComparisonPolicy;
  const expected = createVectorField3DComparisonResult(compareVectorField3D(first, second, policy));
  if (expected.resultId !== result.resultId || structuralHash(expected.summary) !== structuralHash(result.summary))
    throw new TypeError("Comparison values no longer match the two saved sources.");
  const relation = createDocumentRelation({ kind: "analysis-of",
    sources: [viewerSourceFromDocument(first), viewerSourceFromDocument(second)],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: VECTOR_FIELD3D_COMPARISON_RESULT_TYPE },
    operation: VECTOR_FIELD3D_COMPARISON_RESULT_TYPE,
    parameters: result.provenance.operation.parameters });
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace,
    results: [...current.workspace.results.filter(item => item.resultId !== result.resultId), result],
    relations: [...current.workspace.relations.filter(item => item.relationId !== relation.relationId), relation] }));
}
