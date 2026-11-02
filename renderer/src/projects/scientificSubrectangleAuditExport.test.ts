import { describe, expect, it, vi } from "vitest";
import { VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
  VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE,
  structuralHash, type AnalysisResultEnvelope, type Math3DProject } from
  "@math3d/core";
import type { NotebookReference } from "@math3d/workbook";
import type { ScientificSubrectangleChart } from "./scientificSubrectangleChart";
import { createScientificSubrectangleAuditExport } from
  "./scientificSubrectangleAuditExport";

const statistics = { count: 16, gaps: 1, mean: 2, min: 1, max: 3 };
const keys = ["vector", "scalar", "complexMagnitude", "complexPhase",
  "divergence", "curlMagnitude"] as const;
const rows = Array.from({ length: 17 }, (_, index) => ({ id: `r${index}`,
  x: index, y: index === 8 ? null : index }));
const profile = { xName: "x", xUnit: "m", yUnit: "m/s",
  rowsSha256: structuralHash(rows), rows };
const project = { identity: { id: "project" } } as Math3DProject;
const reference = { targetId: "subrectangle" } as NotebookReference;
const result = { resultId: "subrectangle", provenance: {
  source: { documentId: "vector", revision: 2, generation: 3,
    structuralHash: "vector-document-hash" },
  operation: { type: VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
    algorithm: "bounded-subrectangle", algorithmVersion: "17x17-v1",
    parameters: { region: { normalAxis: 2, fixedCoordinate: 0 },
      bounds: [[-1, 1], [-2, 2]], vectorReferences: [{ id: "vector-ref" }],
      scalarReference: { id: "scalar-ref" }, realReference: { id: "real-ref" },
      imaginaryReference: { id: "imaginary-ref" },
      vectorSamples: [{ name: "east", sampleSha256: "vector-sample-hash" }],
      derivedSamples: [{ name: "divergence", sampleSha256: "derived-hash" }],
      scalarSampleSha256: "scalar-sample-hash",
      realSampleSha256: "real-sample-hash",
      imaginarySampleSha256: "imaginary-sample-hash" } },
  engine: { name: "Math3D", version: "1" } },
  summary: Object.fromEntries(keys.map(key => [key, statistics])),
  warnings: [], diagnostics: [] } as unknown as AnalysisResultEnvelope;
const chart = (changed: readonly string[] = []): ScientificSubrectangleChart => ({
  resultId: result.resultId, sourceHash: result.provenance.source.structuralHash,
  bounds: [[-1, 1], [-2, 2]], fields: keys.map(key => ({
    key, label: key, status: changed.includes(key) ? "changed" as const :
      "source-current" as const,
    ...(!changed.includes(key) ? { column: profile, row: profile } : {}) })) });
const checked = (value: ScientificSubrectangleChart) => vi.fn(async () =>
  ({ result, status: "source-current" as const, chart: value }));

describe("SCI-19 subrectangle JSON audit", () => {
  it("exports verified physical bounds, units, gaps, hashes and statistics", async () => {
    const inspect = checked(chart());
    const audit = await createScientificSubrectangleAuditExport(project, reference,
      inspect, () => new Date("2026-11-02T00:00:00.000Z"));
    expect(inspect).toHaveBeenCalledOnce();
    expect(audit.verification).toMatchObject({ status: "verified",
      checkedAt: "2026-11-02T00:00:00.000Z" });
    if (audit.verification.status === "withheld") throw new Error("Expected verified audit");
    expect(audit.bounds).toEqual([[-1, 1], [-2, 2]]);
    expect(audit.fields).toHaveLength(6);
    expect(audit.fields[0]).toMatchObject({ status: "verified", unit: "m/s",
      statistics, sourceReferences: [{ id: "vector-ref" }],
      sourceHashes: { document: "vector-document-hash" },
      profiles: { columnGaps: 1, rowGaps: 1,
        column: { rowsSha256: profile.rowsSha256 } } });
    expect(audit.fields[1]).toMatchObject({ sourceReferences: [{ id: "scalar-ref" }],
      sourceHashes: { scalarSampleSha256: "scalar-sample-hash" } });
    expect(audit.fields[2]).toMatchObject({ sourceReferences: [
      { id: "real-ref" }, { id: "imaginary-ref" }] });
  });

  it("withholds changed fields independently, including their profile values", async () => {
    const inspect = checked(chart(["scalar", "complexPhase"]));
    const audit = await createScientificSubrectangleAuditExport(project, reference,
      inspect);
    expect(audit.verification.status).toBe("partial");
    if (audit.verification.status === "withheld") throw new Error("Expected partial audit");
    expect(audit.fields[1]).toEqual({ key: "scalar", label: "scalar",
      status: "changed" });
    expect(audit.fields[3]).toEqual({ key: "complexPhase", label: "complexPhase",
      status: "changed" });
    expect(JSON.stringify(audit.fields[1])).not.toContain("statistics");
    expect(audit.fields[0]).toMatchObject({ status: "verified", statistics });
  });

  it("exports the three vector-only fields and refuses mismatched chart identity", async () => {
    const vectorResult = { ...result, provenance: { ...result.provenance,
      operation: { ...result.provenance.operation,
        type: VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE } } } as
      AnalysisResultEnvelope;
    const vectorChart = { ...chart(), fields: chart().fields.filter(field =>
      ["vector", "divergence", "curlMagnitude"].includes(field.key)) };
    const good = await createScientificSubrectangleAuditExport(project, reference,
      async () => ({ result: vectorResult, status: "source-current", chart: vectorChart }));
    expect(good.verification.status).toBe("verified");
    if (good.verification.status === "withheld") throw new Error("Expected vector audit");
    expect(good.fields.map(field => field.key)).toEqual([
      "vector", "divergence", "curlMagnitude"]);
    expect(good.fields[1]).toMatchObject({ sourceHashes: {
      derivedSamples: [{ name: "divergence", sampleSha256: "derived-hash" }] } });
    const bad = await createScientificSubrectangleAuditExport(project, reference,
      async () => ({ result: vectorResult, status: "source-current",
        chart: { ...vectorChart, sourceHash: "changed" } }));
    expect(bad.verification.status).toBe("withheld");
    expect(bad.fields).toEqual([]);
  });

  it("exports only a failure record when inspection fails or no field verifies", async () => {
    const failed = await createScientificSubrectangleAuditExport(project, reference,
      async () => { throw new Error("Source changed"); });
    expect(failed.verification).toMatchObject({ status: "withheld",
      reason: "Source changed" });
    expect(Object.keys(failed).sort()).toEqual([
      "fields", "kind", "projectId", "resultId", "schemaVersion", "verification"]);
    expect(failed.fields).toEqual([]);
    const unavailable = await createScientificSubrectangleAuditExport(project,
      reference, checked(chart(keys)));
    expect(unavailable.verification.status).toBe("withheld");
    expect(unavailable.fields.every(field => field.status === "changed")).toBe(true);
    expect(JSON.stringify(unavailable)).not.toContain('"statistics"');
    expect(JSON.stringify(unavailable)).not.toContain('"bounds"');
  });
});
