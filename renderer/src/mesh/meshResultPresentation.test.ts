import { describe, expect, it } from "vitest";
import type { MeshActiveAnalysisResultSummary } from "./activeAnalysisResult";
import type { MeshAnalysisMeshIdentity } from "./analysisResultStore";
import { presentMeshActiveAnalysisResult } from "./meshResultPresentation";

const mesh: MeshAnalysisMeshIdentity = { meshId: "fixture", revision: "r2", key: "fixture@r2",
  label: "Fixture", sourceLabel: "import:fixture", vertexCount: 4, faceCount: 2 };
const summary: MeshActiveAnalysisResultSummary = { category: "Mesh Quality", result: "Aspect ratio",
  quantity: "Aspect ratio", state: "Ready", method: "Triangle quality", domain: "2 faces",
  statistics: [{ label: "Mean", value: "2.4" }], percentiles: [{ label: "P95", value: "3.2" }],
  extrema: [{ label: "Maximum", value: "Face 1" }], histogram: [{ min: 1, max: 4, count: 2 }],
  metadata: [], provenance: [], warnings: [] };

describe("Mesh active result presentation", () => {
  it("shows current values while keeping claim separate from independent verification", () => {
    const presented = presentMeshActiveAnalysisResult({ summary, mesh, kind: "quality",
      qualification: { status: "current", reason: "Exact source current", canUseCurrentValues: true } });
    expect(presented.summary.statistics).toEqual(summary.statistics);
    expect(presented.evidence).toMatchObject({ status: "current", source: expect.stringContaining("r2") });
    expect(presented.evidence.claim).toContain("Aspect ratio was computed");
    expect(presented.evidence.independentCheck).toContain("does not independently prove");
  });

  it("withholds stale, missing and running numerical values without erasing provenance", () => {
    for (const status of ["historical", "unavailable", "computing"] as const) {
      const presented = presentMeshActiveAnalysisResult({ summary, mesh, kind: "quality",
        qualification: { status, reason: `Reason: ${status}`, canUseCurrentValues: false } });
      expect(presented.summary.state).toBe(status === "computing" ? "Running" : "Unavailable");
      expect(presented.summary.statistics).toEqual([]);
      expect(presented.summary.percentiles).toEqual([]);
      expect(presented.summary.extrema).toEqual([]);
      expect(presented.summary.histogram).toEqual([]);
      expect(presented.summary.warnings).toContain(`Reason: ${status}`);
      expect(presented.evidence.claim).toContain("withheld");
    }
  });

  it("labels a local view explicitly when no kernel result family is selected", () => {
    const presented = presentMeshActiveAnalysisResult({ summary, mesh, kind: null,
      qualification: { status: "unavailable", reason: "No record", canUseCurrentValues: false } });
    expect(presented.summary).toBe(summary);
    expect(presented.evidence.status).toBe("session-local");
    const localGeodesic = presentMeshActiveAnalysisResult({ summary, mesh, kind: "geodesic",
      qualification: { status: "unavailable", reason: "No result is recorded for this Mesh and quantity.", canUseCurrentValues: false } });
    expect(localGeodesic.summary.statistics).toEqual(summary.statistics);
    expect(localGeodesic.evidence.status).toBe("session-local");
  });
});
