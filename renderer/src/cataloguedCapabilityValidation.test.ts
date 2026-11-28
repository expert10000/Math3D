import { describe, expect, it } from "vitest";
import { EXTENDED_SCIENTIFIC_OPERATIONS_A } from "@math3d/core/src/moduleScientificOperationsExtendedA";
import { EXTENDED_SCIENTIFIC_OPERATIONS_B } from "@math3d/core/src/moduleScientificOperationsExtendedB";
import { MATH3D_PLATFORM_DISCOVERY, runScientificWorkflow, validateDiscoveryJsonValue } from "@math3d/core";
import { SCIENTIFIC_OPERATION_BINDINGS } from "./scientificOperationBindings";

type Output = Record<string, unknown>;
const close = (actual: unknown, expected: number) => expect(actual as number).toBeCloseTo(expected, 10);
const check: Record<string, (output: Output) => void> = {
  "graph2d.extrema.quadratic": out => expect(out).toEqual({ x: 2, y: 1, kind: "minimum" }),
  "graph2d.derivative.polynomial": out => expect(out).toEqual({ value: 17, derivative: 14 }),
  "graph2d.integral.polynomial": out => close(out.integral, 1 / 3),
  "graph2d.intersection.lines": out => expect(out.point).toEqual([1, 1]),
  "graph2d.asymptotes.linear-rational": out => expect(out).toEqual({ horizontal: 2, vertical: 3 }),
  "graph2d.regression.linear": out => expect(out).toEqual({ slope: 2, intercept: 1, rmse: 0 }),
  "graph2d.ode.exponential": out => {
    const values = out.values as number[];
    values.forEach((value, at) => close(value, 2 * Math.exp(-at)));
  },
  "graph3d.critical.diagonal-quadratic": out => expect(out).toEqual({ point: [1, 1, 1], kind: "minimum" }),
  "graph3d.hessian.diagonal-quadratic": out => expect(out.matrixRowMajor).toEqual([2, 0, 0, 0, 4, 0, 0, 0, 6]),
  "graph3d.level-set.sphere": out => (out.point as number[]).forEach((value, at) =>
    close(value, at < 2 ? Math.SQRT2 : 0)),
  "graph3d.constrained-extrema.unit-sphere": out => expect(out).toEqual({ minimum: 1, maximum: 3,
    minimumAxis: 0, maximumAxis: 2 }),
  "curve.curvature.circle": out => close(out.curvature, 0.5),
  "curve.torsion.helix": out => close(out.torsion, 0.2),
  "curve.frenet.helix": out => {
    const T = out.tangent as number[], N = out.normal as number[], B = out.binormal as number[];
    close(T[1], 2 / Math.sqrt(5)); close(T[2], 1 / Math.sqrt(5));
    expect(N).toEqual([-1, 0, 0]); close(B[1], -1 / Math.sqrt(5)); close(B[2], 2 / Math.sqrt(5));
  },
  "curve.intersection.planar-segments": out => expect(out.point).toEqual([1, 1]),
  "curve.geodesic.sphere": out => close(out.length, Math.PI),
  "surface.forms.sphere": out => expect(out).toEqual({ first: [4, 0, 4], second: [-2, 0, -2] }),
  "surface.area.spherical-cap": out => close(out.area, 8 * Math.PI),
  "surface.geodesic.sphere": out => close(out.length, Math.PI),
  "mesh.topology.summary": out => expect(out).toEqual({ vertices: 4, edges: 5, faces: 2,
    boundaryEdges: 4, eulerCharacteristic: 1 }),
  "mesh.curvature.angle-defect": out => { close(out.angleDefect, 0); close(out.gaussianCurvature, 0); },
  "mesh.quality.triangle": out => {
    close(out.area, 0.5); close(out.minimumAngleRadians, Math.PI / 4);
    close(out.aspectRatio, Math.SQRT2 * (2 + Math.SQRT2) / (2 * Math.sqrt(3)));
  },
  "mesh.remesh.longest-edge": out => {
    expect((out.vertices as number[][])[3]).toEqual([1, 0.5, 0]);
    expect(out.faces).toEqual([[1, 3, 0], [3, 2, 0]]);
  },
  "mesh.subdivide.midpoint": out => {
    expect((out.vertices as number[][]).slice(3)).toEqual([[0.5, 0, 0], [0.5, 0.5, 0], [0, 0.5, 0]]);
    expect((out.faces as number[][])).toHaveLength(4);
  },
  "mesh.simplify.duplicate-faces": out => expect(out).toEqual({ faces: [[0, 1, 2]], removed: 1 }),
  "geometry.intersection.ray-sphere": out => expect(out.parameters).toEqual([1, 3]),
  "geometry.volume.box": out => expect(out.volume).toBe(24),
  "geometry.angle.vectors": out => close(out.radians, Math.PI / 2),
  "geometry.transform.affine": out => expect(out.point).toEqual([3, 4, 5]),
  "geometry.constraint.distance": out => expect(out).toEqual({ residual: 0, satisfied: true }),
  "volume.scalar-field.gaussian": out => close(out.value, Math.exp(-0.5)),
  "volume.isosurface.affine-cell": out => {
    const vertices = out.vertices as number[][], triangles = out.triangles as number[][];
    expect(vertices).toHaveLength(4); expect(triangles).toHaveLength(2);
    vertices.forEach(vertex => close(vertex[2], 0.5));
    const [p, q, r] = triangles[0].map(index => vertices[index]);
    expect((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])).toBeGreaterThan(0);
  },
  "volume.slice.z-grid": out => expect(out).toEqual({ width: 2, height: 2, values: [4, 5, 6, 7] }),
  "volume.integral.voxel-grid": out => expect(out.integral).toBe(3),
  "volume.gradient.trilinear": out => expect(out.gradient).toEqual([1, 2, 4]),
  "topology.genus.closed-triangles": out => expect(out).toEqual({ eulerCharacteristic: 2, genus: 0 }),
  "topology.components.graph": out => expect(out.components).toEqual([[0, 1], [2, 3]]),
  "topology.homology.graph": out => expect(out).toEqual({ h0Rank: 1, h1Rank: 1, torsion: [] }),
  "topology.betti.graph": out => expect(out).toEqual({ betti0: 1, betti1: 1 }),
  "topology.persistence.graph-h0": out => expect(out).toEqual({ finiteDeaths: [1, 2], infiniteCount: 1 }),
  "cas.simplify.polynomial": out => expect(out.coefficients).toEqual([1, 2]),
  "cas.integrate.polynomial": out => expect(out.rationalCoefficients).toEqual([[0, 1], [1, 1], [1, 1], [1, 1]]),
  "cas.solve.linear": out => expect(out).toEqual({ kind: "one", rationalRoot: [3, 2] }),
  "cas.polynomial.multiply": out => expect(out.coefficients).toEqual([1, 0, -1]),
  "number-theory.factor.integer": out => expect(out.factors).toEqual([
    { prime: 2, exponent: 3 }, { prime: 3, exponent: 2 }, { prime: 5, exponent: 1 }]),
  "number-theory.field.quadratic-element": out => expect(out).toEqual({ norm: 1, trace: 6 }),
  "number-theory.galois.quadratic": out => expect(out).toEqual({ discriminant: 8, groupOrder: 2 }),
  "number-theory.elliptic.add-prime-field": out => expect(out.point).toEqual([10, 6]),
  "complex.pole.simple": out => expect(out.pole).toEqual({ re: 1, im: 2 }),
  "complex.residue.simple": out => expect(out.residue).toEqual({ re: 3, im: -1 }),
  "complex.mobius.real-coefficients": out => expect(out.image).toEqual({ re: 3, im: 3 }),
  "complex.contour.simple-pole": out => {
    const result = out.integral as { re: number; im: number };
    close(result.re, 0); close(result.im, 2 * Math.PI);
  },
  "complex.domain-color.point": out => { close(out.hue, 0.25);
    close(out.lightness, 1 - 1 / (1 + Math.log(2))); },
  "field.curl.affine": out => expect(out.curl).toEqual([0, 0, 2]),
  "field.streamline.constant": out => expect(out.points).toEqual([[0, 0, 0], [1, 2, 0], [2, 4, 0]]),
  "field.comparison.samples": out => expect(out).toEqual({ rmse: 0, sampleCount: 2 }),
  "field.flux.planar-patch": out => expect(out.flux).toBe(6),
  "field.critical.diagonal-affine": out => expect(out.point).toEqual([1, 1, 1]),
  "quantum.eigenvalues.symmetric-two-state": out => expect(out.eigenvalues).toEqual([1, 3]),
  "quantum.eigenstates.symmetric-two-state": out => {
    expect(out.eigenvalues).toEqual([1, 3]);
    const [first, second] = out.eigenvectors as number[][];
    close(first[0] ** 2 + first[1] ** 2, 1);
    close(second[0] ** 2 + second[1] ** 2, 1);
    close(first[0] * second[0] + first[1] * second[1], 0);
    close(2 * first[0] + first[1], first[0]);
    close(first[0] + 2 * first[1], first[1]);
  },
  "quantum.expectation.diagonal-two-state": out => expect(out).toEqual({ expectation: 2, norm: 2 }),
  "quantum.evolution.diagonal-two-state": out => {
    const [first, second] = out.amplitudes as number[][];
    expect(first).toEqual([1, 0]); close(second[0], 0); close(second[1], -1);
  },
};

describe("individual scientific capability validation", () => {
  const extended = [...EXTENDED_SCIENTIFIC_OPERATIONS_A, ...EXTENDED_SCIENTIFIC_OPERATIONS_B];
  it("has a scientific reference check for each new capability", () => {
    expect(extended).toHaveLength(62);
    expect(Object.keys(check).sort()).toEqual(extended.map(operation => operation.id).sort());
  });
  it.each(extended)("checks $id against a known result", async operation => {
    const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations", operation.id);
    if (descriptor?.kind !== "scientific-operations") throw new Error(operation.id);
    const input = descriptor.inputSchema.example;
    expect(validateDiscoveryJsonValue(descriptor.inputSchema, input)).toBe(true);
    const run = await runScientificWorkflow({ steps: [{ id: "reference", operationId: operation.id,
      input, parameters: {} }], host: { environment: "server", implementations: [descriptor.implementationId] },
    bindings: SCIENTIFIC_OPERATION_BINDINGS });
    const output = run.steps[0].output as Output;
    expect(validateDiscoveryJsonValue(descriptor.outputSchema, output)).toBe(true);
    check[operation.id](output);
  });
});
