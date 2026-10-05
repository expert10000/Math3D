import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { TRIANGLE_MESH_CURVATURE_PARAMETERS, MESH_CURVATURE_WARNING, type MeshDifferentialGeometryResult } from "../mesh/meshDifferentialGeometry";
import type { SavedMeshChoice } from "./SavedMeshAnalysisPanel";
import { savedMeshCurvatureMap, type CurvatureMapField } from "./savedMeshExploration";

export type StudySnapshot = { choice: SavedMeshChoice; mesh: SurfaceMeshData; report: MeshDifferentialGeometryResult };
const finite = (value: number) => Number.isFinite(value) ? value : null;
export const studyUnits = (snapshot: StudySnapshot) => snapshot.choice.units ?? (snapshot.mesh.source.kind === "derivedSurface" ? snapshot.mesh.source.units.length : "unknown");
export const compareSavedMeshStudies = (left: StudySnapshot, right: StudySnapshot, field: CurvatureMapField) => {
  if (left.choice.id === right.choice.id && left.choice.revision === right.choice.revision && left.choice.structuralHash === right.choice.structuralHash) throw new TypeError("Choose two different saved Mesh snapshots.");
  const units = studyUnits(left);
  if (units === "unknown" || units !== studyUnits(right)) throw new TypeError("A shared colour scale requires matching known length units. No automatic unit conversion is applied.");
  const maps = [left, right].map(snapshot => savedMeshCurvatureMap(snapshot.mesh, field, undefined, snapshot.report));
  const limit = Math.max(...maps.map(map => map.range.max));
  const sides = [left, right].map(snapshot => ({ ...snapshot, map: savedMeshCurvatureMap(snapshot.mesh, field, limit, snapshot.report) }));
  return { field, units, limit, left: sides[0], right: sides[1] };
};
export type SavedStudyComparison = ReturnType<typeof compareSavedMeshStudies>;
export const studyInteriorStatistics = (snapshot: StudySnapshot) => {
  const map = savedMeshCurvatureMap(snapshot.mesh, "K", undefined, snapshot.report);
  let sumK = 0, sumH = 0, sumAbsH = 0, maxAbsH = 0;
  for (let i = 0; i < map.mask.length; i++) if (map.mask[i]) {
    sumK += snapshot.report.K[i]; sumH += snapshot.report.H[i];
    sumAbsH += Math.abs(snapshot.report.H[i]); maxAbsH = Math.max(maxAbsH, Math.abs(snapshot.report.H[i]));
  }
  return { count: map.count, excluded: map.excluded, averageK: map.count ? sumK / map.count : null, averageH: map.count ? sumH / map.count : null, averageAbsH: map.count ? sumAbsH / map.count : null, maxAbsH: map.count ? maxAbsH : null };
};
export const savedStudyComparisonReport = (comparison: SavedStudyComparison) => ({
  format: "math3d.saved-study-comparison.v1",
  field: comparison.field, lengthUnits: comparison.units, sharedScale: { min: -comparison.limit, max: comparison.limit },
  method: TRIANGLE_MESH_CURVATURE_PARAMETERS, warningFlags: MESH_CURVATURE_WARNING,
  qualification: "Discrete saved Mesh estimates. Interior statistics exclude boundary/invalid vertices. Different sampling distributions are not pointwise error or proof of convergence/minimality. Paths follow Mesh edges.",
  studies: [comparison.left, comparison.right].map((snapshot, side) => ({
    side: side === 0 ? "A" : "B", title: snapshot.choice.title,
    meshSource: snapshot.choice.meshGeneration ?? { documentId: snapshot.choice.id, revision: snapshot.choice.revision, structuralHash: snapshot.choice.structuralHash },
    surfaceSource: snapshot.choice.surfaceGeneration ?? null, current: snapshot.choice.current,
    samplingSize: snapshot.choice.samplingSize ?? null, sampling: snapshot.choice.sampling ?? null,
    vertexCount: snapshot.mesh.positions.length / 3, triangleCount: (snapshot.mesh.indices?.length ?? snapshot.mesh.positions.length / 3) / 3,
    interior: studyInteriorStatistics(snapshot), conventions: snapshot.report.conventions, savedResults: snapshot.choice.results,
    vertices: Array.from(snapshot.report.K, (_, index) => ({ index, coordinates: Array.from(snapshot.mesh.positions.slice(index * 3, index * 3 + 3)),
      K: snapshot.report.validMask[index] ? finite(snapshot.report.K[index]) : null,
      H: snapshot.report.validMask[index] ? finite(snapshot.report.H[index]) : null,
      normal: snapshot.report.validMask[index] ? Array.from(snapshot.report.normals.slice(index * 3, index * 3 + 3)).map(finite) : null,
      valid: !!snapshot.report.validMask[index], interior: !!snapshot.map.mask[index], warningMask: snapshot.report.warningMask[index],
    })),
  })),
});
export const savedStudyComparisonCsv = (comparison: SavedStudyComparison) => {
  const report = savedStudyComparisonReport(comparison);
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  // Prefix text metadata starting with a formula character when opened in a spreadsheet.
  const text = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const rows: unknown[][] = [["side", "meshId", "meshRevision", "meshHash", "surfaceId", "surfaceRevision", "surfaceHash", "samplesPerAxis", "lengthUnits", "field", "scaleMin", "scaleMax", "vertex", "x", "y", "z", "K", "H", "normalX", "normalY", "normalZ", "valid", "interior", "warningMask"]];
  for (const study of report.studies) for (const vertex of study.vertices) rows.push([study.side, text(study.meshSource.documentId), study.meshSource.revision, study.meshSource.structuralHash, study.surfaceSource?.documentId ?? "", study.surfaceSource?.revision ?? "", study.surfaceSource?.structuralHash ?? "", study.samplingSize, text(report.lengthUnits), report.field, report.sharedScale.min, report.sharedScale.max, vertex.index, ...vertex.coordinates, vertex.K, vertex.H, ...(vertex.normal ?? [null, null, null]), vertex.valid, vertex.interior, vertex.warningMask]);
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
};
