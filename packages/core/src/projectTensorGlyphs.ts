import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { compileProjectDerivedFieldEvaluator } from "./derivedFieldEvaluation";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { reviewProjectDerivedField } from "./projectDerivedFields";
import { verifiedVectorFieldSampler, type VerifiedVectorFieldTransfer } from
  "./verifiedVectorFieldSampling";

type Vec3 = readonly [number, number, number];
export type TensorGlyphRecipe = Readonly<{ derivedFieldId: string;
  normalAxis: 0 | 1 | 2; coordinate: number; density: readonly [number, number] }>;
export type PrincipalTensorGlyph = Readonly<{ point: Vec3; direction: Vec3;
  eigenvalue: number }>;
export type TensorGlyphStudy = Readonly<{ status: "ready" | "unavailable";
  reason: string | null; glyphs: readonly PrincipalTensorGlyph[];
  sampled: number; evaluations: number; publication: AnalysisResultEnvelope | null }>;

const currentSource = (project: Math3DProject, id: string) =>
  project.workspace.entries.find(entry => entry.module === "vector3d" &&
    entry.expected.id === id && entry.checkpoint.format === "math3d.vector-field3d-document");
const finite = (value: number) => Number.isFinite(value);
const recipeValid = (recipe: TensorGlyphRecipe) =>
  typeof recipe.derivedFieldId === "string" && recipe.derivedFieldId.length > 0 &&
  [0, 1, 2].includes(recipe.normalAxis) && finite(recipe.coordinate) &&
  Array.isArray(recipe.density) && recipe.density.length === 2 &&
  recipe.density.every(value => Number.isSafeInteger(value) && value >= 2 && value <= 8) &&
  recipe.density[0] * recipe.density[1] <= 64;

/** Fixed-sweep Jacobi solver; only a separated principal direction is publishable. */
export function principalSymmetricDirection(matrix: readonly (readonly number[])[]):
  Readonly<{ direction: Vec3; eigenvalue: number }> | null {
  if (matrix.length !== 3 || matrix.some(row => row.length !== 3 || row.some(value => !finite(value))))
    return null;
  const scale = Math.max(...matrix.flat().map(Math.abs));
  if (scale === 0) return null;
  if ([0, 1, 2].some(i => [i + 1, 2].filter(j => j < 3).some(j =>
    Math.abs(matrix[i]![j]! - matrix[j]![i]!) > scale * 1e-8))) return null;
  const a = matrix.map(row => [...row]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 18; sweep++) {
    let changed = false;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const off = a[p]![q]!;
      if (Math.abs(off) <= scale * 1e-12) continue;
      changed = true;
      const angle = .5 * Math.atan2(2 * off, a[q]![q]! - a[p]![p]!);
      const c = Math.cos(angle), s = Math.sin(angle);
      // Rotation columns [c,-s] and [s,c].
      for (let k = 0; k < 3; k++) {
        const ap = a[k]![p]!, aq = a[k]![q]!;
        a[k]![p] = c * ap - s * aq; a[k]![q] = s * ap + c * aq;
        const vp = v[k]![p]!, vq = v[k]![q]!;
        v[k]![p] = c * vp - s * vq; v[k]![q] = s * vp + c * vq;
      }
      for (let k = 0; k < 3; k++) {
        const ap = a[p]![k]!, aq = a[q]![k]!;
        a[p]![k] = c * ap - s * aq; a[q]![k] = s * ap + c * aq;
      }
    }
    if (!changed) break;
  }
  const roots = [0, 1, 2].map(index => ({ index, value: a[index]![index]! }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  const top = roots[0]!, second = roots[1]!;
  if (Math.abs(top.value) - Math.abs(second.value) <= scale * 1e-5 ||
      Math.abs(top.value) <= scale * 1e-8) return null;
  const raw = [v[0]![top.index]!, v[1]![top.index]!, v[2]![top.index]!];
  const length = Math.hypot(...raw);
  if (!finite(length) || length < .99) return null;
  const direction = raw.map(value => value / length) as unknown as Vec3;
  const residual = Math.hypot(...[0, 1, 2].map(i =>
    matrix[i]!.reduce((sum, value, j) => sum + value * direction[j]!, 0) -
      top.value * direction[i]!));
  return residual <= scale * 1e-7 ? { direction, eigenvalue: top.value } : null;
}

/** Bounded physical slice of an existing symmetric derived tensor. No partial glyphs publish. */
export function computeProjectTensorGlyphs(project: Math3DProject,
  recipe: TensorGlyphRecipe,
  transfers: ReadonlyMap<string, VerifiedVectorFieldTransfer> = new Map()): TensorGlyphStudy {
  if (!recipeValid(recipe)) throw new RangeError("Tensor glyph recipe exceeds the 64-glyph cap or has invalid coordinates.");
  const unavailable = (reason: string, sampled = 0, evaluations = 0): TensorGlyphStudy =>
    ({ status: "unavailable", reason, glyphs: [], sampled, evaluations, publication: null });
  const current = parseMath3DProject(serializeMath3DProject(project));
  const derived = current.workspace.derivedFields?.find(item =>
    item.identity.id === recipe.derivedFieldId);
  if (!derived || derived.output.kind !== "tensor" ||
      !["scalar-hessian", "jacobian-symmetric"].includes(derived.operation.kind))
    return unavailable("A saved symmetric Hessian or Jacobian is required.");
  const axes = derived.output.axes;
  if (axes.length !== 3 || axes.some((axis, index) =>
      axis.name !== ["x", "y", "z"][index] || axis.unit !== axes[0]!.unit))
    return unavailable("Tensor glyphs require a Cartesian orthonormal frame and matching coordinate units.");
  const normal = axes[recipe.normalAxis]!;
  if (recipe.coordinate < normal.min || recipe.coordinate > normal.max)
    return unavailable("The slice is outside the physical tensor domain.");
  const verify = (source: import("./vectorField3DDocument").VectorField3DDocument) => {
    if (source.source.field.kind === "expressions") return true;
    const transfer = transfers.get(source.identity.id);
    if (!transfer) return false;
    try { verifiedVectorFieldSampler(source, transfer); return true; }
    catch { return false; }
  };
  const review = reviewProjectDerivedField(current, derived.identity.id, verify);
  if (review.status !== "current") return unavailable(`Tensor source ${review.status}.`);
  const evaluator = compileProjectDerivedFieldEvaluator(current, derived.identity.id, 8192, transfers);
  const varying = axes.filter(axis => axis.index !== recipe.normalAxis);
  const glyphs: PrincipalTensorGlyph[] = [];
  let sampled = 0;
  for (let j = 0; j < recipe.density[1]; j++) for (let i = 0; i < recipe.density[0]; i++) {
    const point: number[] = [0, 0, 0]; point[recipe.normalAxis] = recipe.coordinate;
    point[varying[0]!.index] = varying[0]!.min +
      (varying[0]!.max - varying[0]!.min) * (i + 1) / (recipe.density[0] + 1);
    point[varying[1]!.index] = varying[1]!.min +
      (varying[1]!.max - varying[1]!.min) * (j + 1) / (recipe.density[1] + 1);
    const sample = evaluator.sampleDetailed(point as unknown as Vec3);
    sampled++;
    if (sample.status !== "value" || !Array.isArray(sample.value) ||
        !Array.isArray(sample.value[0]))
      return unavailable(sample.status === "unavailable" ? sample.reason :
        "Tensor sample is unavailable.", sampled, evaluator.evaluations());
    const principal = principalSymmetricDirection(sample.value as readonly (readonly number[])[]);
    if (!principal) return unavailable("Principal eigenvalue is ambiguous or poorly conditioned.",
      sampled, evaluator.evaluations());
    glyphs.push({ point: point as unknown as Vec3, ...principal });
  }
  const sourceInput = derived.input.kind === "vector3d" ? derived.input :
    (() => { let parent = derived.input; while (parent.kind === "derived") {
      const ancestor = current.workspace.derivedFields?.find(item => item.identity.id === parent.documentId);
      if (!ancestor) throw new TypeError("Derived tensor ancestry is missing.");
      parent = ancestor.input;
    } return parent; })();
  const source = currentSource(current, sourceInput.documentId);
  if (!source) return unavailable("Source document is missing.", sampled, evaluator.evaluations());
  const pin = source.checkpoint.identity;
  const glyphHash = structuralHash(glyphs);
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.tensor-glyphs.${structuralHash({ pin, derived: derived.identity,
      recipe }).slice(7)}`,
    status: "numerical",
    provenance: { source: { documentId: pin.id, revision: pin.revision,
      structuralHash: pin.structuralHash, generation: pin.revision },
      operation: { type: "vector3d.tensor-glyphs", algorithm: "symmetric-jacobi-principal",
        algorithmVersion: "1", parameters: { recipe, derivedRevision: derived.identity.revision,
          derivedHash: derived.identity.structuralHash } },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary: { glyphHash, glyphCount: glyphs.length, sampled,
      evaluations: evaluator.evaluations(), tensorUnit: derived.output.unit,
      coordinateUnit: axes[0]!.unit, coverage: "complete" },
    warnings: ["Only the locally separated principal direction is shown; sign is arbitrary."],
    diagnostics: [], artifacts: [] });
  return { status: "ready", reason: null, glyphs, sampled,
    evaluations: evaluator.evaluations(), publication };
}

export function projectTensorGlyphStatus(project: Math3DProject,
  result: AnalysisResultEnvelope,
  transfers: ReadonlyMap<string, VerifiedVectorFieldTransfer> = new Map()):
  Readonly<{ status: "current" | "withheld"; reason: string | null }> {
  if (result.provenance.operation.type !== "vector3d.tensor-glyphs")
    return { status: "withheld", reason: "wrong-result-type" };
  const parameters = result.provenance.operation.parameters;
  const recipe = parameters.recipe as TensorGlyphRecipe;
  if (!recipe || !recipeValid(recipe)) return { status: "withheld", reason: "recipe-invalid" };
  const derived = project.workspace.derivedFields?.find(item => item.identity.id === recipe.derivedFieldId);
  if (!derived || derived.identity.revision !== parameters.derivedRevision ||
      derived.identity.structuralHash !== parameters.derivedHash)
    return { status: "withheld", reason: "derived-recipe-changed" };
  const pin = result.provenance.source;
  const entry = currentSource(project, pin.documentId);
  if (!entry || entry.expected.revision !== pin.revision ||
      entry.expected.structuralHash !== pin.structuralHash ||
      entry.checkpoint.identity.structuralHash !== pin.structuralHash)
    return { status: "withheld", reason: "source-missing-or-changed" };
  if (result.resultId !== `vector3d.tensor-glyphs.${structuralHash({
      pin: entry.checkpoint.identity, derived: derived.identity, recipe }).slice(7)}`)
    return { status: "withheld", reason: "recipe-changed" };
  const verify = (source: import("./vectorField3DDocument").VectorField3DDocument) =>
    source.source.field.kind === "expressions" || transfers.has(source.identity.id) &&
      (() => { try { verifiedVectorFieldSampler(source, transfers.get(source.identity.id)!); return true; }
        catch { return false; } })();
  const review = reviewProjectDerivedField(project, derived.identity.id, verify);
  return review.status === "current" ? { status: "current", reason: null } :
    { status: "withheld", reason: `tensor-source-${review.status}` };
}

export function upsertProjectTensorGlyphs(project: Math3DProject,
  study: TensorGlyphStudy,
  transfers: ReadonlyMap<string, VerifiedVectorFieldTransfer> = new Map()): Math3DProject {
  if (study.status !== "ready" || !study.publication)
    throw new TypeError("Only a complete tensor glyph study can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const recalculated = computeProjectTensorGlyphs(current,
    study.publication.provenance.operation.parameters.recipe as TensorGlyphRecipe, transfers);
  if (recalculated.status !== "ready" ||
      recalculated.publication?.resultId !== study.publication.resultId ||
      structuralHash(recalculated.publication?.summary) !== structuralHash(study.publication.summary))
    throw new TypeError("Tensor glyphs differ from the verified source and recipe.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
