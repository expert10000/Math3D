import { describe, expect, it } from "vitest";
import {
  canGeometryResultDriveViewport,
  canGeometryInspectorPublishSelected,
  compareGeometryAnalysisRecords,
  compareQualifiedGeometryAnalysisRecords,
  duplicateGeometryAnalysisSettings,
  geometryInspectorLifecycleState,
  markGeometryAnalysisRecordStale,
  parseGeometryAnalysisRecords,
  qualifyGeometryAnalysisRecord,
  renameGeometryAnalysisRecord,
  saveGeometryAnalysisRecord,
  serializeGeometryAnalysisRecords,
  type GeometryAnalysisInspectorRecord,
} from "./analysisResultWorkflow";

const record = (overrides: Partial<GeometryAnalysisInspectorRecord> = {}): GeometryAnalysisInspectorRecord => ({
  id: "result-1",
  resultKey: "geometry:box@4:surface-analysis:default",
  name: "Sphere curvature",
  kind: "surface-analysis",
  sourceObjectId: "box",
  sourceObjectName: "Box",
  sourceRevision: 4,
  resultVersion: 2,
  lifecycle: "complete",
  domain: "surface",
  quantity: "Gaussian and mean curvature",
  method: "exact derivatives",
  units: "scene units",
  precision: "exact · 12 digits · tolerance 1e-9",
  sampling: "exact · 289 samples",
  parameters: { u: 0.5, v: 0.5 },
  requestedOutputs: ["scalar", "table"],
  statistics: { minimum: -1, maximum: 1 },
  warnings: [],
  engine: "Geometry analytical core",
  computeTimeMs: 4,
  createdAt: 10,
  updatedAt: 11,
  savedAt: null,
  payload: { exact: true },
  ...overrides,
});

describe("Geometry analysis result workflow", () => {
  it("normalizes every shared-store state into the Inspector lifecycle", () => {
    expect(geometryInspectorLifecycleState("queued")).toBe("running");
    expect(geometryInspectorLifecycleState("running", { preview: true })).toBe("preview");
    expect(geometryInspectorLifecycleState("ready")).toBe("complete");
    expect(geometryInspectorLifecycleState("ready", { saved: true })).toBe("saved");
    expect(geometryInspectorLifecycleState("error")).toBe("failed");
    expect(geometryInspectorLifecycleState("cancelled")).toBe("cancelled");
    expect(geometryInspectorLifecycleState("stale")).toBe("stale");
    expect(geometryInspectorLifecycleState("ready", { superseded: true })).toBe("superseded");
  });

  it("preserves stale payloads but prevents stale revisions driving the viewport", () => {
    const stale = markGeometryAnalysisRecordStale(record(), 5, 20);
    expect(stale.lifecycle).toBe("stale");
    expect(stale.payload).toEqual({ exact: true });
    expect(canGeometryResultDriveViewport(stale, 5)).toBe(false);
    expect(canGeometryResultDriveViewport(record(), 4)).toBe(true);
    expect(canGeometryResultDriveViewport(record(), null)).toBe(false);
    expect(qualifyGeometryAnalysisRecord(record(), 4)).toMatchObject({ status: "current",
      valuesAvailable: true });
    expect(qualifyGeometryAnalysisRecord(record(), 5)).toMatchObject({ status: "historical",
      valuesAvailable: false });
    expect(qualifyGeometryAnalysisRecord(record(), null)).toMatchObject({ status: "unavailable",
      valuesAvailable: false });
    expect(qualifyGeometryAnalysisRecord(record({ lifecycle: "preview" }), 4)).toMatchObject({
      status: "incomplete", valuesAvailable: false });
  });

  it("supports save, rename, duplicate settings and comparison", () => {
    const saved = saveGeometryAnalysisRecord(record(), 30);
    expect(saved.lifecycle).toBe("saved");
    expect(renameGeometryAnalysisRecord(saved, "  Final result  ", 31).name).toBe("Final result");
    expect(duplicateGeometryAnalysisSettings(saved)).toEqual({
      kind: "surface-analysis",
      domain: "surface",
      parameters: { u: 0.5, v: 0.5 },
      requestedOutputs: ["scalar", "table"],
    });
    const sourceRevisionRow = compareGeometryAnalysisRecords(saved, record({ sourceRevision: 5 }))
      .find((row) => row.key === "source revision");
    expect(sourceRevisionRow?.equal).toBe(false);
  });

  it("refuses to promote incomplete or historical runs into saved results", () => {
    for (const lifecycle of ["preview", "running", "failed", "cancelled", "stale"] as const)
      expect(() => saveGeometryAnalysisRecord(record({ lifecycle }))).toThrow(/Cannot save/);
  });

  it("only compares scalar statistics of current, compatible results", () => {
    const other = record({ id: "result-2", statistics: { minimum: -2 } });
    const current = compareQualifiedGeometryAnalysisRecords(record(), other, 4, 4);
    expect(current.status).toBe("comparable");
    expect(current.rows.some(row => row.key === "statistics")).toBe(true);
    for (const comparison of [
      compareQualifiedGeometryAnalysisRecords(record(), other, 4, null),
      compareQualifiedGeometryAnalysisRecords(record(), other, 5, 4),
      compareQualifiedGeometryAnalysisRecords(record(), { ...other, units: "m" }, 4, 4),
      compareQualifiedGeometryAnalysisRecords(record(), { ...other, lifecycle: "preview" }, 4, 4),
    ]) {
      expect(comparison.status).toBe("metadata-only");
      expect(comparison.rows.some(row => row.key === "statistics")).toBe(false);
    }
  });

  it("binds viewport publication to the exact quick result identity", () => {
    const saved = record({ lifecycle: "saved" });
    expect(canGeometryInspectorPublishSelected(saved, 4, record())).toBe(true);
    for (const quick of [record({ resultKey: "other" }), record({ resultVersion: 3 }),
      record({ sourceObjectId: "other" }), record({ sourceRevision: 5 })])
      expect(canGeometryInspectorPublishSelected(saved, 4, quick)).toBe(false);
    expect(canGeometryInspectorPublishSelected(saved, null, record())).toBe(false);
    expect(canGeometryInspectorPublishSelected(saved, 4, null)).toBe(false);
  });

  it("round trips persisted records and rejects malformed storage", () => {
    expect(parseGeometryAnalysisRecords(serializeGeometryAnalysisRecords([record()]))).toHaveLength(1);
    expect(parseGeometryAnalysisRecords("not json")).toEqual([]);
    expect(parseGeometryAnalysisRecords(JSON.stringify([{ id: 3 }]))).toEqual([]);
  });
});
