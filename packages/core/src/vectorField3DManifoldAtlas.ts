import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { sha256Checksum, structuralHash } from "./documentIdentity";
import { createDocumentRelation } from "./documentRelations";
import { encodeMeshBuffers } from "./meshBufferCodec";
import { createMeshDocument, type MeshDocument } from "./meshDocument";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { projectExtendedManifoldStatus,
  type ExtendedManifoldStudy } from "./vectorField3DExtendedManifold";
import { countManifoldSelfIntersections } from "./vectorField3DManifoldContinuation";
import type { VectorField3DDocument } from "./vectorField3DDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

type Vec3 = readonly [number, number, number];
type Bounds = readonly [readonly [number, number], readonly [number, number],
  readonly [number, number]];
export type ManifoldAtlasRecipe = Readonly<{ domain: Bounds;
  overlapTolerance: number; maxEvaluations: number }>;
export type ManifoldAtlasStudy = Readonly<{ status: "validated" | "unavailable";
  reason: string | null; vertices: readonly Vec3[];
  triangles: readonly (readonly [number, number, number])[];
  publication: AnalysisResultEnvelope | null }>;
const unavailable = (reason: string): ManifoldAtlasStudy => ({ status: "unavailable",
  reason, vertices: [], triangles: [], publication: null });
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, axis) =>
  sum + value * b[axis]!, 0);
const sub = (a: Vec3, b: Vec3): Vec3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const boundsOf = (vertices: readonly Vec3[]): Bounds => [0, 1, 2].map(axis =>
  [Math.min(...vertices.map(v => v[axis]!)),
    Math.max(...vertices.map(v => v[axis]!))]) as unknown as Bounds;
const inside = (point: Vec3, bounds: Bounds, axes: readonly number[], margin = 0) =>
  axes.every(axis => point[axis]! >= bounds[axis]![0] - margin &&
    point[axis]! <= bounds[axis]![1] + margin);

/** Finite patch atlas; overlap agreement is sampled and the Mesh remains unwelded. */
export function computeVectorField3DManifoldAtlas(project: Math3DProject,
  document: VectorField3DDocument, studies: readonly ExtendedManifoldStudy[],
  recipe: ManifoldAtlasRecipe, shouldCancel?: () => boolean): ManifoldAtlasStudy {
  if (studies.length !== 2 || studies.some(item => item.status !== "validated" ||
      !item.publication || !item.continuation?.candidate) ||
      !Number.isFinite(recipe.overlapTolerance) ||
      recipe.overlapTolerance <= 0 || recipe.overlapTolerance > .25 ||
      !Number.isInteger(recipe.maxEvaluations) || recipe.maxEvaluations < 1 ||
      recipe.maxEvaluations > 1_000_000 || recipe.domain.length !== 3 ||
      recipe.domain.some((range, axis) => !Number.isFinite(range[0]) ||
        !Number.isFinite(range[1]) || range[0] >= range[1] ||
        range[0] < document.source.axes[axis]!.min ||
        range[1] > document.source.axes[axis]!.max))
    throw new RangeError("Atlas needs two saved local patches and bounded domain/work rules.");
  for (const study of studies) {
    const saved = project.workspace.results.find(item =>
      item.resultId === study.publication!.resultId);
    if (!saved || structuralHash(saved.summary) !==
        structuralHash(study.publication!.summary) ||
        projectExtendedManifoldStatus(project, saved).status !== "current")
      return unavailable("saved-verified-extended-patches-required");
  }
  const patches = studies.map(item => item.continuation!.candidate!);
  const branch = patches[0]!.publication!.summary.branch;
  if (patches[1]!.publication!.summary.branch !== branch ||
      studies[0]!.publication!.provenance.source.documentId !== document.identity.id ||
      studies[1]!.publication!.provenance.source.documentId !== document.identity.id)
    return unavailable("source-or-branch-mismatch");
  const evaluations = studies.reduce((sum, item) => sum +
    Number(item.publication!.summary.evaluations), 0);
  if (evaluations > recipe.maxEvaluations)
    return unavailable("atlas-work-budget");
  const vertices = patches.flatMap(item => item.vertices);
  const triangles = patches.flatMap((item, index) => item.triangles.map(face =>
    face.map(id => id + (index ? patches[0]!.vertices.length : 0)) as
      [number, number, number]));
  if (vertices.length > 192 || triangles.length > 384)
    return unavailable("atlas-mesh-budget");
  if (shouldCancel?.()) throw new Error("Manifold atlas cancelled.");
  const normal = (index: number) => {
    const face = patches[index]!.triangles[0]!;
    const p = patches[index]!.vertices[face[0]]!,
      q = patches[index]!.vertices[face[1]]!,
      r = patches[index]!.vertices[face[2]]!;
    return cross(sub(q, p), sub(r, p));
  };
  const aNormal = normal(0), bNormal = normal(1);
  if (dot(aNormal, bNormal) < .5 * Math.hypot(...aNormal) * Math.hypot(...bNormal))
    return unavailable("patch-orientation-mismatch");
  const dimension = [0, 1, 2].sort((a, b) =>
    (Math.max(...vertices.map(v => v[b]!)) - Math.min(...vertices.map(v => v[b]!))) -
    (Math.max(...vertices.map(v => v[a]!)) - Math.min(...vertices.map(v => v[a]!))))
    .slice(0, 2);
  const boxes = patches.map(item => boundsOf(item.vertices));
  const overlap = dimension.map(axis => [Math.max(boxes[0]![axis]![0], boxes[1]![axis]![0]),
    Math.min(boxes[0]![axis]![1], boxes[1]![axis]![1])]);
  if (overlap.some(range => range[1]! <= range[0]!))
    return unavailable("patches-do-not-overlap-in-physical-domain");
  const span = Math.min(...recipe.domain.map(range => range[1] - range[0]));
  const margin = span * recipe.overlapTolerance;
  const measured: number[] = [];
  for (let i = 0; i < 2; i++) for (const point of patches[i]!.vertices) {
    if (shouldCancel?.()) throw new Error("Manifold atlas cancelled.");
    if (!inside(point, boxes[1 - i]!, dimension, margin)) continue;
    const nearest = Math.min(...patches[1 - i]!.vertices.map(other =>
      Math.hypot(...sub(point, other))));
    measured.push(nearest);
  }
  if (measured.length < 4) return unavailable("insufficient-overlap-samples");
  const overlapError = Math.max(...measured);
  if (overlapError > margin) return unavailable("patch-overlap-did-not-converge");
  const intersections = countManifoldSelfIntersections(vertices, triangles,
    { maxVertices: 192, maxTriangles: 384, includeCoplanar: false });
  if (intersections) return unavailable("transverse-patch-intersection");
  const cells = Array.from({ length: 256 }, (_, id) => {
    const point = [0, 1, 2].map(axis => (recipe.domain[axis]![0] +
      recipe.domain[axis]![1]) / 2) as [number, number, number];
    for (const [index, axis] of dimension.entries()) point[axis] =
      recipe.domain[axis]![0] + ((index ? Math.floor(id / 16) : id % 16) + .5) /
      16 * (recipe.domain[axis]![1] - recipe.domain[axis]![0]);
    return boxes.some(box => inside(point, box, dimension));
  });
  const uncoveredCells = cells.filter(value => !value).length;
  const pin = document.identity;
  const summary = { memberResultIds: studies.map(item => item.publication!.resultId),
    memberGeometryHashes: patches.map(item => item.publication!.summary.geometryHash),
    branch, overlapSamples: measured.length, overlapError,
    overlapTolerance: margin, transverseIntersectionPairs: intersections,
    uncoveredCells, coverageCells: 256 - uncoveredCells,
    coverageMethod: "projected-16x16-bounding-box", evaluations,
    stopReasons: studies.map(item => item.stopReason),
    vertexCount: vertices.length, triangleCount: triangles.length,
    geometryHash: structuralHash({ vertices, triangles }),
    claim: "local-finite-time", globalClaim: "withheld" };
  const parameters = { recipe, memberResultIds: summary.memberResultIds,
    memberGeometryHashes: summary.memberGeometryHashes,
    outputHash: structuralHash(summary) };
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.manifold-atlas.${structuralHash({ pin, parameters }).slice(7)}`,
    status: "numerical", provenance: { source: { documentId: pin.id,
      revision: pin.revision, structuralHash: pin.structuralHash,
      generation: pin.revision }, operation: { type: "vector3d.manifold-atlas",
      algorithm: "bounded-overlap-local-patch-atlas", algorithmVersion: "1",
      parameters }, numericContext: { precision: { binaryBits: 53 },
        tolerance: { absolute: margin } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary, warnings: ["Atlas Mesh keeps overlapping patches separate; projected bounds do not prove global coverage."],
    diagnostics: [], artifacts: [] });
  return { status: "validated", reason: null, vertices, triangles, publication };
}

export function projectManifoldAtlasStatus(project: Math3DProject,
  result: AnalysisResultEnvelope) {
  if (result.provenance.operation.type !== "vector3d.manifold-atlas")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const parameters = result.provenance.operation.parameters;
  const members = parameters.memberResultIds as string[];
  if (!Array.isArray(members) || members.length !== 2 ||
      members.some((id, index) => {
        const saved = project.workspace.results.find(item => item.resultId === id);
        return !saved || saved.provenance.operation.parameters.candidateGeometryHash !==
          (parameters.memberGeometryHashes as string[] | undefined)?.[index] ||
          projectExtendedManifoldStatus(project, saved).status !== "current";
      })) return { status: "withheld" as const, reason: "atlas-member-changed" };
  const pin = result.provenance.source;
  const source = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === pin.documentId);
  if (!source || source.expected.revision !== pin.revision ||
      source.expected.structuralHash !== pin.structuralHash ||
      pin.generation !== pin.revision ||
      structuralHash(result.summary) !== parameters.outputHash ||
      result.summary.globalClaim !== "withheld" ||
      result.resultId !== `vector3d.manifold-atlas.${structuralHash({
        pin: source.checkpoint.identity, parameters }).slice(7)}`)
    return { status: "withheld" as const, reason: "atlas-source-or-evidence-changed" };
  return { status: "current" as const, reason: null };
}

export function promoteProjectManifoldAtlas(project: Math3DProject,
  study: ManifoldAtlasStudy): Readonly<{ project: Math3DProject;
  mesh: MeshDocument; bytes: Uint8Array }> {
  if (study.status !== "validated" || !study.publication ||
      study.publication.summary.geometryHash !== structuralHash({
        vertices: study.vertices, triangles: study.triangles }) ||
      projectManifoldAtlasStatus(project, study.publication).status !== "current")
    throw new TypeError("Only validated current atlas geometry can be promoted.");
  const bytes = encodeMeshBuffers({ positions: new Float32Array(
    study.vertices.flatMap(point => [...point])), indices: new Uint32Array(
    study.triangles.flatMap(face => [...face])) });
  const checksum = sha256Checksum(bytes), result = study.publication;
  const mesh = createMeshDocument({ source: {
    objectId: `manifold-atlas:${result.resultId.slice(-32)}`,
    resource: { id: `mesh-resource:${checksum.slice(7, 39)}`, checksum,
      vertexCount: study.vertices.length, indexCount: study.triangles.length * 3,
      hasNormals: false, hasUvs: false, encoding: "math3d.mesh-buffers.v1" },
    origin: { kind: "vector3d.manifold-atlas", resultId: result.resultId,
      source: result.provenance.source, memberResultIds:
        result.provenance.operation.parameters.memberResultIds,
      geometryHash: result.summary.geometryHash, globalClaim: "withheld" } },
    stableKey: { operation: "vector3d.manifold-atlas", resultId: result.resultId },
    label: "Local manifold patch atlas" });
  const field = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === result.provenance.source.documentId)!.checkpoint as
    VectorField3DDocument;
  const relation = createDocumentRelation({ kind: "generated-by",
    sources: [viewerSourceFromDocument(field)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(mesh) },
    operation: "vector3d.manifold-atlas",
    parameters: { resultId: result.resultId,
      geometryHash: result.summary.geometryHash } });
  const current = parseMath3DProject(serializeMath3DProject(project));
  const workspace = createMixedWorkspaceDocument({ ...current.workspace,
    results: [...current.workspace.results, result],
    entries: [...current.workspace.entries.filter(item =>
      item.expected.id !== mesh.identity.id),
      { module: "mesh", checkpoint: mesh, expected: mesh.identity, replay: null }],
    activeDocumentIds: [...new Set([...current.workspace.activeDocumentIds,
      mesh.identity.id])],
    relations: [...current.workspace.relations.filter(item =>
      item.relationId !== relation.relationId), relation] });
  return { project: replaceMath3DProjectWorkspace(current, workspace), mesh, bytes };
}

export function projectManifoldAtlasMeshStatus(project: Math3DProject,
  mesh: MeshDocument, bytes?: Uint8Array | null) {
  const origin = mesh.source.origin as Record<string, unknown>;
  const result = project.workspace.results.find(item => item.resultId === origin.resultId);
  const entry = project.workspace.entries.find(item => item.module === "mesh" &&
    item.expected.id === mesh.identity.id);
  if (origin.kind !== "vector3d.manifold-atlas" || !result || !entry ||
      entry.expected.revision !== mesh.identity.revision ||
      entry.expected.structuralHash !== mesh.identity.structuralHash ||
      structuralHash(origin.memberResultIds) !== structuralHash(
        result.provenance.operation.parameters.memberResultIds) ||
      result.summary.geometryHash !== origin.geometryHash ||
      projectManifoldAtlasStatus(project, result).status !== "current")
    return { status: "withheld" as const, reason: "atlas-result-changed" };
  if (!bytes || sha256Checksum(bytes) !== mesh.source.resource.checksum)
    return { status: "withheld" as const, reason: "mesh-bytes-unverified" };
  return { status: "current" as const, reason: null };
}
