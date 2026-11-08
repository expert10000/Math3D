import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition } from "./infrastructure";
import { compareSurfaceResultLayers, createSurfaceCurveLayer, createSurfaceFeatureLayer, removeSurfaceResultLayer, surfaceLayerMethod, updateSurfaceResultLayer } from "./surfaceResultLayers";

const smooth = adaptSurfaceDefinition({ id: "torus", revision: 2, label: "Torus", representation: "parametric", familyId: "torus", expressions: { x: "x", y: "y", z: "z" }, domain: { kind: "parameter", u: { min: 0, max: 6.28, periodic: true }, v: { min: 0, max: 6.28, periodic: true } } });
const mesh = adaptSurfaceDefinition({ id: "mesh", revision: 4, label: "Mesh", representation: "mesh-backed", meshId: "m", domain: { kind: "mesh", vertexCount: 3, faceCount: 1 } });

describe("Surface persistent curve and feature layers", () => {
  it("creates stable revision-aware curve IDs and length statistics", () => {
    const args = { definition: smooth, layerKind: "geodesic" as const, parameters: { solver: "rk4" }, selectionSource: { kind: "picked-point" as const, references: ["p1", "p2"] }, polylines: [[[0, 0, 0], [3, 4, 0]]] };
    const first = createSurfaceCurveLayer(args);
    const second = createSurfaceCurveLayer(args);
    expect(first.layerId).toBe(second.layerId);
    expect(first.identity).toMatchObject({ surfaceId: "torus", surfaceRevision: 2 });
    expect(first.statistics).toMatchObject({ curveCount: 1, pointCount: 2, totalLength: 5, minimumLength: 5, maximumLength: 5 });
    expect(first.policy.periodicDomain).toBe(true);
  });

  it("splits invalid spans instead of drawing a fabricated bridge", () => {
    const layer = createSurfaceCurveLayer({ definition: smooth, layerKind: "geodesic",
      polylines: [[[0, 0, 0], [1, 0, 0], [Number.NaN, 0, 0], [10, 0, 0], [11, 0, 0]]] });
    expect(layer.polylines).toEqual([[[0, 0, 0], [1, 0, 0]], [[10, 0, 0], [11, 0, 0]]]);
    expect(layer.statistics).toMatchObject({ curveCount: 2, pointCount: 4, totalLength: 2 });
    expect(layer.warnings.join(" ")).toMatch(/1 invalid or isolated Surface sample/);
  });

  it("keeps chart coordinates aligned with every retained Surface run", () => {
    const layer = createSurfaceCurveLayer({ definition: smooth, layerKind: "geodesic",
      polylines: [[[0, 0, 0], [1, 0, 0], [Number.NaN, 0, 0], [2, 0, 0], [3, 0, 0]]],
      parameterPolylines: [[[0, 0], [0.1, 0], [0.2, 0], [0.3, 0], [0.4, 0]]] });
    expect(layer.parameterPolylines).toEqual([[[0, 0], [0.1, 0]], [[0.3, 0], [0.4, 0]]]);
    expect(layer.parameterPolylines?.map(line => line.length))
      .toEqual(layer.polylines.map(line => line.length));
  });

  it("refuses chart lines with a different number of vertices", () => {
    expect(() => createSurfaceCurveLayer({ definition: smooth, layerKind: "geodesic",
      polylines: [[[0, 0, 0], [1, 0, 0]]], parameterPolylines: [[[0, 0]]] }))
      .toThrow(/parameter points must match/);
  });

  it("labels discrete geometry mesh-approximation even when analytic is requested", () => {
    expect(surfaceLayerMethod(mesh, "analytic")).toBe("mesh-approximation");
    expect(createSurfaceFeatureLayer({ definition: mesh, method: "analytic", layerKind: "ridge", points: [[0, 0, 0]] }).method).toBe("mesh-approximation");
  });

  it("records explicit empty-state and stopping behavior", () => {
    const layer = createSurfaceCurveLayer({ definition: smooth, layerKind: "asymptotic" });
    expect(layer.state).toBe("empty");
    expect(layer.warnings.join(" ")).toMatch(/no computed polyline/i);
    expect(layer.policy.singularBehavior).toMatch(/stop/i);
  });

  it("stores feature confidence and curve statistics", () => {
    const layer = createSurfaceFeatureLayer({ definition: smooth, layerKind: "parabolic", points: [[0, 0, 0], [1, 0, 0]], confidence: [0.5, 1], polylines: [[[0, 0, 0], [1, 0, 0]]] });
    expect(layer.statistics).toEqual({ pointCount: 2, curveCount: 1, curvePointCount: 2, meanConfidence: 0.75 });
  });

  it("retains confidence by original feature index after invalid points are omitted", () => {
    const layer = createSurfaceFeatureLayer({ definition: smooth, layerKind: "ridge",
      points: [[0, 0, 0], [Number.NaN, 0, 0], [2, 0, 0]],
      confidence: [0.2, 0.9, 0.8] });
    expect(layer.points).toEqual([[0, 0, 0], [2, 0, 0]]);
    expect(Array.from(layer.confidence)[0]).toBeCloseTo(0.2);
    expect(Array.from(layer.confidence)[1]).toBeCloseTo(0.8);
    expect(layer.statistics.meanConfidence).toBeCloseTo(0.5);
  });

  it("refuses malformed feature confidence rather than reporting false certainty", () => {
    const input = { definition: smooth, layerKind: "ridge" as const, points: [[0, 0, 0]] as const };
    expect(() => createSurfaceFeatureLayer({ ...input, confidence: [Number.NaN] }))
      .toThrow(/finite/);
    expect(() => createSurfaceFeatureLayer({ ...input, confidence: [1.2] })).toThrow(/within/);
    expect(() => createSurfaceFeatureLayer({ ...input, confidence: [] })).toThrow(/match/);
  });

  it("leaves unmeasured feature confidence unknown", () => {
    const layer = createSurfaceFeatureLayer({ definition: smooth, layerKind: "umbilic", points: [[0, 0, 0]] });
    expect(layer.confidence).toHaveLength(0);
    expect(layer.statistics.meanConfidence).toBeNull();
    expect(layer.warnings.join(" ")).toMatch(/confidence is unavailable/);
  });

  it("discloses omitted feature points and separated curve runs", () => {
    const layer = createSurfaceFeatureLayer({ definition: smooth, layerKind: "parabolic",
      points: [[0, 0, 0], [Number.NaN, 0, 0]],
      polylines: [[[0, 0, 0], [1, 0, 0], [Number.NaN, 0, 0], [2, 0, 0], [3, 0, 0]]] });
    expect(layer.polylines).toEqual([[[0, 0, 0], [1, 0, 0]], [[2, 0, 0], [3, 0, 0]]]);
    expect(layer.statistics).toMatchObject({ pointCount: 1, curveCount: 2, curvePointCount: 4 });
    expect(layer.warnings.join(" ")).toMatch(/1 invalid Surface feature point/);
    expect(layer.warnings.join(" ")).toMatch(/1 invalid or isolated Surface feature curve sample/);
  });

  it("updates visibility and exclusive selection without changing IDs", () => {
    const a = createSurfaceCurveLayer({ definition: smooth, layerKind: "geodesic", parameters: { id: 1 }, polylines: [[[0, 0, 0], [1, 0, 0]]] });
    const b = createSurfaceCurveLayer({ definition: smooth, layerKind: "level", parameters: { id: 2 }, polylines: [[[0, 0, 0], [0, 1, 0]]] });
    const selected = updateSurfaceResultLayer([a, b], b.layerId, { selected: true, visible: false });
    expect(selected.map((layer) => [layer.layerId, layer.selected, layer.visible])).toEqual([[a.layerId, false, true], [b.layerId, true, false]]);
    expect(removeSurfaceResultLayer(selected, a.layerId)).toHaveLength(1);
  });

  it("compares layer kind, geometry and warning changes", () => {
    const a = createSurfaceCurveLayer({ definition: smooth, layerKind: "geodesic", polylines: [[[0, 0, 0], [1, 0, 0]]] });
    const b = createSurfaceCurveLayer({ definition: smooth, layerKind: "geodesic", parameters: { next: true }, polylines: [[[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [0, 1, 0]]] });
    expect(compareSurfaceResultLayers(a, b)).toMatchObject({ sameKind: true, geometryCountDelta: 1 });
  });
});
