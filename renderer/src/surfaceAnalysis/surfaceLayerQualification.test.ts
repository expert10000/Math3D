import { describe, expect, it } from "vitest";
import { invalidateSurfaceAnalysisResult, adaptSurfaceDefinition, createSurfaceAnalysisRegistry,
  createSurfaceAnalysisRequest, createSurfaceAnalysisResultStore, getSurfaceAnalysisResult,
  publishSurfaceAnalysisResult } from "./infrastructure";
import { createSurfaceCurveLayer, createSurfaceLayersPayload } from "./surfaceResultLayers";
import { qualifySurfaceLayerResult } from "./surfaceLayerQualification";

const definition = adaptSurfaceDefinition({ id: "plane", revision: 2, label: "Plane", representation: "parametric",
  expressions: { x: "u", y: "v", z: "0" }, domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } } });
const registry = createSurfaceAnalysisRegistry();
const sourceRequest = createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition", definition, domain: "surface", method: "analytic" });
const layerRequest = createSurfaceAnalysisRequest({ requestId: "layers", kind: "surface-curves", definition, domain: "curve", method: "surface-sampling" });
const layerPayload = createSurfaceLayersPayload({ definition, method: "surface-sampling", data: { kind: "curve-layers",
  layers: [createSurfaceCurveLayer({ definition, layerKind: "geodesic", polylines: [[[0, 0, 0], [1, 0, 0]]] })] } });

describe("Surface layer qualification", () => {
  it("qualifies exact current source evidence without claiming independent proof", () => {
    let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry, request: sourceRequest, now: 1 });
    store = publishSurfaceAnalysisResult({ store, registry, request: layerRequest, payload: layerPayload, now: 2 });
    const result = getSurfaceAnalysisResult(store, definition.identity, "surface-curves");
    expect(qualifySurfaceLayerResult(definition, result, store)).toMatchObject({ status: "current", canUseCurrentActions: true });
    expect(qualifySurfaceLayerResult(definition, result, store).verification).toMatch(/not been independently verified/);
    store = invalidateSurfaceAnalysisResult(store, definition.identity, "surface-definition", "default", 3);
    expect(qualifySurfaceLayerResult(definition, getSurfaceAnalysisResult(store, definition.identity, "surface-curves"), store))
      .toMatchObject({ status: "historical", canUseCurrentActions: false });
  });

  it("withholds mismatched or missing layer evidence", () => {
    let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry, request: sourceRequest, now: 1 });
    store = publishSurfaceAnalysisResult({ store, registry, request: layerRequest,
      payload: { ...layerPayload, surfaceRevision: 1 }, now: 2 });
    expect(qualifySurfaceLayerResult(definition, getSurfaceAnalysisResult(store, definition.identity, "surface-curves"), store))
      .toMatchObject({ status: "unavailable", canUseCurrentActions: false });
    expect(qualifySurfaceLayerResult(definition, null, store)).toMatchObject({ status: "unavailable" });
  });
});
