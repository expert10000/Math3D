import { describe, expect, it } from "vitest";
import { getGeometryExactSurfacePreset } from "../geometry/exactSurfaceAnalysis";
import { adaptSurfaceDefinition } from "./infrastructure";
import { analyzeExactSurfaceDifferentialPoint, adaptMeshDifferentialPoint } from "./differentialGeometry";
import {
  classifySurfaceCurvature,
  createSurfaceCurvatureField,
  createSurfaceCurvatureFieldFromDifferential,
  createSurfaceCurvaturePayload,
  surfaceCurvatureRegionIndices,
} from "./surfaceCurvature";

describe("Surface canonical curvature result", () => {
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
});
