import { describe, expect, it } from "vitest";
import { ellipticCurveFacts, enumerateFiniteEllipticCurve, realEllipticTangent,
  sampleRealEllipticCurve } from "../../packages/core/src/index";
import type { EllipticCurveDefinition } from "../../packages/core/src/ellipticCurve";

const curve = (a: string, b: string): EllipticCurveDefinition => ({ kind: "elliptic-curve",
  baseField: { objectId: "math3d:algebra:00000000000000000000000000000000", revision: 1 },
  model: "short-weierstrass", a, b });

describe("SAGE-G05 domain-specific curve views", () => {
  it("samples only real branches and checks a tangent/reflection witness", () => {
    const source = curve("-1", "1"), view = sampleRealEllipticCurve(source);
    expect(view.domain).toBe("real");
    expect(view.completeness).toBe("bounded-numerical-sample");
    expect(view.segments).toHaveLength(2);
    for (const segment of view.segments) for (const [x, y] of segment)
      expect(Math.abs(y * y - (x ** 3 - x + 1))).toBeLessThan(1e-9);
    const tangent = realEllipticTangent(source, ["0", "1"]);
    expect(tangent).toEqual({ point: ["0", "1"], slope: "-1/2",
      thirdIntersection: ["1/4", "7/8"], doublePoint: ["1/4", "-7/8"],
      rule: "tangent-and-reflection" });
    expect(realEllipticTangent(curve("-1", "0"), ["0", "0"]).rule).toBe("vertical-to-infinity");
  });

  it("enumerates the complete discrete GF(5) diagram, including infinity", () => {
    const source = curve("1", "1"), view = enumerateFiniteEllipticCurve(source, 5);
    expect(view.domain).toBe("finite-prime-field");
    expect(view.completeness).toBe("complete-enumeration");
    expect(view.groupOrder).toBe(9);
    expect(view.points).toEqual([[0, 1], [0, 4], [2, 1], [2, 4], [3, 1], [3, 4], [4, 2], [4, 3]]);
    expect(view.pointAtInfinity).toBe(true);
    expect(ellipticCurveFacts("1", "1", 5).jInvariant).toBe("2");
  });

  it("rejects unbounded or singular visualization requests", () => {
    expect(() => sampleRealEllipticCurve(curve("-1", "1"), -200, 2)).toThrow(/bounded/);
    expect(() => enumerateFiniteEllipticCurve(curve("1", "1"), 101)).toThrow(/bounded/);
    expect(() => enumerateFiniteEllipticCurve(curve("3", "1"), 5)).toThrow(/Singular/);
    expect(() => realEllipticTangent(curve("-1", "1"), ["1", "2"])).toThrow(/not on/);
  });
});
