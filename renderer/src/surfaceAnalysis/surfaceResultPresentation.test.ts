import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition, createSurfaceAnalysisRegistry, createSurfaceAnalysisRequest,
  createSurfaceAnalysisResultStore, getSurfaceAnalysisResult, invalidateSurfaceAnalysisResult,
  publishSurfaceAnalysisResult } from "./infrastructure";
import { presentSurfaceAnalysisResult } from "./surfaceResultPresentation";
import type { SurfaceAnalysisPayload } from "./contracts";

const definition = adaptSurfaceDefinition({ id: "graph", revision: 4, label: "Graph", representation: "explicit",
  formula: "x*x+y*y", domain: { kind: "graph", x: { min: -1, max: 1 }, y: { min: -1, max: 1 } } });
const registry = createSurfaceAnalysisRegistry();
const payload: SurfaceAnalysisPayload = { version: 1, surfaceId: "graph", surfaceRevision: 4,
  representation: "explicit", method: "surface-sampling", units: definition.units,
  orientation: definition.orientation, warnings: [], data: { kind: "summary", values: { samples: 9 } } };

describe("Surface result presentation", () => {
  it("separates a current sampled claim from independent mathematical verification", () => {
    let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry,
      request: createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition", definition,
        domain: "surface", method: "surface-sampling" }), payload, now: 1 });
    store = publishSurfaceAnalysisResult({ store, registry,
      request: createSurfaceAnalysisRequest({ requestId: "curvature", kind: "curvature-field", definition,
        domain: "surface", method: "surface-sampling" }), payload, now: 2 });
    const result = getSurfaceAnalysisResult(store, definition.identity, "curvature-field");
    const presentation = presentSurfaceAnalysisResult(definition, result, store);
    expect(presentation).toMatchObject({ status: "current", canUseCurrentValues: true });
    expect(presentation.claim).toMatch(/sampled or approximated/);
    expect(presentation.verification).toMatch(/not independently verified/);
    store = invalidateSurfaceAnalysisResult(store, definition.identity, "surface-definition", "default", 3);
    expect(presentSurfaceAnalysisResult(definition, getSurfaceAnalysisResult(store, definition.identity, "curvature-field"), store))
      .toMatchObject({ status: "historical", canUseCurrentValues: false });
  });

  it("withholds missing and mismatched result payloads", () => {
    const empty = createSurfaceAnalysisResultStore();
    expect(presentSurfaceAnalysisResult(definition, null, empty)).toMatchObject({ status: "unavailable" });
    const store = publishSurfaceAnalysisResult({ store: empty, registry,
      request: createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition", definition,
        domain: "surface", method: "surface-sampling" }), payload: { ...payload, surfaceRevision: 3 }, now: 1 });
    expect(presentSurfaceAnalysisResult(definition, getSurfaceAnalysisResult(store, definition.identity, "surface-definition"), store))
      .toMatchObject({ status: "unavailable", canUseCurrentValues: false });
  });
});
