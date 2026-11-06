import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { computeVectorField3DLocalManifoldPatch, promoteProjectLocalManifoldPatch,
  projectLocalManifoldPatchStatus, type LocalManifoldPatch,
  type LocalManifoldRecipe, type LocalManifoldMeshPromotion } from "./vectorField3DManifoldPatch";
import type { VectorField3DDocument } from "./vectorField3DDocument";

type Vec3 = readonly [number, number, number];
type Triangle = readonly [number, number, number];
export type ManifoldContinuationStudy = Readonly<{ status: "validated" | "unavailable";
  reason: string | null; candidate: LocalManifoldPatch | null;
  prefixError: number | null; selfIntersectionPairs: number;
  publication: AnalysisResultEnvelope | null }>;
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((value, axis) =>
  value - b[axis]!));
const subtract = (a: Vec3, b: Vec3): Vec3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, axis) =>
  sum + value * b[axis]!, 0);
const box = (face: Triangle, vertices: readonly Vec3[]) => [0, 1, 2].map(axis =>
  [Math.min(...face.map(id => vertices[id]![axis]!)),
    Math.max(...face.map(id => vertices[id]![axis]!))] as const);
const segmentHitsFace = (a: Vec3, b: Vec3, face: Triangle,
  vertices: readonly Vec3[], tolerance: number) => {
  const p = vertices[face[0]]!, q = vertices[face[1]]!, r = vertices[face[2]]!;
  const direction = subtract(b, a), edge1 = subtract(q, p),
    edge2 = subtract(r, p);
  const normal = cross(edge1, edge2);
  const denominator = dot(normal, direction);
  if (Math.abs(denominator) <= tolerance) return false;
  const t = dot(normal, subtract(p, a)) / denominator;
  if (t <= tolerance || t >= 1 - tolerance) return false;
  const hit: Vec3 = [0, 1, 2].map(axis => a[axis]! + t * direction[axis]!) as
    unknown as Vec3;
  const weights = [dot(normal, cross(subtract(q, p), subtract(hit, p))),
    dot(normal, cross(subtract(r, q), subtract(hit, q))),
    dot(normal, cross(subtract(p, r), subtract(hit, r)))];
  return weights.every(value => value >= -tolerance);
};
const coplanarOverlap = (a: Triangle, b: Triangle,
  vertices: readonly Vec3[]) => {
  const p = vertices[a[0]]!, q = vertices[a[1]]!, r = vertices[a[2]]!;
  const normal = cross(subtract(q, p), subtract(r, p));
  const length = Math.hypot(...normal);
  if (length <= 1e-12 || b.some(id =>
      Math.abs(dot(normal, subtract(vertices[id]!, p))) > length * 1e-9))
    return false;
  const omit = [0, 1, 2].reduce((best, axis) =>
    Math.abs(normal[axis]!) > Math.abs(normal[best]!) ? axis : best, 0);
  const axes = [0, 1, 2].filter(axis => axis !== omit);
  const xy = (id: number) => [vertices[id]![axes[0]!]!,
    vertices[id]![axes[1]!]!] as const;
  const orient = (u: readonly number[], v: readonly number[],
    w: readonly number[]) => (v[0]! - u[0]!) * (w[1]! - u[1]!) -
      (v[1]! - u[1]!) * (w[0]! - u[0]!);
  const crossing = (u: readonly number[], v: readonly number[],
    w: readonly number[], z: readonly number[]) =>
    orient(u, v, w) * orient(u, v, z) < -1e-18 &&
    orient(w, z, u) * orient(w, z, v) < -1e-18;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    if (crossing(xy(a[i]!), xy(a[(i + 1) % 3]!),
      xy(b[j]!), xy(b[(j + 1) % 3]!))) return true;
  const inside = (point: readonly number[], face: Triangle) => {
    const values = [0, 1, 2].map(i => orient(xy(face[i]!),
      xy(face[(i + 1) % 3]!), point));
    return values.every(value => value > 1e-9) ||
      values.every(value => value < -1e-9);
  };
  return a.some(id => inside(xy(id), b)) || b.some(id => inside(xy(id), a));
};

/** Bounded triangle-pair screen; adjacent triangles share a legitimate edge. */
export function countManifoldSelfIntersections(vertices: readonly Vec3[],
  triangles: readonly Triangle[]): number {
  if (vertices.length > 96 || triangles.length > 192)
    throw new RangeError("Continuation mesh exceeds the validation budget.");
  let count = 0;
  for (let i = 0; i < triangles.length; i++) {
    const a = triangles[i]!, aBox = box(a, vertices);
    for (let j = i + 1; j < triangles.length; j++) {
      const b = triangles[j]!;
      if (a.some(id => b.includes(id))) continue;
      const bBox = box(b, vertices);
      if (aBox.some((bounds, axis) => bounds[1] < bBox[axis]![0] - 1e-9 ||
          bBox[axis]![1] < bounds[0] - 1e-9)) continue;
      const hits = (face: Triangle, target: Triangle) => [0, 1, 2].some(edge =>
        segmentHitsFace(vertices[face[edge]!]!, vertices[face[(edge + 1) % 3]!]!,
          target, vertices, 1e-9));
      if (hits(a, b) || hits(b, a) || coplanarOverlap(a, b, vertices)) count++;
    }
  }
  return count;
}

/** One measured continuation step. The result remains a finite-time local claim. */
export function computeVectorField3DManifoldContinuation(project: Math3DProject,
  document: VectorField3DDocument, base: LocalManifoldPatch,
  extraTime: number, shouldCancel?: () => boolean): ManifoldContinuationStudy {
  const unavailable = (reason: string, candidate: LocalManifoldPatch | null = null,
    prefixError: number | null = null, selfIntersectionPairs = 0):
    ManifoldContinuationStudy => ({ status: "unavailable", reason, candidate,
      prefixError, selfIntersectionPairs, publication: null });
  if (base.status !== "resolved" || !base.publication ||
      projectLocalManifoldPatchStatus(project, base.publication).status !== "current" ||
      !project.workspace.results.some(item => item.resultId === base.publication!.resultId))
    return unavailable("saved-base-patch-required");
  const baseRecipe = base.publication.provenance.operation.parameters.recipe as
    LocalManifoldRecipe;
  const step = baseRecipe.timeLimit / (baseRecipe.rings - 1);
  const extraRings = Math.round(extraTime / step);
  if (!Number.isFinite(extraTime) || extraRings < 1 || extraRings > 4 ||
      Math.abs(extraTime - extraRings * step) > 1e-9 ||
      baseRecipe.rings + extraRings > 8 ||
      baseRecipe.timeLimit + extraTime > 4)
    throw new RangeError("Continuation needs 1–4 matching rings within the local time and mesh budget.");
  if (structuralHash({ vertices: base.vertices, triangles: base.triangles }) !==
      base.publication.summary.geometryHash)
    return unavailable("base-geometry-changed");
  const recipe = { ...baseRecipe, rings: baseRecipe.rings + extraRings,
    timeLimit: baseRecipe.timeLimit + extraTime };
  const candidate = computeVectorField3DLocalManifoldPatch(document, recipe,
    shouldCancel);
  if (candidate.status !== "resolved" || !candidate.publication)
    return unavailable(`continuation-${candidate.reason}`, candidate);
  const span = Math.min(...document.source.axes.map(axis => axis.max - axis.min));
  const prefixError = Math.max(...base.vertices.map((vertex, index) =>
    distance(vertex, candidate.vertices[index]!)));
  const tolerance = Math.max(span * 1e-3,
    20 * baseRecipe.solver.absoluteTolerance,
    20 * baseRecipe.solver.relativeTolerance * span);
  if (prefixError > tolerance)
    return unavailable("continuation-prefix-did-not-converge", candidate,
      prefixError);
  const selfIntersectionPairs = countManifoldSelfIntersections(
    candidate.vertices, candidate.triangles);
  if (selfIntersectionPairs)
    return unavailable("continuation-self-intersection", candidate,
      prefixError, selfIntersectionPairs);
  if (candidate.stopReasons.some(reason => reason !== "time-limit"))
    return unavailable("continuation-stopped-early", candidate, prefixError);
  const pin = document.identity;
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.manifold-continuation.${structuralHash({ pin,
      baseResultId: base.publication.resultId, recipe }).slice(7)}`,
    status: "numerical",
    provenance: { source: { documentId: pin.id, revision: pin.revision,
      structuralHash: pin.structuralHash, generation: pin.revision },
      operation: { type: "vector3d.manifold-continuation",
        algorithm: "bounded-nested-local-patch", algorithmVersion: "1",
        parameters: { baseResultId: base.publication.resultId,
          baseGeometryHash: base.publication.summary.geometryHash,
          candidateResultId: candidate.publication.resultId, recipe } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: {
        absolute: baseRecipe.solver.absoluteTolerance,
        relative: baseRecipe.solver.relativeTolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary: { prefixError, convergenceTolerance: tolerance,
      selfIntersectionPairs, candidateGeometryHash:
        candidate.publication.summary.geometryHash,
      vertexCount: candidate.vertices.length,
      triangleCount: candidate.triangles.length,
      stopReasons: candidate.stopReasons,
      evaluations: candidate.evaluations,
      coordinateUnit: document.source.axes[0].unit,
      timeUnit: document.source.timeUnit, claim: "local-finite-time" },
    warnings: ["Nested patch convergence and the intersection screen do not establish a global invariant manifold."],
    diagnostics: [], artifacts: [] });
  return { status: "validated", reason: null, candidate, prefixError,
    selfIntersectionPairs, publication };
}

export function projectManifoldContinuationStatus(project: Math3DProject,
  result: AnalysisResultEnvelope) {
  if (result.provenance.operation.type !== "vector3d.manifold-continuation")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const base = project.workspace.results.find(item => item.resultId ===
    result.provenance.operation.parameters.baseResultId);
  const candidate = project.workspace.results.find(item => item.resultId ===
    result.provenance.operation.parameters.candidateResultId);
  if (!base || !candidate || base.summary.geometryHash !==
      result.provenance.operation.parameters.baseGeometryHash ||
      candidate.summary.geometryHash !== result.summary.candidateGeometryHash)
    return { status: "withheld" as const, reason: "patch-lineage-changed" };
  const pin = result.provenance.source;
  const recipe = result.provenance.operation.parameters.recipe;
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe))
    return { status: "withheld" as const, reason: "continuation-recipe-invalid" };
  const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === pin.documentId);
  if (entry?.checkpoint.format !== "math3d.vector-field3d-document" ||
      entry.expected.revision !== pin.revision ||
      entry.expected.structuralHash !== pin.structuralHash ||
      pin.generation !== pin.revision ||
      result.resultId !== `vector3d.manifold-continuation.${structuralHash({
        pin: entry.checkpoint.identity,
        baseResultId: base.resultId,
        recipe }).slice(7)}`)
    return { status: "withheld" as const, reason: "continuation-source-or-recipe-changed" };
  for (const patch of [base, candidate]) {
    const status = projectLocalManifoldPatchStatus(project, patch);
    if (status.status !== "current") return status;
  }
  return { status: "current" as const, reason: null };
}

export function promoteProjectManifoldContinuation(project: Math3DProject,
  study: ManifoldContinuationStudy): LocalManifoldMeshPromotion {
  if (study.status !== "validated" || !study.publication || !study.candidate)
    throw new TypeError("Continuation geometry needs a validated complete patch.");
  if (study.publication.summary.prefixError !== study.prefixError ||
      study.publication.summary.selfIntersectionPairs !== study.selfIntersectionPairs ||
      study.publication.summary.candidateGeometryHash !==
        study.candidate.publication?.summary.geometryHash ||
      study.selfIntersectionPairs !== 0)
    throw new TypeError("Continuation evidence differs from its validated geometry.");
  const promoted = promoteProjectLocalManifoldPatch(project, study.candidate);
  const current = parseMath3DProject(serializeMath3DProject(promoted.project));
  if (projectManifoldContinuationStatus(current, study.publication).status !== "current")
    throw new TypeError("Continuation lineage changed before Mesh promotion.");
  const workspace = createMixedWorkspaceDocument({ ...current.workspace,
    results: [...current.workspace.results, study.publication] });
  return { ...promoted, project: replaceMath3DProjectWorkspace(current, workspace) };
}
