import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { instantiateMeshComparisonStarter } from "./meshComparisonStarter";
import { buildSavedMeshResultTrend } from "./projectSavedMeshResultTrend";
import { compareSavedMeshTrendPoints, resolveSavedMeshTrendPoint } from "./projectSavedMeshTrendPoint";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";
import { retainedMeshGenerationDocuments } from "@math3d/core";
import { buildSavedMeshComparisonReview } from "./projectSavedMeshComparisonReview";
import { resolveProjectCompositionMember } from "../components/ProjectCompositionView";
import { resolveLinkedCoordinateProbe } from "./projectLinkedCoordinateProbe";

describe("Saved Mesh comparison starter", () => {
  it("opens a portable Mesh/Geometry pair and links picks from both exact sources", () => {
    const { project, resources } = instantiateMeshComparisonStarter("coordinate-pair", "mesh-geometry-probe");
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const reopened = parseMath3DProject(serializeMath3DProject(imported.project));
    const composition = reopened.compositions![0]!;
    const members = composition.members.map((member, slot) => ({ ...resolveProjectCompositionMember(reopened, member,
      item => imported.resources.bytes(item)), slot: slot as 0 | 1 }));
    expect(reopened.workspace.entries.map(entry => entry.module)).toEqual(["mesh", "geometry"]);
    expect(members.map(member => member.coordinates.value?.unit)).toEqual(["m", "m"]);
    for (const source of members) {
      const probe = resolveLinkedCoordinateProbe(members, { memberId: source.id, revision: source.revision, hash: source.hash,
        meshKey: source.meshes[0]!.id, point: { x: 0.25, y: 0.25, z: 0 } });
      expect(probe?.source.id).toBe(source.id);
      expect(probe?.target.id).toBe(members.find(member => member !== source)!.id);
      expect(probe?.unit).toBe("m");
    }
  });
  it("provides a portable three-pair review with two verified authored Notes", () => {
    const { project, resources } = instantiateMeshComparisonStarter("review-test", "mesh-comparison-review");
    expect(project.savedMeshComparisons).toHaveLength(3);
    expect(project.notes).toHaveLength(2);
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const reopened = parseMath3DProject(serializeMath3DProject(imported.project));
    const rows = buildSavedMeshComparisonReview(reopened, item => imported.resources.bytes(item));
    expect(rows.map(row => row.status)).toEqual(["verified", "verified", "verified"]);
    expect(rows.map(row => row.observationCount)).toEqual([1, 1, 0]);
    expect(rows.map(row => row.verifiedObservations.length)).toEqual([1, 1, 0]);
    expect(rows.map(row => [row.pair.a.revision, row.pair.b.revision])).toEqual([[1, 2], [2, 3], [1, 3]]);
    expect(rows[0]!.pair.metricPath).toBe("metrics.triangleArea.avg");
  });
  it("keeps missing, changed and tampered pair evidence visible as unavailable", () => {
    const { project, resources } = instantiateMeshComparisonStarter("review-refusal", "mesh-comparison-review");
    expect(buildSavedMeshComparisonReview(project, () => null).every(row => row.status === "unavailable")).toBe(true);
    const changed = { ...project, savedMeshComparisons: project.savedMeshComparisons!.map((pair, index) => index ? pair : { ...pair, metricPath: "unrecorded.metric" }) };
    const changedRows = buildSavedMeshComparisonReview(changed, item => resources.bytes(item));
    expect(changedRows[0]!.status).toBe("unavailable");
    expect(changedRows[1]!.status).toBe("verified");
    const staleNote = { ...project, notes: project.notes!.map((note, index) => index ? note :
      { ...note, anchor: { ...note.anchor!, comparisonHash: "0".repeat(64) } }) } as typeof project;
    const noteRows = buildSavedMeshComparisonReview(staleNote, item => resources.bytes(item));
    expect(noteRows[0]).toMatchObject({ status: "verified", observationCount: 1, verifiedObservations: [] });
    expect(noteRows[1]!.verifiedObservations).toHaveLength(1);
    const tampered = buildSavedMeshComparisonReview(project, item => {
      const bytes = resources.bytes(item); if (!bytes) return null;
      const copy = bytes.slice(); copy[0] ^= 1; return copy;
    });
    expect(tampered.every(row => row.status === "unavailable")).toBe(true);
    expect(tampered.every(row => row.verifiedObservations.length === 0)).toBe(true);
  });
  it("opens as a portable, exact three-generation trend with a valid A/B difference", () => {
    const { project, resources } = instantiateMeshComparisonStarter("mesh-comparison-test");
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const reopened = parseMath3DProject(serializeMath3DProject(imported.project));
    const results = reopened.workspace.results;
    expect(results).toHaveLength(3);
    const read = (item: Parameters<typeof imported.resources.bytes>[0]) => imported.resources.bytes(item);
    const trend = buildSavedMeshResultTrend(reopened, results[0]!.resultId, "metrics.triangleArea.avg", read);
    expect(trend.rows.map(row => row.status)).toEqual(["available", "available", "available"]);
    expect(trend.rows.map(row => row.value)).toEqual([0.5, 1.125, 2.53125]);
    expect(trend.unit).toBe("m²");
    const a = resolveSavedMeshTrendPoint(reopened, trend, results[0]!.resultId, read);
    const b = resolveSavedMeshTrendPoint(reopened, trend, results[2]!.resultId, read);
    const comparison = compareSavedMeshTrendPoints(reopened, { study: trend, a, b }, read);
    expect(comparison.compatible).toBe(true);
    expect(comparison.metrics.find(metric => metric.path === "metrics.triangleArea.avg"))
      .toMatchObject({ a: 0.5, b: 2.53125, difference: 2.03125, unit: "m²" });
  });
  it("retains a subdivided Mesh and its three exact quality sources", () => {
    const { project, resources } = instantiateMeshComparisonStarter("subdivision-test", "mesh-subdivision-study");
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const entry = imported.project.workspace.entries[0]!;
    expect(retainedMeshGenerationDocuments(entry)).toHaveLength(2);
    const results = imported.project.workspace.results;
    const trend = buildSavedMeshResultTrend(imported.project, results[0]!.resultId, "faceCount",
      item => imported.resources.bytes(item));
    expect(trend.rows.map(row => row.value)).toEqual([8, 32, 32]);
    expect(trend.rows.every(row => row.status === "available")).toBe(true);
  });
  it("stores closed-Mesh curvature at three scales without recalculating the trend", () => {
    const { project, resources } = instantiateMeshComparisonStarter("curvature-test", "mesh-curvature-study");
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const results = imported.project.workspace.results;
    expect(results).toHaveLength(3);
    expect(results.every(result => result.provenance.operation.type === "mesh.saved.curvature")).toBe(true);
    const trend = buildSavedMeshResultTrend(imported.project, results[0]!.resultId, "mean.avg",
      item => imported.resources.bytes(item));
    expect(trend.rows.map(row => row.status)).toEqual(["available", "available", "available"]);
    expect(trend.rows.every(row => typeof row.value === "number" && Number.isFinite(row.value))).toBe(true);
  });
  it("shows an unrecorded middle generation as a gap", () => {
    const { project, resources } = instantiateMeshComparisonStarter("gap-test", "mesh-trend-gap-study");
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const results = imported.project.workspace.results;
    expect(results).toHaveLength(2);
    const trend = buildSavedMeshResultTrend(imported.project, results[0]!.resultId, "metrics.triangleArea.avg",
      item => imported.resources.bytes(item));
    expect(trend.rows.map(row => row.status)).toEqual(["available", "not recorded", "available"]);
    expect(trend.rows[1]).toMatchObject({ resultId: null, value: null });
  });
});
