import { describe, expect, it } from "vitest";
import {
  DerivedCurveWorkspace,
  closestPointOnCurve,
  closestPointsBetweenCurves,
  coordinateExtrema,
  createDerivedCurveCollection,
  curveBoundingBox,
  intersectCurveWithPlane,
  intersectPlanarCurves,
  previewDerivedCurve,
  type Curve2D,
  type Curve3D,
} from "@math3d/core";

const circle: Curve2D = {
  id: "circle",
  name: "Circle",
  kind: "parametric",
  dimension: 2,
  domain: { tMin: 0, tMax: Math.PI * 2, closed: true, periodic: true },
  eval: (t) => ({ x: Math.cos(t), y: Math.sin(t) }),
  derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t) }),
  secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t) }),
};

const line = (id: string, y: number): Curve2D => ({
  id,
  name: id,
  kind: "parametric",
  dimension: 2,
  domain: { tMin: -2, tMax: 2, closed: false, periodic: false },
  eval: (t) => ({ x: t, y }),
  derivative: () => ({ x: 1, y: 0 }),
});

const helix: Curve3D = {
  id: "helix",
  name: "Helix",
  kind: "parametric",
  dimension: 3,
  domain: { tMin: -Math.PI, tMax: Math.PI, closed: false, periodic: false },
  eval: (t) => ({ x: Math.cos(t), y: Math.sin(t), z: t }),
};

const source = (curve = circle, revision = 1) => ({ curve, curveId: curve.id, revision });

describe("dependency-aware derived curve operations", () => {
  it("builds deterministic offset, evolute, involute, indicatrix, projection, transform and reverse curves", () => {
    const offset = createDerivedCurveCollection({ id: "offset", operation: "offset", sources: [source()], parameters: { distance: -0.5 }, now: 10 });
    expect(offset.status).toBe("ready");
    expect(offset.branches[0].eval(0)).toEqual(expect.objectContaining({ x: 1.5, y: 0 }));
    expect(offset.branches[0].derived).toMatchObject({ operation: "offset", branch: 0, sourceCurves: [{ curveId: "circle", revision: 1 }], createdAt: 10 });

    const evolute = createDerivedCurveCollection({ id: "evolute", operation: "evolute", sources: [source()] });
    expect(evolute.branches[0].eval(Math.PI / 3).x).toBeCloseTo(0, 7);
    expect(evolute.branches[0].eval(Math.PI / 3).y).toBeCloseTo(0, 7);

    const involute = createDerivedCurveCollection({ id: "involute", operation: "involute", sources: [source()], parameters: { startParameter: 0 } });
    expect(involute.branches[0].eval(0)).toEqual(expect.objectContaining({ x: 1, y: 0 }));

    const tangent = createDerivedCurveCollection({ id: "tan", operation: "tangent-indicatrix", sources: [source()] });
    expect(tangent.branches[0].eval(0).x).toBeCloseTo(0, 8);
    expect(tangent.branches[0].eval(0).y).toBeCloseTo(1, 8);

    const projection = createDerivedCurveCollection({ id: "projection", operation: "projection-plane", sources: [source(helix)], parameters: { plane: { origin: { x: 0, y: 0, z: 2 }, normal: { x: 0, y: 0, z: 1 } } } });
    expect(projection.branches[0].eval(0)).toEqual(expect.objectContaining({ x: 1, y: 0, z: 2 }));

    const transform = createDerivedCurveCollection({ id: "transform", operation: "transform", sources: [source()], parameters: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -1, 0, 1] } });
    expect(transform.branches[0].eval(0)).toEqual(expect.objectContaining({ x: 3, y: -1 }));

    const reverse = createDerivedCurveCollection({ id: "reverse", operation: "reverse", sources: [source()] });
    expect(reverse.branches[0].eval(0).x).toBeCloseTo(1, 8);
  });

  it("returns explicit branches and failures for split, ambiguous join, dimension mismatch and unavailable Surface projection", () => {
    const split = createDerivedCurveCollection({ id: "split", operation: "split", sources: [source()], parameters: { parameter: Math.PI } });
    expect(split.branches).toHaveLength(2);
    expect(split.branches.map((branch) => [branch.domain.tMin, branch.domain.tMax])).toEqual([[0, Math.PI], [Math.PI, Math.PI * 2]]);

    const joined = createDerivedCurveCollection({ id: "join", operation: "join", sources: [source(line("a", 0)), source(line("b", 0))], parameters: { tolerance: 10 } });
    expect(joined.branches).toHaveLength(1);
    expect(joined.warnings.some((warning) => warning.code === "ambiguous-join")).toBe(true);

    const incompatible = createDerivedCurveCollection({ id: "bad", operation: "join", sources: [source(circle), source(helix)] });
    expect(incompatible.status).toBe("error");
    expect(incompatible.warnings[0].code).toBe("incompatible-dimension");

    const surfaceProjection = createDerivedCurveCollection({ id: "surface", operation: "projection-surface", sources: [source()], parameters: { surfaceId: "torus" } });
    expect(surfaceProjection).toMatchObject({ status: "capability-required", branches: [] });
  });

  it("computes planar and spatial constructions without silently dropping results", () => {
    const vertical: Curve2D = { ...line("vertical", 0), eval: (t) => ({ x: 0, y: t }), derivative: () => ({ x: 0, y: 1 }) };
    const intersections = intersectPlanarCurves(line("horizontal", 0), vertical, 32);
    expect(intersections).toHaveLength(1);
    expect(intersections[0].pointA).toEqual(expect.objectContaining({ x: 0, y: 0 }));

    const closest = closestPointOnCurve(circle, { x: 2, y: 0 });
    expect(closest.point).toEqual(expect.objectContaining({ x: expect.closeTo(1, 4), y: expect.closeTo(0, 4) }));
    expect(closest.distance).toBeCloseTo(1, 4);

    const pair = closestPointsBetweenCurves(line("low", -1), line("high", 1), 32);
    expect(pair.distance).toBeCloseTo(2, 5);

    const planeHits = intersectCurveWithPlane(helix, { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } }, 128);
    expect(planeHits).toHaveLength(1);
    expect(planeHits[0].parameter).toBeCloseTo(0, 6);

    const extrema = coordinateExtrema(circle);
    expect(extrema.x?.min.point.x).toBeCloseTo(-1, 4);
    expect(extrema.y?.max.point.y).toBeCloseTo(1, 4);
    expect(curveBoundingBox(circle)).toMatchObject({ min: { x: expect.closeTo(-1, 4), y: expect.closeTo(-1, 4) }, max: { x: expect.closeTo(1, 4), y: expect.closeTo(1, 4) } });
  });

  it("previews, commits, recomputes live dependencies, freezes, detaches, regenerates, opens and deletes", () => {
    const workspace = new DerivedCurveWorkspace();
    const preview = previewDerivedCurve({ id: "live-offset", operation: "offset", sources: [source()], parameters: { distance: -0.5 }, now: 1 });
    expect(preview.phase).toBe("preview");
    const committed = workspace.commit(preview);
    expect(committed.state).toBe("live");
    expect(workspace.openSource(committed.id)?.revision).toBe(1);

    const radiusTwo: Curve2D = { ...circle, eval: (t) => ({ x: 2 * Math.cos(t), y: 2 * Math.sin(t) }), derivative: (t) => ({ x: -2 * Math.sin(t), y: 2 * Math.cos(t) }) };
    const recomputed = workspace.registerSource(source(radiusTwo, 2));
    expect(recomputed).toHaveLength(1);
    expect(recomputed[0].revision).toBe(2);
    expect(recomputed[0].result.branches[0].eval(0).x).toBeCloseTo(2.5, 6);

    expect(workspace.freeze(committed.id)?.state).toBe("frozen-snapshot");
    expect(workspace.registerSource(source(circle, 3))).toHaveLength(0);
    expect(workspace.regenerate(committed.id)?.state).toBe("live");
    expect(workspace.detach(committed.id)?.state).toBe("detached");
    expect(workspace.delete(committed.id)).toBe(true);
    expect(workspace.get(committed.id)).toBeNull();
  });
});
