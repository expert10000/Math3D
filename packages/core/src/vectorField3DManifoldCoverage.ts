import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { sha256Checksum, structuralHash } from "./documentIdentity";
import { type Math3DProject, parseMath3DProject,
  replaceMath3DProjectWorkspace, serializeMath3DProject } from "./math3dProject";
import { decodeMeshBuffers } from "./meshBufferCodec";
import type { MeshDocument } from "./meshDocument";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { projectManifoldAtlasMeshStatus, projectManifoldAtlasStatus,
  type ManifoldAtlasRecipe } from "./vectorField3DManifoldAtlas";

type Vec3 = readonly [number, number, number];
type Triangle = readonly [Vec3, Vec3, Vec3];
type Bounds = ManifoldAtlasRecipe["domain"];
type Mesh = Readonly<{ vertices: readonly Vec3[]; triangles: readonly Triangle[];
  positions: Float32Array; indices: Uint32Array }>;
export type ManifoldSurfaceCoverageStudy = Readonly<{ status: "validated" | "unavailable";
  reason: string | null; publication: AnalysisResultEnvelope | null }>;
const unavailable = (reason: string): ManifoldSurfaceCoverageStudy => ({
  status: "unavailable", reason, publication: null });
const sub = (a: Vec3, b: Vec3): Vec3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, axis) =>
  sum + value * b[axis]!, 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(...a);
const midpoint = (a: Vec3, b: Vec3): Vec3 =>
  [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const centroid = (face: Triangle): Vec3 => [0, 1, 2].map(axis =>
  (face[0][axis]! + face[1][axis]! + face[2][axis]!) / 3) as unknown as Vec3;
const segmentDistance = (point: Vec3, a: Vec3, b: Vec3) => {
  const edge = sub(b, a), extent = dot(edge, edge);
  const fraction = extent ? Math.max(0, Math.min(1, dot(sub(point, a), edge) / extent)) : 0;
  return length(sub(point, [a[0] + fraction * edge[0],
    a[1] + fraction * edge[1], a[2] + fraction * edge[2]]));
};
const projectedContains = (point: Vec3, face: Triangle, axes: readonly number[]) => {
  const [x, y] = axes;
  const a = face[0], b = face[1], c = face[2];
  const ax = a[x]!, ay = a[y]!, bx = b[x]!, by = b[y]!, cx = c[x]!, cy = c[y]!;
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denominator) < 1e-14) return false;
  const u = ((by - cy) * (point[x]! - cx) + (cx - bx) * (point[y]! - cy)) / denominator;
  const v = ((cy - ay) * (point[x]! - cx) + (ax - cx) * (point[y]! - cy)) / denominator;
  return u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8;
};
const triangleDistance = (point: Vec3, face: Triangle) => {
  const [a, b, c] = face, ab = sub(b, a), ac = sub(c, a);
  const normal = cross(ab, ac), square = dot(normal, normal);
  if (square < 1e-20) return Math.min(segmentDistance(point, a, b),
    segmentDistance(point, b, c), segmentDistance(point, c, a));
  const offset = dot(sub(point, a), normal) / square;
  const projection: Vec3 = [point[0] - offset * normal[0],
    point[1] - offset * normal[1], point[2] - offset * normal[2]];
  const ap = sub(projection, a), d00 = dot(ab, ab), d01 = dot(ab, ac),
    d11 = dot(ac, ac), d20 = dot(ap, ab), d21 = dot(ap, ac);
  const denominator = d00 * d11 - d01 * d01;
  if (denominator > 1e-20) {
    const v = (d11 * d20 - d01 * d21) / denominator;
    const w = (d00 * d21 - d01 * d20) / denominator;
    if (v >= 0 && w >= 0 && v + w <= 1) return Math.abs(offset) * Math.sqrt(square);
  }
  return Math.min(segmentDistance(point, a, b),
    segmentDistance(point, b, c), segmentDistance(point, c, a));
};
const unpack = (bytes: Uint8Array): Mesh => {
  const decoded = decodeMeshBuffers(bytes);
  if (!decoded.indices || decoded.positions.length % 3 ||
      decoded.indices.length % 3 || decoded.positions.length > 192 * 3 ||
      decoded.indices.length > 384 * 3 ||
      decoded.positions.some(value => !Number.isFinite(value)) ||
      decoded.indices.some(id => id * 3 + 2 >= decoded.positions.length))
    throw new TypeError("Atlas Mesh exceeds its finite triangle and coordinate budget.");
  const vertices = Array.from({ length: decoded.positions.length / 3 }, (_, id) =>
    [decoded.positions[id * 3]!, decoded.positions[id * 3 + 1]!,
      decoded.positions[id * 3 + 2]!] as Vec3);
  const triangles = Array.from({ length: decoded.indices.length / 3 }, (_, id) =>
    [vertices[decoded.indices![id * 3]!]!,
      vertices[decoded.indices![id * 3 + 1]!]!,
      vertices[decoded.indices![id * 3 + 2]!]!] as Triangle);
  return { vertices, triangles, positions: decoded.positions, indices: decoded.indices };
};
const atlasMesh = (project: Math3DProject, resultId: string) =>
  project.workspace.entries.find(item => item.module === "mesh" &&
    item.checkpoint.format === "math3d.mesh-document" &&
    (item.checkpoint.source.origin as { resultId?: string }).resultId === resultId)
    ?.checkpoint as MeshDocument | undefined;

/** Uses actual saved triangles; the reported area is projected occupancy, not global coverage. */
export function computeProjectManifoldSurfaceCoverage(project: Math3DProject,
  baseResultId: string, refinedResultId: string,
  baseBytes: Uint8Array | null, refinedBytes: Uint8Array | null,
  shouldCancel?: () => boolean): ManifoldSurfaceCoverageStudy {
  const baseResult = project.workspace.results.find(item => item.resultId === baseResultId);
  const refinedResult = project.workspace.results.find(item => item.resultId === refinedResultId);
  const baseDocument = atlasMesh(project, baseResultId);
  const refinedDocument = atlasMesh(project, refinedResultId);
  if (!baseResult || !refinedResult || !baseDocument || !refinedDocument ||
      projectManifoldAtlasStatus(project, baseResult).status !== "current" ||
      projectManifoldAtlasStatus(project, refinedResult).status !== "current" ||
      refinedResult.summary.baseAtlasResultId !== baseResultId ||
      (baseResult.summary.memberResultIds as unknown[] | undefined)?.length !== 2 ||
      (refinedResult.summary.memberResultIds as unknown[] | undefined)?.length !== 3)
    return unavailable("saved-current-atlas-pair-required");
  if (projectManifoldAtlasMeshStatus(project, baseDocument, baseBytes).status !== "current" ||
      projectManifoldAtlasMeshStatus(project, refinedDocument, refinedBytes).status !== "current")
    return unavailable("verified-atlas-mesh-bytes-required");
  const baseRecipe = baseResult.provenance.operation.parameters.recipe as ManifoldAtlasRecipe;
  const refinedRecipe = refinedResult.provenance.operation.parameters.recipe as ManifoldAtlasRecipe;
  if (structuralHash(baseRecipe.domain) !== structuralHash(refinedRecipe.domain))
    return unavailable("atlas-domains-differ");
  const domain = baseRecipe.domain;
  let base: Mesh, refined: Mesh;
  try { base = unpack(baseBytes!); refined = unpack(refinedBytes!); }
  catch { return unavailable("atlas-mesh-decoding-failed"); }
  if (base.positions.some((value, index) => refined.positions[index] !== value) ||
      base.indices.some((value, index) => refined.indices[index] !== value) ||
      refined.positions.length <= base.positions.length ||
      refined.indices.length <= base.indices.length)
    return unavailable("refinement-does-not-preserve-base-triangles");
  const axes = [0, 1, 2].sort((a, b) =>
    (domain[b]![1] - domain[b]![0]) - (domain[a]![1] - domain[a]![0]))
    .slice(0, 2);
  let tests = 0;
  const test = () => {
    if (shouldCancel?.()) throw new Error("Manifold surface coverage cancelled.");
    if (++tests > 2_000_000) throw new RangeError("Manifold surface coverage work budget reached.");
  };
  const occupied = (mesh: Mesh, resolution: 16 | 32) => {
    const cells = new Uint8Array(resolution * resolution);
    for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
      const point: Vec3 = [0, 1, 2].map(axis =>
        (domain[axis]![0] + domain[axis]![1]) / 2) as unknown as Vec3;
      const position = [...point] as [number, number, number];
      position[axes[0]!] = domain[axes[0]!]![0] + (x + .5) / resolution *
        (domain[axes[0]!]![1] - domain[axes[0]!]![0]);
      position[axes[1]!] = domain[axes[1]!]![0] + (y + .5) / resolution *
        (domain[axes[1]!]![1] - domain[axes[1]!]![0]);
      for (const face of mesh.triangles) {
        test();
        if (projectedContains(position, face, axes)) {
          cells[y * resolution + x] = 1; break;
        }
      }
    }
    const perimeter: number[] = [];
    for (let x = 0; x < resolution; x++) perimeter.push(cells[x]!);
    for (let y = 1; y < resolution; y++) perimeter.push(cells[y * resolution + resolution - 1]!);
    for (let x = resolution - 2; x >= 0; x--) perimeter.push(cells[(resolution - 1) * resolution + x]!);
    for (let y = resolution - 2; y > 0; y--) perimeter.push(cells[y * resolution]!);
    const gaps = perimeter.filter(value => !value).length;
    const doubled = [...perimeter, ...perimeter];
    let run = 0, longest = 0;
    for (const value of doubled) {
      run = value ? 0 : run + 1;
      longest = Math.max(longest, Math.min(run, perimeter.length));
    }
    return { coveredCells: cells.reduce((sum, value) => sum + value, 0),
      boundaryGapCells: gaps, longestBoundaryGap: longest };
  };
  const base16 = occupied(base, 16), refined16 = occupied(refined, 16);
  const base32 = occupied(base, 32), refined32 = occupied(refined, 32);
  if (refined16.coveredCells <= base16.coveredCells ||
      refined32.coveredCells <= base32.coveredCells)
    return unavailable("no-triangle-coverage-gain-at-both-resolutions");
  const newFaces = refined.triangles.slice(base.triangles.length);
  const distances = (fine: boolean) => {
    const values: number[] = [];
    for (const face of newFaces) {
      const points = fine ? [centroid(face), midpoint(face[0], face[1]),
        midpoint(face[1], face[2]), midpoint(face[2], face[0])] : [centroid(face)];
      for (const point of points) {
        if (!base.triangles.some(other => { test(); return projectedContains(point, other, axes); }))
          continue;
        let nearest = Infinity;
        for (const other of base.triangles) { test();
          nearest = Math.min(nearest, triangleDistance(point, other)); }
        values.push(nearest);
      }
    }
    return { count: values.length, max: values.length ? Math.max(...values) : null,
      rms: values.length ? Math.sqrt(values.reduce((sum, value) =>
        sum + value * value, 0) / values.length) : null };
  };
  const coarse = distances(false), fine = distances(true);
  const tolerance = Number(refinedResult.summary.overlapTolerance);
  if (coarse.count < 4 || fine.count < 8 ||
      fine.max === null || coarse.rms === null || fine.rms === null)
    return unavailable("insufficient-surface-overlap-samples");
  if (fine.max > tolerance || Math.abs(fine.rms - coarse.rms) > tolerance * .25)
    return unavailable("surface-overlap-did-not-converge");
  const surfaceArea = (mesh: Mesh) => mesh.triangles.reduce((sum, face) =>
    sum + length(cross(sub(face[1], face[0]), sub(face[2], face[0]))) / 2, 0);
  const summary = { baseResultId, refinedResultId,
    baseMeshId: baseDocument.identity.id, refinedMeshId: refinedDocument.identity.id,
    baseMeshChecksum: sha256Checksum(baseBytes!),
    refinedMeshChecksum: sha256Checksum(refinedBytes!),
    domain, projectionAxes: axes,
    method: "physical-triangle-projection-16x32-and-nearest-triangle-overlap",
    base16, refined16, base32, refined32,
    gain16: refined16.coveredCells - base16.coveredCells,
    gain32: refined32.coveredCells - base32.coveredCells,
    baseTriangleArea: surfaceArea(base), refinedTriangleArea: surfaceArea(refined),
    coarseOverlap: coarse, fineOverlap: fine,
    overlapRmsChange: Math.abs(fine.rms - coarse.rms),
    overlapTolerance: tolerance, workTests: tests,
    coordinateUnit: baseResult.summary.coordinateUnit,
    globalClaim: "withheld", coverageClaim: "local-projected-triangle-evidence" };
  const pin = baseResult.provenance.source;
  const parameters = { baseResultId, refinedResultId,
    baseMeshId: baseDocument.identity.id, refinedMeshId: refinedDocument.identity.id,
    outputHash: structuralHash(summary) };
  const publication = createAnalysisResultEnvelope({
    resultId: `vector3d.manifold-surface-coverage.${structuralHash({ pin, parameters }).slice(7)}`,
    status: "numerical", provenance: { source: pin,
      operation: { type: "vector3d.manifold-surface-coverage",
        algorithm: "bounded-physical-triangle-coverage", algorithmVersion: "1",
        parameters }, numericContext: { precision: { binaryBits: 53 },
        tolerance: { absolute: tolerance } },
      engine: { name: "math3d-core", version: "1" }, elapsedMs: 0 },
    summary, warnings: ["Projected triangle occupancy and sampled overlap do not prove global manifold coverage."],
    diagnostics: [], artifacts: [] });
  return { status: "validated", reason: null, publication };
}

export function projectManifoldSurfaceCoverageStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, baseBytes?: Uint8Array | null,
  refinedBytes?: Uint8Array | null) {
  if (result.provenance.operation.type !== "vector3d.manifold-surface-coverage")
    return { status: "withheld" as const, reason: "wrong-result-type" };
  const parameters = result.provenance.operation.parameters;
  const base = project.workspace.results.find(item => item.resultId === parameters.baseResultId);
  const refined = project.workspace.results.find(item => item.resultId === parameters.refinedResultId);
  const baseMesh = atlasMesh(project, String(parameters.baseResultId));
  const refinedMesh = atlasMesh(project, String(parameters.refinedResultId));
  if (!base || !refined || !baseMesh || !refinedMesh ||
      projectManifoldAtlasStatus(project, base).status !== "current" ||
      projectManifoldAtlasStatus(project, refined).status !== "current" ||
      baseMesh.identity.id !== parameters.baseMeshId ||
      refinedMesh.identity.id !== parameters.refinedMeshId ||
      result.provenance.source.documentId !== base.provenance.source.documentId ||
      result.provenance.source.revision !== base.provenance.source.revision ||
      result.provenance.source.structuralHash !== base.provenance.source.structuralHash ||
      structuralHash(result.summary) !== parameters.outputHash ||
      result.summary.globalClaim !== "withheld" ||
      result.resultId !== `vector3d.manifold-surface-coverage.${structuralHash({
        pin: base.provenance.source, parameters }).slice(7)}`)
    return { status: "withheld" as const, reason: "coverage-source-or-evidence-changed" };
  if (projectManifoldAtlasMeshStatus(project, baseMesh, baseBytes).status !== "current" ||
      projectManifoldAtlasMeshStatus(project, refinedMesh, refinedBytes).status !== "current" ||
      sha256Checksum(baseBytes!) !== result.summary.baseMeshChecksum ||
      sha256Checksum(refinedBytes!) !== result.summary.refinedMeshChecksum)
    return { status: "withheld" as const, reason: "atlas-mesh-bytes-unverified" };
  return { status: "current" as const, reason: null };
}

export function upsertProjectManifoldSurfaceCoverage(project: Math3DProject,
  study: ManifoldSurfaceCoverageStudy,
  baseBytes: Uint8Array, refinedBytes: Uint8Array): Math3DProject {
  if (study.status !== "validated" || !study.publication)
    throw new TypeError("Only validated triangle coverage can be saved.");
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectManifoldSurfaceCoverageStatus(current, study.publication,
    baseBytes, refinedBytes);
  if (status.status !== "current")
    throw new TypeError(`Manifold coverage withheld: ${status.reason}.`);
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, results: [...current.workspace.results.filter(item =>
      item.resultId !== study.publication!.resultId), study.publication] }));
}
