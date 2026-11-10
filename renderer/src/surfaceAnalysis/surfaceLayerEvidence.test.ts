import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition, createSurfaceAnalysisRegistry, createSurfaceAnalysisRequest,
  createSurfaceAnalysisResultStore, getSurfaceAnalysisResult, invalidateSurfaceAnalysisResult,
  publishSurfaceAnalysisResult } from "./infrastructure";
import { createSurfaceFeatureLayer, createSurfaceLayersPayload } from "./surfaceResultLayers";
import { qualifySurfaceLayerResult } from "./surfaceLayerQualification";
import { createSurfaceLayerEvidence, surfaceLayerEvidenceCsv } from "./surfaceLayerEvidence";

const definition = adaptSurfaceDefinition({ id: "shell", revision: 5, label: "Shell", representation: "mesh-backed",
  meshId: "mesh:5", domain: { kind: "mesh", vertexCount: 3, faceCount: 1 }, units: { length: "mm" } });
const layer = createSurfaceFeatureLayer({ definition, layerKind: "umbilic", points: [[0, 0, 0], [1, 0, 0]],
  confidence: [0.2, 0.8], warnings: ["Boundary estimate"] });
const payload = createSurfaceLayersPayload({ definition, method: "mesh-approximation",
  data: { kind: "feature-layers", layers: [layer] }, warnings: ["Mesh approximation"] });
const registry = createSurfaceAnalysisRegistry();

describe("Surface layer evidence export", () => {
  it("exports source units, method, result version, warnings and measured confidence", () => {
    let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry,
      request: createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition", definition, domain: "surface", method: "mesh-approximation" }), now: 1 });
    store = publishSurfaceAnalysisResult({ store, registry,
      request: createSurfaceAnalysisRequest({ requestId: "layer", kind: "surface-features", definition, domain: "feature", method: "mesh-approximation" }), payload, now: 2 });
    const result = getSurfaceAnalysisResult(store, definition.identity, "surface-features")!;
    const evidence = createSurfaceLayerEvidence({ definition, result, layer,
      qualification: qualifySurfaceLayerResult(definition, result, store) });
    expect(evidence).toMatchObject({ format: "math3d.surface-layer-evidence/v1",
      source: { identity: definition.identity, fingerprint: definition.fingerprint, units: { length: "mm" } },
      result: { kind: "surface-features", version: 1, method: "mesh-approximation", dependencies: [{ kind: "surface-definition", state: "ready" }] },
      qualification: { status: "current" }, warnings: ["Mesh approximation", "Boundary estimate"],
      layer: { layerKind: "umbilic" } });
    expect(evidence.layer && "confidence" in evidence.layer && evidence.layer.confidence[0]).toBeCloseTo(0.2);
    expect(evidence.layer && "confidence" in evidence.layer && evidence.layer.confidence[1]).toBeCloseTo(0.8);
    expect(evidence.qualification.independentCheck).toMatch(/not been independently verified/);
    expect(JSON.parse(JSON.stringify(evidence)).layer.confidence).toHaveLength(2);
    expect(evidence.publication).toMatchObject({ schema: "math3d.result-publication/v1",
      module: "surface", source: { revision: 5, hash: definition.fingerprint },
      assessment: { status: "recorded", sourceStatus: "current" },
      summary: { layerKind: "umbilic" } });
    expect(surfaceLayerEvidenceCsv(evidence)).toContain('"layerKind","umbilic"');
    expect(surfaceLayerEvidenceCsv(evidence)).not.toContain("confidence");
    store = invalidateSurfaceAnalysisResult(store, definition.identity, "surface-definition", "default", 3);
    const stale = getSurfaceAnalysisResult(store, definition.identity, "surface-features")!;
    const historical = createSurfaceLayerEvidence({ definition, result: stale, layer,
      qualification: qualifySurfaceLayerResult(definition, stale, store) });
    expect(historical.qualification.status).toBe("historical");
    expect(historical.source.fingerprint).toBeNull();
    expect(historical.layer).toBeNull();
    expect(historical.publication.summary).toBeNull();
    expect(JSON.stringify(historical)).not.toContain("0.8");
    expect(surfaceLayerEvidenceCsv(historical)).not.toContain('"layerKind","umbilic"');
  });

  it("rejects an unrelated layer", () => {
    const store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry,
      request: createSurfaceAnalysisRequest({ requestId: "layer", kind: "surface-features", definition, domain: "feature", method: "mesh-approximation" }), payload, now: 1 });
    const result = getSurfaceAnalysisResult(store, definition.identity, "surface-features")!;
    expect(() => createSurfaceLayerEvidence({ definition, result,
      layer: { ...layer, layerId: "unrelated" }, qualification: qualifySurfaceLayerResult(definition, result, store) }))
      .toThrow(/matching collected result/);
  });
});
