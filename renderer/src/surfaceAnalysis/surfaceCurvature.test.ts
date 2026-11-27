import { describe, expect, it } from "vitest";
import { validateDiscoveryJsonValue } from "@math3d/core";
import { getGeometryExactSurfacePreset } from "../geometry/exactSurfaceAnalysis";
import { adaptSurfaceDefinition, createSurfaceAnalysisRegistry, createSurfaceAnalysisRequest,
  createSurfaceAnalysisResultStore, getSurfaceAnalysisResult, invalidateSurfaceAnalysisResult,
  publishSurfaceAnalysisResult } from "./infrastructure";
import { presentSurfaceAnalysisResult } from "./surfaceResultPresentation";
import { createSurfaceCurvatureEvidence, surfaceCurvatureEvidenceCsv,
  surfaceCurvatureEvidenceJson } from "./surfaceCurvatureEvidence";
import { analyzeExactSurfaceDifferentialPoint, adaptMeshDifferentialPoint } from "./differentialGeometry";
import { surfaceCurvatureOperation, surfaceCurvatureOperationDescriptor } from "./surfaceCurvatureOperation";
import { adaptSurfaceCurvatureScientificResult } from "./surfaceScientificResult";
import {
  classifySurfaceCurvature,
  createSurfaceCurvatureField,
  createSurfaceCurvatureFieldFromDifferential,
  createSurfaceCurvaturePayload,
  surfaceCurvatureRegionIndices,
} from "./surfaceCurvature";

describe("Surface canonical curvature result", () => {
  it("executes through the registered operation used by the UI and worker", () => {
    expect(surfaceCurvatureOperation.definition.id).toBe("surface.curvature.compute");
    const field = surfaceCurvatureOperation.execute({
      source: { sampleCount: 1, K: [-1], H: [0], k1: [1], k2: [-1] },
      options: { histogramBins: 2 },
    });
    expect(field.gaussianCurvature[0]).toBe(-1);
    expect(field.statistics.K?.count).toBe(1);
    const json = JSON.parse(JSON.stringify(field, (_key, value) => ArrayBuffer.isView(value)
      ? Array.from(value as unknown as ArrayLike<number>) : value));
    expect(validateDiscoveryJsonValue(surfaceCurvatureOperationDescriptor.outputSchema, json)).toBe(true);
    expect(validateDiscoveryJsonValue(surfaceCurvatureOperationDescriptor.inputSchema,
      { surfaceSamples: { sampleCount: 1, K: [-1], H: [0], k1: [1], k2: [-1] } })).toBe(true);
    expect(validateDiscoveryJsonValue(surfaceCurvatureOperationDescriptor.parameterSchema,
      { histogramBins: 2 })).toBe(true);
  });

  it("classifies elliptic, hyperbolic, parabolic, flat and umbilic points with scale-aware tolerances", () => {
    expect(classifySurfaceCurvature({ k1: 2, k2: 1 })).toBe("elliptic");
    expect(classifySurfaceCurvature({ k1: 2, k2: -1 })).toBe("hyperbolic");
    expect(classifySurfaceCurvature({ k1: 2, k2: 1e-12 })).toBe("parabolic");
    expect(classifySurfaceCurvature({ k1: 1e-12, k2: -1e-12 })).toBe("flat");
    expect(classifySurfaceCurvature({ k1: 1000, k2: 1000.001 })).toBe("umbilic");
  });

  it("consolidates scalars, directions, masks, classifications and statistics", () => {
    const field = createSurfaceCurvatureField({
      sampleCount: 4,
      K: [2, -2, 0, 1], H: [1.5, 0.5, 1, 1], k1: [2, 2, 2, 1], k2: [1, -1, 0, 1],
      d1: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
      d2: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    }, { histogramBins: 2 });
    expect(field.classificationCounts).toMatchObject({ elliptic: 1, hyperbolic: 1, parabolic: 1, umbilic: 1 });
    expect(field.validDomainCount).toBe(4);
    expect(field.statistics.K).toMatchObject({ min: -2, max: 2, mean: 0.25, rms: 1.5, count: 4, minIndex: 1, maxIndex: 0 });
    expect(field.statistics.K?.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
    expect([...field.directionValidityMask]).toEqual([1, 1, 1, 0]);
    expect([...surfaceCurvatureRegionIndices(field, "hyperbolic")]).toEqual([1]);
  });

  it("suppresses arbitrary directions at umbilics and uncertain or invalid samples", () => {
    const field = createSurfaceCurvatureField({
      sampleCount: 3,
      K: [1, -1, Number.NaN], H: [1, 0, Number.NaN], k1: [1, 1, Number.NaN], k2: [1, -1, Number.NaN],
      d1: [1, 0, 0, 1, 0, 0, 1, 0, 0], d2: [0, 1, 0, 0, 1, 0, 0, 1, 0],
      uncertaintyMask: [0, 1, 0], validityMask: [1, 1, 0],
    });
    expect([...field.directionValidityMask]).toEqual([0, 0, 0]);
    expect([...field.principalDirections].every(Number.isNaN)).toBe(true);
    expect(field.classificationCounts.invalid).toBe(1);
  });

  it("normalizes exact differential samples without losing analytic provenance", () => {
    const plane = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("plane"), u: 0, v: 0 });
    const saddle = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("saddle"), u: 0, v: 0 });
    const field = createSurfaceCurvatureFieldFromDifferential([plane, saddle]);
    expect(field.classificationCounts.flat).toBe(1);
    expect(field.classificationCounts.hyperbolic).toBe(1);
    expect(field.statistics.K?.max).toBe(0);
    expect(field.parameters).toHaveLength(4);
  });

  it("forces mesh-backed payloads to retain mesh-approximation provenance and units", () => {
    const definition = adaptSurfaceDefinition({
      id: "mesh", revision: 3, label: "Mesh", representation: "mesh-backed", meshId: "m1",
      domain: { kind: "mesh", vertexCount: 1, faceCount: 0 }, units: { length: "mm", angle: "rad" },
    });
    const point = adaptMeshDifferentialPoint({ position: [0, 0, 0], normal: [0, 0, 1], principalCurvatures: [2, 1] });
    const field = createSurfaceCurvatureFieldFromDifferential([point]);
    const payload = createSurfaceCurvaturePayload({ definition, method: "analytic", field });
    expect(payload).toMatchObject({ surfaceId: "mesh", surfaceRevision: 3, method: "mesh-approximation", units: { length: "mm" }, data: { units: { K: "mm^-2", H: "mm^-1", shapeIndex: "1" } } });
  });

  it("publishes bounded curvature statistics and withholds historical sample arrays", () => {
    const definition = adaptSurfaceDefinition({ id: "plane", revision: 2, label: "Plane",
      representation: "parametric", expressions: { x: "u", y: "v", z: "0" },
      domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } },
      units: { length: "m" } });
    const field = createSurfaceCurvatureField({ sampleCount: 2,
      K: [2, 3], H: [1, 1], k1: [2, 3], k2: [1, 1] });
    const payload = createSurfaceCurvaturePayload({ definition, method: "surface-sampling", field });
    const registry = createSurfaceAnalysisRegistry();
    let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry,
      request: createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition",
        definition, domain: "surface", method: "surface-sampling" }), now: 1 });
    store = publishSurfaceAnalysisResult({ store, registry,
      request: createSurfaceAnalysisRequest({ requestId: "curvature", kind: "curvature-field",
        definition, domain: "surface", method: "surface-sampling" }), payload, now: 2 });
    const result = getSurfaceAnalysisResult(store, definition.identity, "curvature-field")!;
    const scientific = adaptSurfaceCurvatureScientificResult(definition, result);
    expect(scientific).toMatchObject({ operationId: "surface.curvature.compute",
      capabilityIds: ["surface.curvature.gaussian", "surface.curvature.mean", "surface.curvature.principal"],
      artifacts: [{ retained: true, type: "SurfaceCurvatureField" }] });
    expect(scientific?.metrics.find(metric => metric.id === "metric.K.mean"))
      .toMatchObject({ value: 2.5, units: "m^-2" });
    expect(adaptSurfaceCurvatureScientificResult(definition, { ...result,
      payload: { ...payload, units: { ...payload.units, length: "cm" } } })).toBeNull();
    const evidence = createSurfaceCurvatureEvidence({ definition, result,
      qualification: presentSurfaceAnalysisResult(definition, result, store) });
    expect(evidence.publication).toMatchObject({ module: "surface",
      assessment: { status: "recorded", sourceStatus: "current" },
      summary: { sampleCount: 2 } });
    expect(JSON.parse(surfaceCurvatureEvidenceJson(evidence)).field.gaussianCurvature).toEqual([2, 3]);
    expect(surfaceCurvatureEvidenceCsv(evidence)).toContain('"sampleCount","2"');
    expect(surfaceCurvatureEvidenceCsv(evidence)).not.toContain("gaussianCurvature");
    store = invalidateSurfaceAnalysisResult(store, definition.identity, "surface-definition", "default", 3);
    const historical = getSurfaceAnalysisResult(store, definition.identity, "curvature-field")!;
    expect(adaptSurfaceCurvatureScientificResult(definition, historical)).toBeNull();
    const withheld = createSurfaceCurvatureEvidence({ definition, result: historical,
      qualification: presentSurfaceAnalysisResult(definition, historical, store) });
    expect(withheld.field).toBeNull();
    expect(withheld.publication.summary).toBeNull();
    expect(surfaceCurvatureEvidenceJson(withheld)).not.toContain("gaussianCurvature");
    expect(surfaceCurvatureEvidenceCsv(withheld)).not.toContain('"sampleCount","2"');
  });
});
