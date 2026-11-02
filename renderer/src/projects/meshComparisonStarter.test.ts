import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { instantiateMeshComparisonStarter } from "./meshComparisonStarter";
import { buildSavedMeshResultTrend } from "./projectSavedMeshResultTrend";
import { compareSavedMeshTrendPoints, resolveSavedMeshTrendPoint } from "./projectSavedMeshTrendPoint";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";

describe("Saved Mesh comparison starter", () => {
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
});
