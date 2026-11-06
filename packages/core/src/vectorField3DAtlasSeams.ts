import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { sha256Checksum, structuralHash } from "./documentIdentity";
import { parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { decodeMeshBuffers } from "./meshBufferCodec";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { projectManifoldAtlasMeshStatus, projectManifoldAtlasStatus } from
  "./vectorField3DManifoldAtlas";
import { projectManifoldSurfaceCoverageStatus } from "./vectorField3DManifoldCoverage";

type Vec3 = readonly [number, number, number];
type Face = readonly [Vec3, Vec3, Vec3];
type Chart = Readonly<{ vertices: readonly Vec3[]; faces: readonly Face[];
  boundary: readonly Readonly<{ a: Vec3; b: Vec3; normal: Vec3 }>[] }>;
export type AtlasSeamEvidence = Readonly<{ status: "measured" | "unavailable";
  reason: string | null; publication: AnalysisResultEnvelope | null }>;
const unavailable = (reason: string): AtlasSeamEvidence => ({
  status: "unavailable", reason, publication: null });
const subtract = (a: Vec3, b: Vec3): Vec3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, index) =>
  sum + value * b[index]!, 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3) => Math.hypot(...a);
const middle = (a: Vec3, b: Vec3): Vec3 =>
  [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const normal = (face: Face): Vec3 => {
  const value = cross(subtract(face[1], face[0]), subtract(face[2], face[0]));
  const size = norm(value);
  return size ? value.map(item => item / size) as unknown as Vec3 : [0, 0, 0];
};
const segmentDistance = (point: Vec3, a: Vec3, b: Vec3) => {
  const delta = subtract(b, a), square = dot(delta, delta);
  const fraction = square ? Math.max(0, Math.min(1,
    dot(subtract(point, a), delta) / square)) : 0;
  return norm(subtract(point, [a[0] + delta[0] * fraction,
    a[1] + delta[1] * fraction, a[2] + delta[2] * fraction]));
};
export const distanceToAtlasFace = (point: Vec3, face: Face) => {
  const [a, b, c] = face, ab = subtract(b, a), ac = subtract(c, a);
  const n = cross(ab, ac), square = dot(n, n);
  if (square > 1e-20) {
    const offset = dot(subtract(point, a), n) / square;
    const projected: Vec3 = [point[0] - n[0] * offset,
      point[1] - n[1] * offset, point[2] - n[2] * offset];
    const ap = subtract(projected, a), d00 = dot(ab, ab), d01 = dot(ab, ac),
      d11 = dot(ac, ac), d20 = dot(ap, ab), d21 = dot(ap, ac);
    const denominator = d00 * d11 - d01 * d01;
    const v = denominator ? (d11 * d20 - d01 * d21) / denominator : -1;
    const w = denominator ? (d00 * d21 - d01 * d20) / denominator : -1;
    if (v >= 0 && w >= 0 && v + w <= 1) return Math.abs(offset) * Math.sqrt(square);
  }
  return Math.min(segmentDistance(point, a, b),
    segmentDistance(point, b, c), segmentDistance(point, c, a));
};
export const atlasProjectedContains = (point: Vec3, face: Face,
  axes: readonly number[]) => {
  const [x, y] = axes, [a, b, c] = face;
  const denominator = (b[y]! - c[y]!) * (a[x]! - c[x]!) +
    (c[x]! - b[x]!) * (a[y]! - c[y]!);
  if (Math.abs(denominator) < 1e-14) return false;
  const u = ((b[y]! - c[y]!) * (point[x]! - c[x]!) +
    (c[x]! - b[x]!) * (point[y]! - c[y]!)) / denominator;
  const v = ((c[y]! - a[y]!) * (point[x]! - c[x]!) +
    (a[x]! - c[x]!) * (point[y]! - c[y]!)) / denominator;
  return u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8;
};

/** Splits the saved unwelded Mesh by the pinned member vertex and face counts. */
export function splitSavedAtlasCharts(bytes: Uint8Array,
  counts: readonly Readonly<{ vertices: number; faces: number }>[],
  limits: Readonly<{ vertices: number; faces: number }> =
    { vertices: 192, faces: 384 }): readonly Chart[] {
  const mesh = decodeMeshBuffers(bytes);
  if (!mesh.indices || counts.length < 2 || counts.length > 3 ||
      limits.vertices > 384 || limits.faces > 768 ||
      mesh.positions.length > limits.vertices * 3 ||
      mesh.indices.length > limits.faces * 3 ||
      counts.some(item => !Number.isInteger(item.vertices) || !Number.isInteger(item.faces) ||
        item.vertices < 3 || item.faces < 1) ||
      counts.reduce((sum, item) => sum + item.vertices, 0) * 3 !== mesh.positions.length ||
      counts.reduce((sum, item) => sum + item.faces, 0) * 3 !== mesh.indices.length)
    throw new TypeError("Saved atlas chart counts do not match the bounded Mesh.");
  let vertexOffset = 0, faceOffset = 0;
  return counts.map(count => {
    const vertices = Array.from({ length: count.vertices }, (_, index) => {
      const id = (vertexOffset + index) * 3;
      return [mesh.positions[id]!, mesh.positions[id + 1]!,
        mesh.positions[id + 2]!] as Vec3;
    });
    const edges = new Map<string, { a: Vec3; b: Vec3; normal: Vec3; count: number }>();
    const faces = Array.from({ length: count.faces }, (_, index) => {
      const id = (faceOffset + index) * 3;
      const ids = [mesh.indices![id]!, mesh.indices![id + 1]!, mesh.indices![id + 2]!];
      if (ids.some(value => value < vertexOffset || value >= vertexOffset + count.vertices))
        throw new TypeError("Saved atlas chart crosses an unwelded vertex boundary.");
      const face = ids.map(value => vertices[value - vertexOffset]!) as unknown as Face;
      const n = normal(face);
      for (let side = 0; side < 3; side++) {
        const a = ids[side]!, b = ids[(side + 1) % 3]!;
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        const prior = edges.get(key);
        if (prior) prior.count++;
        else edges.set(key, { a: face[side]!, b: face[(side + 1) % 3]!,
          normal: n, count: 1 });
      }
      return face;
    });
    vertexOffset += count.vertices; faceOffset += count.faces;
    return { vertices, faces, boundary: [...edges.values()].filter(edge =>
      edge.count === 1) };
  });
}

export function measureAtlasSeams(charts: readonly Chart[], axes: readonly number[],
  tolerance: number, shouldCancel?: () => boolean) {
  if (charts.length < 2 || charts.length > 3 || axes.length !== 2 ||
      axes[0] === axes[1] || !axes.every(axis => axis >= 0 && axis <= 2) ||
      !Number.isFinite(tolerance) || tolerance <= 0)
    throw new RangeError("Atlas seams need two or three charts and a positive tolerance.");
  let tests = 0, projectedOverlaps = 0, hiddenGapEdges = 0,
    orientationConflicts = 0, matchedEdges = 0, openBoundaryEdges = 0;
  let largestDistance = 0, sumSquares = 0;
  const test = () => {
    if (shouldCancel?.()) throw new Error("Atlas seam validation cancelled.");
    if (++tests > 1_000_000) throw new RangeError("Atlas seam work budget reached.");
  };
  for (let chartId = 0; chartId < charts.length; chartId++) {
    for (const edge of charts[chartId]!.boundary) {
      const point = middle(edge.a, edge.b);
      let nearest = Infinity, nearestNormal: Vec3 | null = null, projected = false;
      for (let otherId = 0; otherId < charts.length; otherId++) {
        if (otherId === chartId) continue;
        for (const face of charts[otherId]!.faces) {
          test();
          if (!atlasProjectedContains(point, face, axes)) continue;
          projected = true;
          const distance = distanceToAtlasFace(point, face);
          if (distance < nearest) { nearest = distance; nearestNormal = normal(face); }
        }
      }
      if (!projected) { openBoundaryEdges++; continue; }
      projectedOverlaps++;
      largestDistance = Math.max(largestDistance, nearest);
      sumSquares += nearest * nearest;
      if (nearest > tolerance) hiddenGapEdges++;
      else {
        matchedEdges++;
        if (nearestNormal && dot(edge.normal, nearestNormal) < 0) orientationConflicts++;
      }
    }
  }
  return { projectedOverlaps, matchedEdges, hiddenGapEdges,
    orientationConflicts, openBoundaryEdges, largestDistance,
    rmsDistance: projectedOverlaps ? Math.sqrt(sumSquares / projectedOverlaps) : null,
    workTests: tests, classification: projectedOverlaps && !hiddenGapEdges &&
      !orientationConflicts ? "locally-compatible" : "inconclusive" };
}

const atlasMesh = (project: Math3DProject, resultId: string) =>
  project.workspace.entries.find(item => item.module === "mesh" &&
    item.checkpoint.format === "math3d.mesh-document" &&
    (item.checkpoint.source.origin as { resultId?: string }).resultId === resultId)
    ?.checkpoint;

export function computeProjectAtlasSeams(project: Math3DProject,
  coverage: AnalysisResultEnvelope, baseBytes: Uint8Array | null,
  refinedBytes: Uint8Array | null, shouldCancel?: () => boolean): AtlasSeamEvidence {
  const saved = project.workspace.results.find(item => item.resultId === coverage.resultId);
  if (!saved || structuralHash(saved.summary) !== structuralHash(coverage.summary) ||
      projectManifoldSurfaceCoverageStatus(project, coverage,
        baseBytes, refinedBytes).status !== "current")
    return unavailable("verified-saved-gf62-coverage-required");
  const atlasId = String(coverage.summary.refinedResultId);
  const atlas = project.workspace.results.find(item => item.resultId === atlasId);
  const mesh = atlasMesh(project, atlasId);
  if (!atlas || !mesh || mesh.format !== "math3d.mesh-document" ||
      projectManifoldAtlasStatus(project, atlas).status !== "current" ||
      projectManifoldAtlasMeshStatus(project, mesh, refinedBytes).status !== "current")
    return unavailable("verified-refined-atlas-required");
  const members = atlas.summary.memberResultIds as string[];
  const counts = members.map(id => project.workspace.results.find(item =>
    item.resultId === id)?.summary).map(summary => ({
      vertices: Number(summary?.vertexCount), faces: Number(summary?.triangleCount) }));
  const axes = coverage.summary.projectionAxes as number[];
  let measurement: ReturnType<typeof measureAtlasSeams>;
  try { measurement = measureAtlasSeams(splitSavedAtlasCharts(refinedBytes!, counts),
    axes, Number(atlas.summary.overlapTolerance), shouldCancel); }
  catch (cause) {
    if (cause instanceof Error && /cancelled|budget/.test(cause.message)) throw cause;
    return unavailable("saved-chart-layout-invalid");
  }
  const summary = { coverageResultId: coverage.resultId,
    coverageHash: structuralHash(coverage.summary), atlasResultId: atlasId,
    meshId: mesh.identity.id, meshChecksum: sha256Checksum(refinedBytes!),
    projectionAxes: axes, tolerance: atlas.summary.overlapTolerance,
    coordinateUnit: atlas.summary.coordinateUnit, measurement,
    globalClaim: "withheld", claim: "local-unwelded-seam-evidence" };
  const parameters = { coverageResultId: coverage.resultId,
    atlasResultId: atlasId, meshId: mesh.identity.id,
    outputHash: structuralHash(summary) };
  const pin = atlas.provenance.source;
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.atlas-seams.${structuralHash({ pin, parameters }).slice(7)}`,
    status: "numerical", provenance: { source: pin,
      operation: { type: "vector3d.atlas-seams",
        algorithm: "unwelded-3d-boundary-witnesses", algorithmVersion: "1",
        parameters }, numericContext: { precision: { binaryBits: 53 },
        tolerance: { absolute: Number(atlas.summary.overlapTolerance) } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary, warnings: ["Boundary samples do not establish global manifold coverage."],
    diagnostics: [], artifacts: [] });
  return { status: "measured", reason: null, publication };
}

export function projectAtlasSeamsStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, baseBytes?: Uint8Array | null,
  refinedBytes?: Uint8Array | null) {
  if (result.provenance.operation.type !== "vector3d.atlas-seams")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const p = result.provenance.operation.parameters;
  const coverage = project.workspace.results.find(item => item.resultId === p.coverageResultId);
  const atlas = project.workspace.results.find(item => item.resultId === p.atlasResultId);
  const mesh = atlasMesh(project, String(p.atlasResultId));
  if (!coverage || !atlas || !mesh || mesh.format !== "math3d.mesh-document" ||
      p.meshId !== mesh.identity.id ||
      projectManifoldSurfaceCoverageStatus(project, coverage,
        baseBytes, refinedBytes).status !== "current" ||
      projectManifoldAtlasStatus(project, atlas).status !== "current" ||
      structuralHash(coverage.summary) !== result.summary.coverageHash ||
      structuralHash(result.summary) !== p.outputHash ||
      result.summary.globalClaim !== "withheld" ||
      result.provenance.source.documentId !== atlas.provenance.source.documentId ||
      result.provenance.source.structuralHash !== atlas.provenance.source.structuralHash ||
      result.provenance.source.revision !== atlas.provenance.source.revision ||
      result.resultId !== `vector3d.atlas-seams.${structuralHash({
        pin: atlas.provenance.source, parameters: p }).slice(7)}`)
    return { status: "withheld" as const, reason: "seam-lineage-changed" };
  if (sha256Checksum(refinedBytes!) !== result.summary.meshChecksum)
    return { status: "withheld" as const, reason: "seam-mesh-bytes-changed" };
  return { status: "current" as const, reason: null };
}

export function upsertProjectAtlasSeams(project: Math3DProject,
  study: AtlasSeamEvidence, baseBytes: Uint8Array,
  refinedBytes: Uint8Array): Math3DProject {
  if (study.status !== "measured" || !study.publication)
    throw new TypeError("Only measured atlas seam evidence can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  if (projectAtlasSeamsStatus(current, study.publication,
    baseBytes, refinedBytes).status !== "current")
    throw new TypeError("Atlas seam lineage changed before save.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
