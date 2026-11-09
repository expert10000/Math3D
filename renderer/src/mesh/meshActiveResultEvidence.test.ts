import { describe, expect, it } from "vitest";
import { createMeshAnalysisResultStore, upsertMeshAnalysisResult,
  type MeshAnalysisMeshIdentity } from "./analysisResultStore";
import type { MeshActiveAnalysisResultSummary } from "./activeAnalysisResult";
import { createMeshActiveResultEvidence } from "./meshActiveResultEvidence";
import { qualifyMeshAnalysisResult } from "./meshResultQualification";
import { presentMeshActiveAnalysisResult } from "./meshResultPresentation";

const mesh: MeshAnalysisMeshIdentity = { meshId: "sample", revision: "v4:f2", key: "sample@v4:f2",
  label: "Sample", sourceLabel: "import:sample.obj", vertexCount: 4, faceCount: 2 };
const summary: MeshActiveAnalysisResultSummary = { category: "Mesh Quality", result: "Triangle area",
  quantity: "Triangle area", state: "Ready", method: "Cross product", domain: "2 faces",
  statistics: [{ label: "Mean", value: "0.5000" }], percentiles: [{ label: "P95", value: "0.5000" }],
  metadata: [{ label: "Units", value: "mesh units^2" }], provenance: [], warnings: [],
  field: { id: "quality:area", label: "Triangle area", domain: "face", valueType: "scalar", unit: "mesh units^2" } };

describe("Mesh active result evidence", () => {
  it("exports the exact current result and qualified summary with units", () => {
    const store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), { kind: "quality", mesh,
      variant: "threshold-8", parameters: { threshold: 8 }, payload: { metrics: { area: 0.5 } }, now: 42 });
    const result = Object.values(store.entries)[0]!;
    const qualification = qualifyMeshAnalysisResult({ store, mesh, result, kind: "quality",
      variant: "threshold-8", parameters: { threshold: 8 } });
    const presented = presentMeshActiveAnalysisResult({ summary, qualification, kind: "quality", mesh });
    const evidence = createMeshActiveResultEvidence({ mesh, result, summary: presented.summary,
      presentation: presented.evidence });
    expect(evidence).toMatchObject({ format: "math3d.mesh-active-result-evidence/v1",
      source: { revision: "v4:f2", sourceLabel: "import:sample.obj" },
      result: { version: 1, variant: "threshold-8", parameters: { threshold: 8 } },
      qualification: { status: "current" },
      summary: { unit: "mesh units^2", statistics: [{ label: "Mean", value: "0.5000" }] } });
    expect(evidence?.qualification.independentCheck).toMatch(/does not independently prove/);
    expect(JSON.parse(JSON.stringify(evidence)).result.parameterHash).toBe('{"threshold":8}');
  });

  it("exports historical provenance without stale numerical statistics", () => {
    const store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), { kind: "quality", mesh,
      variant: "threshold-8", parameters: { threshold: 8 }, payload: { area: 0.5 }, now: 1 });
    const result = Object.values(store.entries)[0]!;
    const qualification = qualifyMeshAnalysisResult({ store, mesh, result, kind: "quality", variant: "threshold-9" });
    const presented = presentMeshActiveAnalysisResult({ summary, qualification, kind: "quality", mesh });
    const evidence = createMeshActiveResultEvidence({ mesh, result, summary: presented.summary,
      presentation: presented.evidence });
    expect(evidence?.qualification.status).toBe("historical");
    expect(evidence?.summary.statistics).toEqual([]);
    expect(evidence?.result?.variant).toBe("threshold-8");
  });

  it("refuses to substitute a different Mesh generation", () => {
    const store = upsertMeshAnalysisResult(createMeshAnalysisResultStore(), { kind: "quality", mesh,
      payload: { area: 0.5 }, now: 1 });
    expect(() => createMeshActiveResultEvidence({ mesh: { ...mesh, key: "other@v1" },
      result: Object.values(store.entries)[0]!, summary,
      presentation: { status: "historical", reason: "different source", claim: "historical",
        independentCheck: "none", source: "other" } })).toThrow(/source generation/);
  });
});
