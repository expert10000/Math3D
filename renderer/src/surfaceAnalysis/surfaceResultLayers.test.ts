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
