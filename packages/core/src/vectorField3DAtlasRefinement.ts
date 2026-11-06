import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { encodeMeshBuffers } from "./meshBufferCodec";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { atlasProjectedContains, distanceToAtlasFace, measureAtlasSeams,
  projectAtlasSeamsStatus, splitSavedAtlasCharts } from "./vectorField3DAtlasSeams";
import { computeVectorField3DManifoldContinuation } from
  "./vectorField3DManifoldContinuation";
import { computeVectorField3DLocalManifoldPatch, upsertProjectLocalManifoldPatch,
  type LocalManifoldRecipe } from "./vectorField3DManifoldPatch";
import type { VectorField3DDocument } from "./vectorField3DDocument";

type Vec3 = readonly [number, number, number];
type Face = readonly [Vec3, Vec3, Vec3];
export type AtlasRefinementEvidence = Readonly<{ status: "measured" | "unavailable";
  reason: string | null; publication: AnalysisResultEnvelope | null }>;
const unavailable = (reason: string): AtlasRefinementEvidence => ({
  status: "unavailable", reason, publication: null });
const atlasCounts = (project: Math3DProject, ids: readonly string[]) =>
  ids.map(id => project.workspace.results.find(item => item.resultId === id)?.summary)
    .map(summary => ({ vertices: Number(summary?.vertexCount),
      faces: Number(summary?.triangleCount) }));
const surfaceDistance = (from: readonly Vec3[], to: readonly Face[],
  test: () => void) => {
  const values = from.map(point => {
    let nearest = Infinity;
    for (const face of to) { test();
      nearest = Math.min(nearest, distanceToAtlasFace(point, face)); }
    return nearest;
  });
  return { max: Math.max(...values), rms: Math.sqrt(values.reduce((sum, value) =>
    sum + value * value, 0) / values.length) };
};
const projectedCoverage = (faces: readonly Face[], axes: readonly number[],
  domain: readonly (readonly [number, number])[], resolution: 16 | 32,
  test: () => void) => {
  let covered = 0;
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const point = domain.map(range => (range[0] + range[1]) / 2) as number[];
    point[axes[0]!] = domain[axes[0]!]![0] + (x + .5) / resolution *
      (domain[axes[0]!]![1] - domain[axes[0]!]![0]);
    point[axes[1]!] = domain[axes[1]!]![0] + (y + .5) / resolution *
      (domain[axes[1]!]![1] - domain[axes[1]!]![0]);
    if (faces.some(face => { test(); return atlasProjectedContains(
      point as unknown as Vec3, face, axes); })) covered++;
  }
  return covered;
};

/** Recomputes pinned analytic local patches at denser seed/ring/solver settings. */
export function computeProjectAtlasRefinement(project: Math3DProject,
  seams: AnalysisResultEnvelope, baseBytes: Uint8Array | null,
  refinedBytes: Uint8Array | null, shouldCancel?: () => boolean):
    AtlasRefinementEvidence {
  const saved = project.workspace.results.find(item => item.resultId === seams.resultId);
  if (!saved || structuralHash(saved.summary) !== structuralHash(seams.summary) ||
      projectAtlasSeamsStatus(project, seams,
        baseBytes, refinedBytes).status !== "current")
    return unavailable("verified-saved-gf63-seams-required");
  const atlas = project.workspace.results.find(item =>
    item.resultId === seams.summary.atlasResultId);
  const coverage = project.workspace.results.find(item =>
    item.resultId === seams.summary.coverageResultId);
  const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === seams.provenance.source.documentId);
  if (!atlas || !coverage || entry?.checkpoint.format !==
      "math3d.vector-field3d-document")
    return unavailable("saved-analytic-atlas-source-required");
  const document = entry.checkpoint as VectorField3DDocument;
  if (document.source.field.kind !== "expressions")
    return unavailable("analytic-source-required");
  const memberIds = atlas.summary.memberResultIds as string[];
  const original = splitSavedAtlasCharts(refinedBytes!, atlasCounts(project, memberIds));
  const axes = coverage.summary.projectionAxes as number[];
  const domain = coverage.summary.domain as readonly (readonly [number, number])[];
  const tolerance = Number(atlas.summary.overlapTolerance);
  let work = 0;
  const test = () => {
    if (shouldCancel?.()) throw new Error("Atlas refinement cancelled.");
    if (++work > 1_000_000) throw new RangeError("Atlas refinement comparison budget reached.");
  };
  const attempts: { memberId: string; status: "measured" | "unavailable";
    reason: string | null; baseRecipe: LocalManifoldRecipe;
    refinedRecipe: LocalManifoldRecipe; evaluations: number;
    forwardMax: number | null; reverseMax: number | null;
    forwardRms: number | null; reverseRms: number | null }[] = [];
  const refinedCharts: { vertices: readonly Vec3[];
    triangles: readonly (readonly [number, number, number])[] }[] = [];
  let evaluations = 0;
  for (let index = 0; index < memberIds.length; index++) {
    test();
    const memberId = memberIds[index]!;
    const extended = project.workspace.results.find(item => item.resultId === memberId);
    const base = project.workspace.results.find(item =>
      item.resultId === extended?.provenance.operation.parameters.baseResultId);
    const baseRecipe = base?.provenance.operation.parameters.recipe as
      LocalManifoldRecipe | undefined;
    if (!baseRecipe) return unavailable("saved-member-base-recipe-missing");
    const refinedRecipe: LocalManifoldRecipe = { ...baseRecipe,
      seedCount: Math.min(12, baseRecipe.seedCount + 2),
      rings: Math.min(7, baseRecipe.rings + 1),
      solver: { ...baseRecipe.solver,
        absoluteTolerance: Math.max(1e-9, baseRecipe.solver.absoluteTolerance / 2),
        relativeTolerance: Math.max(1e-9, baseRecipe.solver.relativeTolerance / 2) } };
    const attempt = { memberId, status: "unavailable" as "measured" | "unavailable",
      reason: null as string | null, baseRecipe, refinedRecipe,
      evaluations: 0, forwardMax: null as number | null,
      reverseMax: null as number | null, forwardRms: null as number | null,
      reverseRms: null as number | null };
    attempts.push(attempt);
    const patch = computeVectorField3DLocalManifoldPatch(document,
      refinedRecipe, shouldCancel);
    attempt.evaluations += patch.evaluations;
    evaluations += patch.evaluations;
    if (evaluations > 1_000_000) return unavailable("atlas-refinement-work-budget");
    if (patch.status !== "resolved") { attempt.reason = patch.reason; continue; }
    const temporary = upsertProjectLocalManifoldPatch(project, patch);
    const extraTime = Number(extended?.summary.acceptedExtraTime);
    let continuation: ReturnType<typeof computeVectorField3DManifoldContinuation>;
    try { continuation = computeVectorField3DManifoldContinuation(temporary,
      document, patch, extraTime, shouldCancel); }
    catch (cause) {
      if (cause instanceof Error && /cancelled/.test(cause.message)) throw cause;
      attempt.reason = "refined-continuation-budget-or-rings"; continue;
    }
    attempt.evaluations += continuation.candidate?.evaluations ?? 0;
    evaluations += continuation.candidate?.evaluations ?? 0;
    if (evaluations > 1_000_000) return unavailable("atlas-refinement-work-budget");
    if (continuation.status !== "validated" || !continuation.candidate) {
      attempt.reason = continuation.reason; continue;
    }
    const candidate = continuation.candidate;
    const newFaces = candidate.triangles.map(face => face.map(id =>
      candidate.vertices[id]!) as unknown as Face);
    const old = original[index]!;
    const forward = surfaceDistance(old.vertices, newFaces, test);
    const reverse = surfaceDistance(candidate.vertices, old.faces, test);
    Object.assign(attempt, { status: "measured", forwardMax: forward.max,
      reverseMax: reverse.max, forwardRms: forward.rms, reverseRms: reverse.rms });
    refinedCharts.push({ vertices: candidate.vertices,
      triangles: candidate.triangles });
  }
  let seamRefinement: ReturnType<typeof measureAtlasSeams> | null = null;
  let coverageRefinement: { coarse: number; fine: number } | null = null;
  if (refinedCharts.length === memberIds.length) {
    const positions: number[] = [], indices: number[] = [];
    const counts: { vertices: number; faces: number }[] = [];
    for (const chart of refinedCharts) {
      const offset = positions.length / 3;
      positions.push(...chart.vertices.flatMap(point => [...point]));
      indices.push(...chart.triangles.flatMap(face => face.map(id => id + offset)));
      counts.push({ vertices: chart.vertices.length, faces: chart.triangles.length });
    }
    if (positions.length > 384 * 3 || indices.length > 768 * 3)
      return unavailable("refined-atlas-mesh-budget");
    const encoded = encodeMeshBuffers({ positions: new Float32Array(positions),
      indices: new Uint32Array(indices) });
    const charts = splitSavedAtlasCharts(encoded, counts,
      { vertices: 384, faces: 768 });
    seamRefinement = measureAtlasSeams(charts, axes, tolerance, shouldCancel);
    const faces = charts.flatMap(chart => chart.faces);
    coverageRefinement = { coarse: projectedCoverage(faces, axes, domain, 16, test),
      fine: projectedCoverage(faces, axes, domain, 32, test) };
  }
  const maxDistance = Math.max(0, ...attempts.flatMap(attempt => [
    attempt.forwardMax ?? 0, attempt.reverseMax ?? 0]));
  const baselineSeams = seams.summary.measurement as
    { hiddenGapEdges: number; orientationConflicts: number };
  const classification = attempts.every(attempt => attempt.status === "measured") &&
    seamRefinement && coverageRefinement && maxDistance <= tolerance &&
    seamRefinement.hiddenGapEdges <= baselineSeams.hiddenGapEdges &&
    seamRefinement.orientationConflicts <= baselineSeams.orientationConflicts &&
    coverageRefinement.coarse >= Number((coverage.summary.refined16 as
      { coveredCells: number }).coveredCells) &&
    coverageRefinement.fine >= Number((coverage.summary.refined32 as
      { coveredCells: number }).coveredCells) ? "locally-converged" : "inconclusive";
  const summary = { seamsResultId: seams.resultId,
    seamsHash: structuralHash(seams.summary), atlasResultId: atlas.resultId,
    attempts, seamRefinement, coverageRefinement, maxDistance,
    evaluations, comparisonTests: work, tolerance,
    coordinateUnit: atlas.summary.coordinateUnit,
    classification, globalClaim: "withheld" };
  const parameters = { seamsResultId: seams.resultId,
    atlasResultId: atlas.resultId, outputHash: structuralHash(summary) };
  const pin = atlas.provenance.source;
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.atlas-refinement.${structuralHash({ pin, parameters }).slice(7)}`,
    status: "numerical", provenance: { source: pin,
      operation: { type: "vector3d.atlas-refinement",
        algorithm: "bounded-analytic-seed-ring-solver-refinement",
        algorithmVersion: "1", parameters },
      numericContext: { precision: { binaryBits: 53 },
        tolerance: { absolute: tolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary, warnings: ["Refinement comparisons support only local finite-time claims."],
    diagnostics: [], artifacts: [] });
  return { status: "measured", reason: null, publication };
}

export function projectAtlasRefinementStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, baseBytes?: Uint8Array | null,
  refinedBytes?: Uint8Array | null) {
  if (result.provenance.operation.type !== "vector3d.atlas-refinement")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const p = result.provenance.operation.parameters;
  const seams = project.workspace.results.find(item => item.resultId === p.seamsResultId);
  if (!seams || projectAtlasSeamsStatus(project, seams,
        baseBytes, refinedBytes).status !== "current" ||
      structuralHash(seams.summary) !== result.summary.seamsHash ||
      structuralHash(result.summary) !== p.outputHash ||
      result.summary.globalClaim !== "withheld" ||
      result.provenance.source.documentId !== seams.provenance.source.documentId ||
      result.provenance.source.revision !== seams.provenance.source.revision ||
      result.provenance.source.structuralHash !== seams.provenance.source.structuralHash ||
      result.resultId !== `vector3d.atlas-refinement.${structuralHash({
        pin: seams.provenance.source, parameters: p }).slice(7)}`)
    return { status: "withheld" as const, reason: "refinement-source-or-evidence-changed" };
  return { status: "current" as const, reason: null };
}

export function upsertProjectAtlasRefinement(project: Math3DProject,
  study: AtlasRefinementEvidence, baseBytes: Uint8Array,
  refinedBytes: Uint8Array): Math3DProject {
  if (study.status !== "measured" || !study.publication)
    throw new TypeError("Only measured atlas refinement can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  if (projectAtlasRefinementStatus(current, study.publication,
    baseBytes, refinedBytes).status !== "current")
    throw new TypeError("Atlas refinement lineage changed before save.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
