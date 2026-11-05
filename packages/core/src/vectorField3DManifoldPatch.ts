import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { sha256Checksum, structuralHash } from "./documentIdentity";
import { createDocumentRelation } from "./documentRelations";
import { encodeMeshBuffers } from "./meshBufferCodec";
import { createMeshDocument, type MeshDocument } from "./meshDocument";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { createVectorField3DDocument, type VectorField3DDocument } from
  "./vectorField3DDocument";
import { searchVectorField3DEquilibria } from "./vectorField3DEquilibria";
import { analyzeVectorField3DLocalTopology } from "./vectorField3DLocalSeparatrices";
import { integrateVectorField3DTrajectories, type VectorField3DTrajectory } from
  "./vectorField3DTrajectories";
import { viewerSourceFromDocument } from "./viewerProvenance";

type Vec3 = readonly [number, number, number];
type Triangle = readonly [number, number, number];
export type LocalManifoldRecipe = Readonly<{ constructionId: string;
  branch: "stable" | "unstable"; offsetFraction: number;
  seedCount: number; rings: number; timeLimit: number;
  solver: Readonly<{ method: "rk4-step-doubling" | "rk45";
    maxSteps: number; absoluteTolerance: number; relativeTolerance: number }> }>;
export type LocalManifoldPatch = Readonly<{
  status: "resolved" | "unavailable"; reason: string | null;
  vertices: readonly Vec3[]; triangles: readonly Triangle[];
  stopReasons: readonly string[]; evaluations: number;
  publication: AnalysisResultEnvelope | null;
}>;
const MAX_EVALUATIONS = 350_000;
const norm = (vector: Vec3) => Math.hypot(...vector);
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, i) =>
  sum + value * b[i]!, 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const subtract = (a: Vec3, b: Vec3): Vec3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const inside = (document: VectorField3DDocument, point: Vec3) =>
  document.source.axes.every((axis, i) => point[i]! > axis.min &&
    point[i]! < axis.max);
const unavailable = (reason: string, stopReasons: readonly string[] = [],
  evaluations = 0): LocalManifoldPatch => ({ status: "unavailable", reason,
  vertices: [], triangles: [], stopReasons, evaluations, publication: null });

const samplePath = (path: VectorField3DTrajectory, time: number): Vec3 | null => {
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!, b = path.points[i]!;
    const ta = Math.abs(a.time), tb = Math.abs(b.time);
    if (time < ta || time > tb) continue;
    const fraction = tb === ta ? 0 : (time - ta) / (tb - ta);
    return a.position.map((value, axis) => value + fraction *
      (b.position[axis]! - value)) as unknown as Vec3;
  }
  return time === 0 ? path.points[0]!.position : null;
};

/** A local, finite-time patch from a saved hyperbolic equilibrium and 2D eigenspace. */
export function computeVectorField3DLocalManifoldPatch(document: VectorField3DDocument,
  recipe: LocalManifoldRecipe, shouldCancel?: () => boolean): LocalManifoldPatch {
  if (document.source.field.kind !== "expressions")
    return unavailable("analytic-source-required");
  if (new Set(document.source.axes.map(axis => axis.unit)).size !== 1 ||
      new Set(document.source.field.components.map(item => item.unit)).size !== 1)
    return unavailable("incompatible-coordinate-or-vector-units");
  if (!Number.isFinite(recipe.offsetFraction) || recipe.offsetFraction < .0001 ||
      recipe.offsetFraction > .03 || !Number.isInteger(recipe.seedCount) ||
      recipe.seedCount < 6 || recipe.seedCount > 12 ||
      !Number.isInteger(recipe.rings) || recipe.rings < 3 || recipe.rings > 8 ||
      !Number.isFinite(recipe.timeLimit) || recipe.timeLimit <= 0 ||
      recipe.timeLimit > 4 || !Number.isInteger(recipe.solver.maxSteps) ||
      recipe.solver.maxSteps < 16 || recipe.solver.maxSteps > 256 ||
      !["rk4-step-doubling", "rk45"].includes(recipe.solver.method) ||
      !Number.isFinite(recipe.solver.absoluteTolerance) ||
      recipe.solver.absoluteTolerance < 1e-9 ||
      recipe.solver.absoluteTolerance > 1e-4 ||
      !Number.isFinite(recipe.solver.relativeTolerance) ||
      recipe.solver.relativeTolerance < 1e-9 ||
      recipe.solver.relativeTolerance > 1e-4)
    throw new RangeError("Local manifold patch recipe exceeds its bounded gate.");
  const construction = document.workspace?.equilibriumConstructions.find(item =>
    item.id === recipe.constructionId);
  if (!construction) return unavailable("saved-equilibrium-missing");
  if (construction.sourceRevision !== document.identity.revision ||
      construction.sourceStructuralHash !== document.identity.structuralHash)
    return unavailable("saved-equilibrium-stale");
  if (shouldCancel?.()) throw new Error("Local manifold patch cancelled.");
  const search = searchVectorField3DEquilibria(document, undefined,
    { seedResolution: 3, maxEvaluations: 20_000 });
  const span = Math.min(...document.source.axes.map(axis => axis.max - axis.min));
  const index = search.candidates.findIndex(candidate =>
    Math.hypot(...candidate.position.map((value, axis) =>
      value - construction.position[axis]!)) <= span * 1e-6 &&
    candidate.residual <= search.residualTolerance);
  const topology = analyzeVectorField3DLocalTopology(search, index);
  if (topology.status !== "resolved")
    return unavailable(topology.reason ?? "local-eigenspace-unavailable", [],
      search.evaluations);
  const pair = topology.directions.filter(item => item.branch === recipe.branch);
  if (pair.length !== 2)
    return unavailable("a-two-dimensional-real-eigenspace-is-required", [],
      search.evaluations);
  const first = pair[0]!.vector;
  const orthogonal = pair[1]!.vector.map((value, axis) =>
    value - dot(pair[1]!.vector, first) * first[axis]!) as unknown as Vec3;
  const length = norm(orthogonal);
  if (length < .05)
    return unavailable("eigenspace-basis-ill-conditioned", [], search.evaluations);
  const second = orthogonal.map(value => value / length) as unknown as Vec3;
  const orientation = cross(first, second);
  const offset = recipe.offsetFraction * span;
  const travel = recipe.branch === "stable" ? "backward" : "forward";
  const paths: VectorField3DTrajectory[] = [];
  let evaluations = search.evaluations;
  for (let seedIndex = 0; seedIndex < recipe.seedCount; seedIndex++) {
    if (shouldCancel?.()) throw new Error("Local manifold patch cancelled.");
    const angle = 2 * Math.PI * seedIndex / recipe.seedCount;
    const seed = construction.position.map((value, axis) => value + offset *
      (Math.cos(angle) * first[axis]! + Math.sin(angle) * second[axis]!)) as
      unknown as Vec3;
    if (!inside(document, seed)) return unavailable("seed-outside-domain",
      paths.map(item => item.stopReason), evaluations);
    const temporary = createVectorField3DDocument({ ...document.source,
      seeds: [{ id: `manifold_${seedIndex}`, position: seed }],
      solver: { method: recipe.solver.method, mode: "time-trajectory",
        maxSteps: recipe.solver.maxSteps, maxTime: recipe.timeLimit,
        absoluteTolerance: recipe.solver.absoluteTolerance,
        relativeTolerance: recipe.solver.relativeTolerance } },
    { stableKey: { source: document.identity.id, recipe, seedIndex } });
    const result = integrateVectorField3DTrajectories(temporary,
      { direction: travel, shouldCancel });
    const path = result.trajectories[0]!;
    paths.push(path); evaluations += result.totalEvaluations;
    if (evaluations > MAX_EVALUATIONS)
      return unavailable("work-budget-reached", paths.map(item => item.stopReason),
        evaluations);
  }
  const stopReasons = paths.map(item => item.stopReason);
  if (stopReasons.some(reason => reason === "cancelled"))
    throw new Error("Local manifold patch cancelled.");
  if (paths.some(path => path.stopReason !== "time-limit" ||
      Math.abs(Math.abs(path.points.at(-1)!.time) - recipe.timeLimit) > 1e-6))
    return unavailable("incomplete-seed-ring-coverage", stopReasons, evaluations);
  const vertices: Vec3[] = [];
  for (let ring = 0; ring < recipe.rings; ring++) {
    const time = recipe.timeLimit * ring / (recipe.rings - 1);
    for (const path of paths) {
      const vertex = samplePath(path, time);
      if (!vertex) return unavailable("ring-interpolation-unavailable",
        stopReasons, evaluations);
      vertices.push(vertex);
    }
  }
  const triangles: Triangle[] = [];
  let facing: -1 | 0 | 1 = 0;
  for (let ring = 0; ring < recipe.rings - 1; ring++)
    for (let seed = 0; seed < recipe.seedCount; seed++) {
      const next = (seed + 1) % recipe.seedCount;
      const a = ring * recipe.seedCount + seed;
      const b = (ring + 1) * recipe.seedCount + seed;
      const c = (ring + 1) * recipe.seedCount + next;
      const d = ring * recipe.seedCount + next;
      for (const triangle of [[a, b, c], [a, c, d]] as Triangle[]) {
        const p = vertices[triangle[0]]!, q = vertices[triangle[1]]!,
          r = vertices[triangle[2]]!;
        const normal = cross(subtract(q, p), subtract(r, p));
        const signed = dot(normal, orientation);
        if (Math.abs(signed) <= offset ** 2 * 1e-8 ||
            facing && Math.sign(signed) !== facing)
          return unavailable("folded-or-degenerate-local-patch", stopReasons,
            evaluations);
        facing = Math.sign(signed) as -1 | 1;
        triangles.push(triangle);
      }
    }
  const pin = document.identity;
  const constructionHash = structuralHash(construction);
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.local-manifold-patch.${structuralHash({ pin, recipe,
      constructionHash }).slice(7)}`,
    status: "numerical",
    provenance: { source: { documentId: pin.id, revision: pin.revision,
      structuralHash: pin.structuralHash, generation: pin.revision },
      operation: { type: "vector3d.local-manifold-patch",
        algorithm: "bounded-two-eigendirection-seed-ring", algorithmVersion: "1",
        parameters: { recipe, constructionHash } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: {
        absolute: recipe.solver.absoluteTolerance,
        relative: recipe.solver.relativeTolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary: { geometryHash: structuralHash({ vertices,
      triangles }), vertexCount: vertices.length, triangleCount: triangles.length,
      stopReasons, evaluations, coordinateUnit: document.source.axes[0].unit,
      timeUnit: document.source.timeUnit, branch: recipe.branch,
      localClassification: topology.label, conditionEstimate:
        topology.conditionEstimate! },
    warnings: ["This is a local finite-time surface patch, not a global invariant manifold."],
    diagnostics: [], artifacts: [] });
  return { status: "resolved", reason: null, vertices, triangles, stopReasons,
    evaluations, publication };
}

export function projectLocalManifoldPatchStatus(project: Math3DProject,
  result: AnalysisResultEnvelope): Readonly<{ status: "current" | "withheld";
  reason: string | null }> {
  if (result.provenance.operation.type !== "vector3d.local-manifold-patch")
    return { status: "withheld", reason: "wrong-result-type" };
  const pin = result.provenance.source;
  const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === pin.documentId);
  if (entry?.checkpoint.format !== "math3d.vector-field3d-document")
    return { status: "withheld", reason: "source-missing" };
  if (entry.expected.revision !== pin.revision ||
      entry.expected.structuralHash !== pin.structuralHash ||
      entry.checkpoint.identity.revision !== pin.revision ||
      entry.checkpoint.identity.structuralHash !== pin.structuralHash ||
      pin.generation !== pin.revision)
    return { status: "withheld", reason: "source-changed" };
  const recipe = result.provenance.operation.parameters.recipe as LocalManifoldRecipe;
  if (!recipe || typeof recipe.constructionId !== "string")
    return { status: "withheld", reason: "recipe-invalid" };
  const construction = entry.checkpoint.workspace?.equilibriumConstructions.find(item =>
    item.id === recipe?.constructionId);
  const constructionHash = result.provenance.operation.parameters.constructionHash;
  if (!construction || structuralHash(construction) !== constructionHash)
    return { status: "withheld", reason: "equilibrium-changed" };
  if (result.resultId !== `vector3d.local-manifold-patch.${structuralHash({
      pin: entry.checkpoint.identity, recipe, constructionHash }).slice(7)}`)
    return { status: "withheld", reason: "recipe-changed" };
  return { status: "current", reason: null };
}

export function upsertProjectLocalManifoldPatch(project: Math3DProject,
  patch: LocalManifoldPatch): Math3DProject {
  if (!patch.publication || patch.status !== "resolved")
    throw new TypeError("Only a resolved local manifold patch can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectLocalManifoldPatchStatus(current, patch.publication);
  if (status.status !== "current")
    throw new TypeError(`Local manifold patch withheld: ${status.reason}.`);
  const document = current.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === patch.publication!.provenance.source.documentId)!
    .checkpoint as VectorField3DDocument;
  const expected = computeVectorField3DLocalManifoldPatch(document,
    patch.publication.provenance.operation.parameters.recipe as LocalManifoldRecipe);
  if (!expected.publication || structuralHash(expected.publication.summary) !==
      structuralHash(patch.publication.summary))
    throw new TypeError("Local patch geometry differs from its saved source and recipe.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== patch.publication!.resultId), patch.publication] }));
}

export type LocalManifoldMeshPromotion = Readonly<{ project: Math3DProject;
  mesh: MeshDocument; bytes: Uint8Array }>;

/** Save geometry in the existing Mesh sidecar contract, linked to the result and field. */
export function promoteProjectLocalManifoldPatch(project: Math3DProject,
  patch: LocalManifoldPatch): LocalManifoldMeshPromotion {
  const withResult = upsertProjectLocalManifoldPatch(project, patch);
  const result = patch.publication!;
  const source = withResult.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === result.provenance.source.documentId)!
    .checkpoint as VectorField3DDocument;
  const positions = new Float32Array(patch.vertices.flatMap(point => [...point]));
  const indices = new Uint32Array(patch.triangles.flatMap(face => [...face]));
  const bytes = encodeMeshBuffers({ positions, indices });
  const checksum = sha256Checksum(bytes);
  const resource = { id: `mesh-resource:${checksum.slice(7, 39)}`, checksum,
    vertexCount: patch.vertices.length, indexCount: indices.length,
    hasNormals: false, hasUvs: false,
    encoding: "math3d.mesh-buffers.v1" as const };
  const origin = { kind: "vector3d.local-manifold-patch", resultId: result.resultId,
    source: result.provenance.source, recipe:
      result.provenance.operation.parameters.recipe,
    constructionHash: result.provenance.operation.parameters.constructionHash,
    geometryHash: result.summary.geometryHash, branch: result.summary.branch,
    localClassification: result.summary.localClassification };
  const mesh = createMeshDocument({ source: {
    objectId: `manifold:${result.resultId.slice(-32)}`, resource, origin },
    stableKey: { operation: "vector3d.local-manifold-patch", resultId: result.resultId },
    label: `Local ${result.summary.branch} manifold patch` });
  const relation = createDocumentRelation({ kind: "generated-by",
    sources: [viewerSourceFromDocument(source)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(mesh) },
    operation: "vector3d.local-manifold-patch",
    parameters: { resultId: result.resultId,
      constructionHash: result.provenance.operation.parameters.constructionHash,
      geometryHash: result.summary.geometryHash } });
  const workspace = createMixedWorkspaceDocument({ ...withResult.workspace,
    entries: [...withResult.workspace.entries.filter(item =>
      item.expected.id !== mesh.identity.id),
      { module: "mesh", checkpoint: mesh, expected: mesh.identity, replay: null }],
    activeDocumentIds: [...new Set([...withResult.workspace.activeDocumentIds,
      mesh.identity.id])],
    relations: [...withResult.workspace.relations.filter(item =>
      item.relationId !== relation.relationId), relation] });
  return { project: replaceMath3DProjectWorkspace(withResult, workspace),
    mesh, bytes };
}

export function projectLocalManifoldMeshStatus(project: Math3DProject,
  mesh: MeshDocument, bytes?: Uint8Array | null): Readonly<{
    status: "current" | "withheld"; reason: string | null }> {
  const origin = mesh.source.origin as Record<string, unknown>;
  if (origin.kind !== "vector3d.local-manifold-patch" ||
      typeof origin.resultId !== "string")
    return { status: "withheld", reason: "wrong-mesh-origin" };
  const result = project.workspace.results.find(item => item.resultId === origin.resultId);
  if (!result || result.summary.geometryHash !== origin.geometryHash)
    return { status: "withheld", reason: "result-missing-or-changed" };
  const status = projectLocalManifoldPatchStatus(project, result);
  if (status.status !== "current") return status;
  if (!project.workspace.entries.some(item => item.module === "mesh" &&
      item.expected.id === mesh.identity.id &&
      item.expected.structuralHash === mesh.identity.structuralHash))
    return { status: "withheld", reason: "mesh-missing-or-changed" };
  if (!bytes || sha256Checksum(bytes) !== mesh.source.resource.checksum)
    return { status: "withheld", reason: "mesh-bytes-unverified" };
  return { status: "current", reason: null };
}
