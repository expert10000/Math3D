import { describe, expect, it } from "vitest";
import type { SurfaceAnalysisPayload, SurfaceChartPayload } from "./contracts";
import { adaptSurfaceDefinition, createSurfaceAnalysisRegistry, createSurfaceAnalysisRequest,
  createSurfaceAnalysisResultStore, getSurfaceAnalysisResult, invalidateSurfaceAnalysisResult,
  publishSurfaceAnalysisResult } from "./infrastructure";
import { createSurfaceChartEvidence, editSurfaceChartOverlay, serializeSurfaceChartEvidence,
  surfaceChartEvidenceCsv } from "./surfaceChartEvidence";
import { presentSurfaceAnalysisResult } from "./surfaceResultPresentation";

const definition = adaptSurfaceDefinition({ id: "torus", revision: 2, label: "Torus", representation: "parametric",
  expressions: { x: "u", y: "v", z: "0" }, domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } },
  units: { length: "m" } });
const chart = { kind: "chart", chartId: "chart:2", sampleCount: 2,
  parameterCoordinates: new Float64Array([0, 0, 1, 1]), metricDeterminant: new Float64Array([1, 2]),
  overlays: [{ kind: "boundary", label: "Boundary", visible: true, sampleIndices: new Uint32Array([0]) }] } as unknown as SurfaceChartPayload;
const payload: SurfaceAnalysisPayload = { version: 1, surfaceId: "torus", surfaceRevision: 2,
  representation: "parametric", method: "surface-sampling", units: definition.units,
  orientation: definition.orientation, warnings: ["Sampled chart"], data: chart };
const registry = createSurfaceAnalysisRegistry();
const makeStore = () => {
  let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry,
    request: createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition", definition,
      domain: "surface", method: "surface-sampling" }), payload, now: 1 });
  store = publishSurfaceAnalysisResult({ store, registry,
    request: createSurfaceAnalysisRequest({ requestId: "chart", kind: "chart-diagnostics", definition,
      domain: "chart", method: "surface-sampling" }), payload, now: 2 });
  return store;
};

describe("Surface chart evidence", () => {
  it("edits overlay display without advancing result version or computation history", () => {
    const original = makeStore();
    const store = editSurfaceChartOverlay(original, definition.identity, "boundary");
    const result = getSurfaceAnalysisResult<SurfaceAnalysisPayload>(store, definition.identity, "chart-diagnostics")!;
    expect(result.payload?.data).toMatchObject({ kind: "chart", overlays: [{ visible: false }] });
    expect(result.resultVersion).toBe(1);
    expect(store.history).toBe(original.history);
    expect(editSurfaceChartOverlay(store, definition.identity, "seam")).toBe(store);
    const stale = invalidateSurfaceAnalysisResult(store, definition.identity, "surface-definition", "default", 3);
    expect(editSurfaceChartOverlay(stale, definition.identity, "boundary")).toBe(stale);
  });

  it("exports typed arrays with recorded units, source and qualified check scope", () => {
    let store = makeStore();
    const result = getSurfaceAnalysisResult<SurfaceAnalysisPayload>(store, definition.identity, "chart-diagnostics")!;
    const evidence = createSurfaceChartEvidence({ definition, result,
      qualification: presentSurfaceAnalysisResult(definition, result, store) });
    expect(evidence).toMatchObject({ format: "math3d.surface-chart-evidence/v1",
      source: { fingerprint: definition.fingerprint, units: { length: "m" } },
      result: { version: 1, dependencies: [{ kind: "surface-definition", state: "ready" }] },
      qualification: { status: "current" }, warnings: ["Sampled chart"] });
    expect(evidence.qualification.independentCheck).toMatch(/not independently verified/);
    const json = JSON.parse(serializeSurfaceChartEvidence(evidence));
    expect(json.chart.parameterCoordinates).toEqual([0, 0, 1, 1]);
    expect(json.chart.metricDeterminant).toEqual([1, 2]);
    expect(json.publication).toMatchObject({ schema: "math3d.result-publication/v1",
      module: "surface", source: { revision: 2, hash: definition.fingerprint },
      assessment: { status: "recorded", sourceStatus: "current" } });
    const csv = surfaceChartEvidenceCsv(evidence);
    expect(csv).toContain('"sampleCount","2"');
    expect(csv).not.toContain("parameterCoordinates");
    store = invalidateSurfaceAnalysisResult(store, definition.identity, "surface-definition", "default", 3);
    const historical = getSurfaceAnalysisResult<SurfaceAnalysisPayload>(store, definition.identity, "chart-diagnostics")!;
    const withheld = createSurfaceChartEvidence({ definition, result: historical,
      qualification: presentSurfaceAnalysisResult(definition, historical, store) });
    expect(withheld.source.fingerprint).toBeNull();
    expect(withheld.chart).toBeNull();
    expect(withheld.publication.summary).toBeNull();
    expect(serializeSurfaceChartEvidence(withheld)).not.toContain("parameterCoordinates");
    expect(surfaceChartEvidenceCsv(withheld)).not.toContain('"sampleCount","2"');
  });
});
