import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition, createSurfaceAnalysisRegistry, createSurfaceAnalysisRequest,
  createSurfaceAnalysisResultStore, getSurfaceAnalysisResult, invalidateSurfaceAnalysisResult,
  publishSurfaceAnalysisResult } from "./infrastructure";
import { createSurfaceCurveLayer, createSurfaceLayersPayload } from "./surfaceResultLayers";
import { editSurfaceLayerDisplay } from "./surfaceLayerDisplay";

const definition = adaptSurfaceDefinition({ id: "sphere", revision: 3, label: "Sphere", representation: "parametric",
  expressions: { x: "u", y: "v", z: "0" }, domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } } });
const first = createSurfaceCurveLayer({ definition, layerKind: "geodesic", polylines: [[[0, 0, 0], [1, 0, 0]]] });
const second = createSurfaceCurveLayer({ definition, layerKind: "level", polylines: [[[0, 0, 0], [0, 1, 0]]] });
const registry = createSurfaceAnalysisRegistry();
const makeStore = () => {
  let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry,
    request: createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition", definition,
      domain: "surface", method: "analytic" }), now: 1 });
  store = publishSurfaceAnalysisResult({ store, registry,
    request: createSurfaceAnalysisRequest({ requestId: "layer", kind: "surface-curves", definition,
      domain: "curve", method: "surface-sampling" }),
    payload: createSurfaceLayersPayload({ definition, method: "surface-sampling", data: { kind: "curve-layers", layers: [first, second] } }), now: 2 });
  return store;
};

describe("Surface layer display edits", () => {
  it("updates visibility and exclusive selection without a new computation record", () => {
    const original = makeStore();
    let store = editSurfaceLayerDisplay(original, definition.identity, "surface-curves", first.layerId, "toggle");
    store = editSurfaceLayerDisplay(store, definition.identity, "surface-curves", first.layerId, "select");
    store = editSurfaceLayerDisplay(store, definition.identity, "surface-curves", second.layerId, "select");
    const result = getSurfaceAnalysisResult(store, definition.identity, "surface-curves")!;
    expect(result.payload?.data).toMatchObject({ kind: "curve-layers", layers: [
      { visible: false, selected: false }, { visible: true, selected: true }] });
    expect(result.resultVersion).toBe(1);
    expect(result.updatedAt).toBe(2);
    expect(store.history).toBe(original.history);
    expect(editSurfaceLayerDisplay(store, definition.identity, "surface-curves", "missing", "toggle")).toBe(store);
  });

  it("refuses display edits after source invalidation", () => {
    const store = invalidateSurfaceAnalysisResult(makeStore(), definition.identity, "surface-definition", "default", 3);
    expect(editSurfaceLayerDisplay(store, definition.identity, "surface-curves", first.layerId, "toggle")).toBe(store);
  });
});
