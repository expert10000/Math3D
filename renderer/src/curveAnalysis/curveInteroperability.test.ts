import { describe, expect, it } from "vitest";
import type { Curve2D } from "@math3d/core";
import { adaptCurveDefinition } from "./infrastructure";
import {
  createCurveToSurfaceRequest,
  detachCurveExchange,
  mapCurveLocationToSource,
  markCurveExchangeStale,
  openEvaluatorCurveInCurves,
  openSampledCurvesInCurves,
  openSurfaceLayerInCurves,
  verifyCurveExchangeParity,
} from "./curveInteroperability";
import { createSurfaceCurveLayer } from "../surfaceAnalysis/surfaceResultLayers";

const circle: Curve2D = { id: "geometry-circle", name: "Exact circle", kind: "parametric", family: "parametric", dimension: 2, domain: { tMin: 0, tMax: 2 * Math.PI, closed: true, periodic: true }, eval: (t) => ({ x: Math.cos(t), y: Math.sin(t) }), derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t) }) };
const geometrySource = { module: "geometry" as const, kind: "analytic-curve" as const, objectId: "edge-17", revision: 4, label: "Exact circle", units: { position: "mm", parameter: "rad" } };

describe("canonical Geometry and Surface curve interoperability", () => {
  it("preserves analytic Geometry evaluators, identity, units, revision, and return navigation", () => {
    const collection = openEvaluatorCurveInCurves({ source: geometrySource, curve: circle, exact: true, formulas: { x: "cos(t)", y: "sin(t)" } });
    const opened = collection.branches[0];
    expect(opened).toMatchObject({ fidelity: "exact", state: "current", source: { objectId: "edge-17", revision: 4 }, approximationTolerance: null });
    expect(opened.definition.identity).toMatchObject({ curveId: "geometry-circle", curveRevision: 4, sourceModule: "geometry" });
    expect(opened.definition.units).toMatchObject({ position: "mm", parameter: "rad" });
    expect(opened.navigation.source).toBe("geometry:edge-17@4");
    expect(mapCurveLocationToSource(opened, Math.PI / 2)).toMatchObject({ state: "mapped", sourceEntityId: "edge-17", sourceParameter: Math.PI / 2, confidence: 1 });
    expect(verifyCurveExchangeParity(opened)).toEqual({ ok: true, maximumDeviation: 0, sampleCount: 64 });
  });

  it("keeps section/intersection branches explicit and labels sampled fallbacks with tolerance", () => {
    const collection = openSampledCurvesInCurves({ source: { module: "geometry", kind: "intersection", objectId: "solid-pair", revision: 2, label: "Boolean intersection" }, branches: [[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], [{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }]], tolerance: 0.002 });
    expect(collection.branches).toHaveLength(2);
    expect(collection.branches[0].fidelity).toBe("polyline-approximation");
    expect(collection.branches[0].definition.identity.label).toContain("polyline approximation");
    expect(collection.branches[0].warnings.join(" ")).toContain("0.002");
    expect(collection.branches.map((branch) => branch.source.branchId)).toEqual(["branch-0", "branch-1"]);
    expect(mapCurveLocationToSource(collection.branches[1], 0.9)).toMatchObject({ state: "mapped", sampleIndex: 1, sourceEntityId: "solid-pair" });
  });

  it("retains Surface identity, generation settings, chart coordinates, and branch mapping", () => {
    const definition = adaptCurveDefinition({ id: "dummy", revision: 1, label: "dummy", representation: "parametric", dimension: 3, expressions: { x: "u", y: "v", z: "0" }, domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false } });
    const surfaceIdentity = { ...definition.identity, surfaceId: "torus", surfaceRevision: 7, key: "surface:torus@7", representation: "parametric" as const };
    const layer = createSurfaceCurveLayer({
      definition: { version: 1, fingerprint: "torus", identity: surfaceIdentity, representation: "parametric", domain: { kind: "parameter", u: { name: "u", min: 0, max: 1, periodic: true }, v: { name: "v", min: 0, max: 1, periodic: true } }, units: { position: "m", parameterU: "rad", parameterV: "rad", angle: "rad" }, coordinateSystem: "world", orientation: { convention: "right-handed", description: "outward" }, derivatives: { position: "exact", first: "exact", second: "exact", normal: "exact", metric: "exact", curvature: "exact" }, source: { familyId: "torus" }, dependencies: [], warnings: [] },
      layerKind: "geodesic", parameters: { tolerance: 1e-4 },
      polylines: [[[1, 0, 0], [0, 1, 0], [-1, 0, 0]]], parameterPolylines: [[[0, 0], [0.25, 0.5], [0.5, 1]]],
    });
    const opened = openSurfaceLayerInCurves(layer, { surfaceLabel: "Torus geodesic", tolerance: 1e-4 }).branches[0];
    expect(opened.source).toMatchObject({ module: "surfaces", hostSurface: { surfaceId: "torus", revision: 7 }, generation: { tolerance: 1e-4 } });
    expect(mapCurveLocationToSource(opened, 0.5)).toMatchObject({ state: "mapped", chart: [0.25, 0.5], sampleIndex: 1 });
  });

  it("marks bidirectional links stale, allows explicit detach, and blocks stale Surface requests", () => {
    const opened = openEvaluatorCurveInCurves({ source: geometrySource, curve: circle, exact: true }).branches[0];
    expect(markCurveExchangeStale(opened, 4)).toBe(opened);
    const stale = markCurveExchangeStale(opened, 5);
    expect(stale).toMatchObject({ state: "stale", staleReason: "Source changed from revision 4 to 5." });
    expect(mapCurveLocationToSource(stale, 0.5).state).toBe("stale");
    expect(() => createCurveToSurfaceRequest("revolution", [stale])).toThrow(/Stale Curve inputs/);
    const detached = detachCurveExchange(stale);
    expect(detached).toMatchObject({ state: "detached", staleReason: null });
    expect(createCurveToSurfaceRequest("revolution", [detached], { axis: "z" })).toMatchObject({ kind: "revolution", inputs: [{ curveId: "geometry-circle", curveRevision: 4, fidelity: "exact" }], parameters: { axis: "z" } });
  });

  it("routes extrusion, revolution, sweep, ruled, loft, and tube requests with approximation warnings", () => {
    const exact = openEvaluatorCurveInCurves({ source: geometrySource, curve: circle, exact: true }).branches[0];
    const sampled = openSampledCurvesInCurves({ source: { ...geometrySource, objectId: "sampled", kind: "section" }, branches: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]], tolerance: 0.01 }).branches[0];
    for (const kind of ["extrusion", "revolution", "sweep", "tube-surface"] as const) expect(createCurveToSurfaceRequest(kind, [sampled]).warnings[0]).toContain("0.01");
    for (const kind of ["ruled-surface", "loft"] as const) expect(createCurveToSurfaceRequest(kind, [exact, sampled]).inputs).toHaveLength(2);
    expect(() => createCurveToSurfaceRequest("loft", [exact])).toThrow(/requires at least 2/);
  });
});
