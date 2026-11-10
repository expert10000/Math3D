import { describe, expect, it } from "vitest";
import type { GeometryAnalysisInspectorRecord } from "./analysisResultWorkflow";
import { createGeometryAnalysisEvidence, geometryAnalysisEvidenceCsv,
  geometryAnalysisEvidenceJson } from "./geometryAnalysisEvidence";

const record: GeometryAnalysisInspectorRecord = {
  id: "saved-one", resultKey: "geometry:shape@2", name: "Saved shape", kind: "surface-analysis",
  sourceObjectId: "shape", sourceObjectName: "Shape", sourceRevision: 2, resultVersion: 4,
  lifecycle: "saved", domain: "surface", quantity: "Mean curvature", method: "sampled curvature",
  units: "1/m", precision: "double", sampling: "mesh samples", parameters: { step: 0.1 },
  requestedOutputs: [], statistics: { sentinel: 1729 }, warnings: ["sampled"], engine: "Geometry core",
  computeTimeMs: 5, createdAt: 1, updatedAt: 2, savedAt: 2, payload: { hidden: "dense values" },
};

describe("Geometry selected-result evidence", () => {
  it("exports exact selected identity, source, method and qualified statistics", () => {
    const evidence = createGeometryAnalysisEvidence(record, 2);
    expect(evidence).toMatchObject({ result: { id: "saved-one", version: 4 },
      source: { objectId: "shape", recordedRevision: 2, currentRevision: 2 },
      publication: { schema: "math3d.result-publication/v1", module: "geometry",
        source: { id: "shape", revision: 2, hash: null },
        assessment: { status: "recorded" }, summary: { sentinel: 1729 } },
      assessment: { status: "current", omissions: [] }, statistics: { sentinel: 1729 } });
    expect(evidence.execution).toEqual({ computeTimeMs: 5, createdAt: 1,
      updatedAt: 2, savedAt: 2 });
    expect(evidence.assessment.sourceCheck).toContain("does not retain a source content hash");
    expect(geometryAnalysisEvidenceJson(evidence)).not.toContain("dense values");
    expect(geometryAnalysisEvidenceCsv(evidence)).toContain('"statistics","{""sentinel"":1729}"');
    expect(geometryAnalysisEvidenceCsv(evidence)).toContain('"publication.status","recorded"');
  });

  it("omits statistics for historical, missing and incomplete records in both formats", () => {
    for (const [entry, revision] of [
      [record, 3], [record, null], [{ ...record, lifecycle: "preview" as const }, 2],
    ] as const) {
      const evidence = createGeometryAnalysisEvidence(entry, revision);
      expect(evidence.statistics).toBeNull();
      expect(evidence.publication.summary).toBeNull();
      expect(evidence.publication.assessment.status).toBe("withheld");
      expect(evidence.assessment.omissions).toContain("statistics");
      expect(geometryAnalysisEvidenceJson(evidence)).not.toContain("1729");
      expect(geometryAnalysisEvidenceCsv(evidence)).not.toContain("1729");
      expect(geometryAnalysisEvidenceCsv(evidence)).toContain('"statistics",""');
      expect(geometryAnalysisEvidenceCsv(evidence)).toContain('"publication.status","withheld"');
    }
  });

  it("escapes spreadsheet formulas and quoted values", () => {
    const evidence = createGeometryAnalysisEvidence({ ...record,
      sourceObjectId: "=1+1", warnings: ['x,"quoted"'] }, 2);
    const csv = geometryAnalysisEvidenceCsv(evidence);
    expect(csv).toContain('"source.objectId","\'=1+1"');
    expect(csv).toContain('"warnings","[""x,\\""quoted\\""""]"');
  });
});
