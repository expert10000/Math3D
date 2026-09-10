import { describe, expect, it } from "vitest";
import type { AnalysisFieldMetadata, AnalysisPaletteRangeMetadata, AnalysisProbe } from "../analysis/contracts";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { createGeometryAnalysisSnapshot } from "./analysisBridge";
import {
  createGeometryAnalysisIdentity,
  createGeometryAnalysisRegistry,
  createGeometryAnalysisResultStore,
  getGeometryAnalysisDefinition,
  getGeometryAnalysisResult,
  registerGeometryAnalysis,
  resolveGeometryAnalysisDependencies,
  upsertGeometryAnalysisResult,
} from "./analysisInfrastructure";

const mesh: SurfaceMeshData = {
  label: "triangle",
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: Uint32Array.from([0, 1, 2]),
  normals: null,
  source: { kind: "detachedMesh" },
};

describe("Geometry shared analysis infrastructure", () => {
  it("accepts future analytical quantities through the shared registry and result cache", () => {
    const snapshot = createGeometryAnalysisSnapshot({
      mesh,
      sourceObjectId: "object-7",
      sourceObjectName: "Triangle",
      snapshotSequence: 1,
      createdAt: 10,
    });
    const identity = createGeometryAnalysisIdentity(snapshot);
    const registry = registerGeometryAnalysis(createGeometryAnalysisRegistry(), {
      kind: "surface-area-density",
      label: "Surface area density",
      family: "geometry-measurement",
      domain: "object",
      dependencies: [{ kind: "basic-metrics" }],
    });
    expect(getGeometryAnalysisDefinition(registry, "surface-area-density")?.label).toBe("Surface area density");

    let store = createGeometryAnalysisResultStore();
    store = upsertGeometryAnalysisResult(store, {
      identity,
      kind: "basic-metrics",
      parameters: { units: "m" },
      payload: { area: 0.5 },
      computeTimeMs: 0.25,
      now: 11,
    });
    expect(resolveGeometryAnalysisDependencies(registry, store, identity, "surface-area-density")).toEqual([
      expect.objectContaining({
        kind: "basic-metrics",
        variant: "default",
        state: "ready",
        resultVersion: 1,
      }),
    ]);
    expect(getGeometryAnalysisResult<{ area: number }>(store, identity, "basic-metrics")?.payload?.area).toBe(0.5);
    expect(store.history[0]).toMatchObject({ backend: "Geometry analytical core", identity: { sourceObjectId: "object-7" } });
  });

  it("uses the same field, palette/range, and probe schemas as Mesh analysis", () => {
    const field: AnalysisFieldMetadata = {
      id: "signed-distance",
      label: "Signed distance",
      domain: "point",
      valueType: "scalar",
      unit: "m",
      source: "analytical plane",
    };
    const display: AnalysisPaletteRangeMetadata = {
      palette: "blue-red",
      inverted: false,
      rangeMode: "symmetric",
      range: { min: -1, max: 1 },
    };
    const probe: AnalysisProbe = {
      targetId: "point:0",
      domain: "point",
      position: [0, 0, 0],
      values: [{ field, value: 0, valid: true }],
      warnings: [],
    };
    expect({ field, display, probe }).toMatchObject({
      field: { valueType: "scalar", domain: "point" },
      display: { rangeMode: "symmetric" },
      probe: { values: [{ valid: true }] },
    });
  });
});
