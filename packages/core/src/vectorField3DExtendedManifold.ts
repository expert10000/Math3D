import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { projectLocalManifoldPatchStatus, type LocalManifoldPatch,
  type LocalManifoldMeshPromotion, type LocalManifoldRecipe } from
  "./vectorField3DManifoldPatch";
import { computeVectorField3DManifoldContinuation,
  promoteProjectManifoldContinuation, projectManifoldContinuationStatus,
  type ManifoldContinuationStudy } from "./vectorField3DManifoldContinuation";
import type { VectorField3DDocument } from "./vectorField3DDocument";

type Bounds = readonly [readonly [number, number], readonly [number, number],
  readonly [number, number]];
export type ExtendedManifoldRecipe = Readonly<{ domain: Bounds;
  targetExtraTime: number; maxAttempts: number; maxEvaluations: number }>;
export type ExtendedManifoldAttempt = Readonly<{ extraTime: number;
  status: "validated" | "unavailable"; reason: string | null;
  prefixError: number | null; selfIntersectionPairs: number;
  evaluations: number; vertices: number }>;
export type ExtendedManifoldStudy = Readonly<{ status: "validated" | "unavailable";
  reason: string | null; stopReason: string; attempts: readonly ExtendedManifoldAttempt[];
  continuation: ManifoldContinuationStudy | null;
  publication: AnalysisResultEnvelope | null }>;

/** Repeats the nested local validation at increasing ring counts within explicit work and domain bounds. */
export function computeVectorField3DExtendedManifold(project: Math3DProject,
  document: VectorField3DDocument, base: LocalManifoldPatch,
  recipe: ExtendedManifoldRecipe, shouldCancel?: () => boolean): ExtendedManifoldStudy {
  const unavailable = (reason: string, attempts: readonly ExtendedManifoldAttempt[] = []):
    ExtendedManifoldStudy => ({ status: "unavailable", reason, stopReason: reason,
      attempts, continuation: null, publication: null });
  if (!base.publication || base.status !== "resolved" ||
      projectLocalManifoldPatchStatus(project, base.publication).status !== "current" ||
      !project.workspace.results.some(item => item.resultId === base.publication!.resultId))
    return unavailable("saved-base-patch-required");
  const baseRecipe = base.publication.provenance.operation.parameters.recipe as
    LocalManifoldRecipe;
  const ringTime = baseRecipe.timeLimit / (baseRecipe.rings - 1);
  if (!Number.isFinite(recipe.targetExtraTime) || recipe.targetExtraTime < ringTime ||
      recipe.targetExtraTime > 2 || !Number.isInteger(recipe.maxAttempts) ||
      recipe.maxAttempts < 1 || recipe.maxAttempts > 5 ||
      !Number.isInteger(recipe.maxEvaluations) || recipe.maxEvaluations < 1 ||
      recipe.maxEvaluations > 1_000_000 || recipe.domain.length !== 3 ||
      Math.abs(recipe.targetExtraTime / ringTime -
        Math.round(recipe.targetExtraTime / ringTime)) > 1e-9 ||
      recipe.domain.some((range, axis) => !Number.isFinite(range[0]) ||
        !Number.isFinite(range[1]) || range[0] >= range[1] ||
        range[0] < document.source.axes[axis]!.min ||
        range[1] > document.source.axes[axis]!.max))
    throw new RangeError("Extended manifold needs a declared source domain and bounded work recipe.");
  const desiredRings = Math.round(recipe.targetExtraTime / ringTime);
  const targetRings = Math.min(4, 8 - baseRecipe.rings, desiredRings);
  if (targetRings < 1) return unavailable("no-continuation-rings-within-budget");
  const attempts: ExtendedManifoldAttempt[] = [];
  let accepted: ManifoldContinuationStudy | null = null;
  let evaluations = 0, nextRings = 1;
  let stopReason = "attempt-budget";
  while (attempts.length < recipe.maxAttempts && nextRings <= targetRings) {
    if (shouldCancel?.()) throw new Error("Extended manifold cancelled.");
    const extraTime = nextRings * ringTime;
    const continuation = computeVectorField3DManifoldContinuation(project,
      document, base, extraTime, shouldCancel);
    const candidate = continuation.candidate;
    const used = candidate?.evaluations ?? 0;
    evaluations += used;
    const outside = candidate?.vertices.some(point => point.some((value, axis) =>
      value < recipe.domain[axis]![0] || value > recipe.domain[axis]![1]));
    const status = continuation.status === "validated" && !outside &&
      evaluations <= recipe.maxEvaluations ? "validated" : "unavailable";
    const reason = outside ? "declared-domain-boundary" :
      evaluations > recipe.maxEvaluations ? "work-budget" : continuation.reason;
    attempts.push({ extraTime, status, reason, prefixError: continuation.prefixError,
      selfIntersectionPairs: continuation.selfIntersectionPairs,
      evaluations: used, vertices: candidate?.vertices.length ?? 0 });
    if (status !== "validated") { stopReason = reason ?? "validation-unavailable"; break; }
    accepted = continuation;
    if (nextRings === targetRings) {
      stopReason = desiredRings === targetRings ? "target-reached" : "ring-budget";
      break;
    }
    // Take one ring first, then two if the measured prefix error is comfortably below tolerance.
    const tolerance = Number(continuation.publication!.summary.convergenceTolerance);
    nextRings = Math.min(targetRings, nextRings +
      (continuation.prefixError! < tolerance * .25 ? 2 : 1));
  }
  if (!accepted?.publication || !accepted.candidate?.publication)
    return unavailable(stopReason, attempts);
  const vertices = accepted.candidate.vertices;
  const sampledBounds = [0, 1, 2].map(axis => [Math.min(...vertices.map(v => v[axis]!)),
    Math.max(...vertices.map(v => v[axis]!))]) as unknown as Bounds;
  const coordinateCoverage = sampledBounds.map((bounds, axis) =>
    (bounds[1] - bounds[0]) /
      (recipe.domain[axis]![1] - recipe.domain[axis]![0]))
    .sort((a, b) => b - a).slice(0, 2).reduce((area, fraction) =>
      area * fraction, 1);
  const pin = document.identity;
  const summary = { attempts, stopReason, evaluations,
    acceptedExtraTime: attempts.filter(item => item.status === "validated").at(-1)!.extraTime,
    prefixError: accepted.prefixError,
    selfIntersectionPairs: accepted.selfIntersectionPairs,
    sampledBounds, declaredDomain: recipe.domain,
    coordinateCoverage, vertexCount: vertices.length,
    triangleCount: accepted.candidate.triangles.length,
    seedCoverage: accepted.candidate.stopReasons.filter(reason =>
      reason === "time-limit").length / accepted.candidate.stopReasons.length,
    stopReasons: accepted.candidate.stopReasons,
    claim: "local-finite-time", globalClaim: "withheld" };
  const parameters = { baseResultId: base.publication.resultId,
    baseGeometryHash: base.publication.summary.geometryHash,
    continuationResultId: accepted.publication.resultId,
    candidateResultId: accepted.candidate.publication.resultId,
    candidateGeometryHash: accepted.candidate.publication.summary.geometryHash,
    recipe, outputHash: structuralHash(summary) };
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.extended-manifold.${structuralHash({ pin, parameters }).slice(7)}`,
    status: "numerical", provenance: { source: { documentId: pin.id,
      revision: pin.revision, structuralHash: pin.structuralHash,
      generation: pin.revision }, operation: { type: "vector3d.extended-manifold",
      algorithm: "adaptive-bounded-nested-local-patches", algorithmVersion: "1",
      parameters }, numericContext: { precision: { binaryBits: 53 },
        tolerance: { absolute: baseRecipe.solver.absoluteTolerance,
          relative: baseRecipe.solver.relativeTolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary,
    warnings: ["Bounded nested patches and sampled bounds do not establish a global manifold."],
    diagnostics: [], artifacts: [] });
  return { status: "validated", reason: null, stopReason, attempts,
    continuation: accepted, publication };
}

export function projectExtendedManifoldStatus(project: Math3DProject,
  result: AnalysisResultEnvelope) {
  if (result.provenance.operation.type !== "vector3d.extended-manifold")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const p = result.provenance.operation.parameters;
  const continuation = project.workspace.results.find(item =>
    item.resultId === p.continuationResultId);
  const base = project.workspace.results.find(item => item.resultId === p.baseResultId);
  const candidate = project.workspace.results.find(item => item.resultId === p.candidateResultId);
  if (!continuation || !base || !candidate ||
      base.summary.geometryHash !== p.baseGeometryHash ||
      candidate.summary.geometryHash !== p.candidateGeometryHash ||
      projectManifoldContinuationStatus(project, continuation).status !== "current")
    return { status: "withheld" as const, reason: "continuation-lineage-changed" };
  const pin = result.provenance.source;
  const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === pin.documentId);
  if (!entry || entry.expected.revision !== pin.revision ||
      entry.expected.structuralHash !== pin.structuralHash ||
      pin.generation !== pin.revision ||
      result.resultId !== `vector3d.extended-manifold.${structuralHash({
        pin: entry.checkpoint.identity, parameters: p }).slice(7)}` ||
      structuralHash(result.summary) !== p.outputHash ||
      result.summary.globalClaim !== "withheld" ||
      result.summary.claim !== "local-finite-time")
    return { status: "withheld" as const, reason: "source-or-recipe-changed" };
  return { status: "current" as const, reason: null };
}

export function promoteProjectExtendedManifold(project: Math3DProject,
  study: ExtendedManifoldStudy): LocalManifoldMeshPromotion {
  if (study.status !== "validated" || !study.publication || !study.continuation ||
      structuralHash(study.attempts) !== structuralHash(study.publication.summary.attempts))
    throw new TypeError("Only measured extended local geometry can be saved.");
  const promoted = promoteProjectManifoldContinuation(project, study.continuation);
  const current = parseMath3DProject(serializeMath3DProject(promoted.project));
  if (projectExtendedManifoldStatus(current, study.publication).status !== "current")
    throw new TypeError("Extended manifold source or recipe changed before saving.");
  return { ...promoted, project: replaceMath3DProjectWorkspace(current,
    createMixedWorkspaceDocument({ ...current.workspace,
      results: [...current.workspace.results, study.publication] })) };
}
