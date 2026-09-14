import { describe, expect, it } from "vitest";
import baseline from "../../../tests/fixtures/platform-v1.5.0/complex/baseline.json";
import { C } from "./complex";
import { compileComplexExpression } from "./complexExpr";
import { compileComplexMapExpressions } from "./complexMapSweep";
import { classifyMobiusBasic, mapMobiusPoint, type MobiusParams } from "./mobius";
import { evalRiemannSheet, sphereToStereographic, stereographicToSphere } from "./riemannSphere";

const expectPairNear = (actual: { re: number; im: number } | null | undefined, expected: number[], tolerance: number) => {
  expect(actual).toBeTruthy();
  expect(Math.abs((actual?.re ?? Number.NaN) - expected[0]!)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs((actual?.im ?? Number.NaN) - expected[1]!)).toBeLessThanOrEqual(tolerance);
};

const toMobiusParams = (values: number[][]): MobiusParams => ({
  a: C(values[0]![0]!, values[0]![1]!),
  b: C(values[1]![0]!, values[1]![1]!),
  c: C(values[2]![0]!, values[2]![1]!),
  d: C(values[3]![0]!, values[3]![1]!),
});

describe("v1.5.0 Complex Analysis compatibility baseline", () => {
  it.each(baseline.expressionCases)("preserves expression result $id", (fixture) => {
    const compiled = compileComplexExpression(fixture.expression);
    expect(compiled.error).toBeUndefined();
    const actual = compiled.fn?.({ z: C(fixture.z[0]!, fixture.z[1]!) });
    expectPairNear(actual, fixture.expected, fixture.tolerance ?? baseline.defaultTolerance);
  });

  it.each(baseline.diagnosticCases)("characterizes diagnostic $id", (fixture) => {
    const compiled = compileComplexExpression(fixture.expression, fixture.allowedVariables ?? ["z"]);
    if (fixture.expectedNonFinite) {
      expect(compiled.error).toBeUndefined();
      const actual = compiled.fn?.({ z: C(fixture.z![0]!, fixture.z![1]!) });
      expect(Number.isFinite(actual?.re ?? Number.NaN)).toBe(false);
      expect(Number.isFinite(actual?.im ?? Number.NaN)).toBe(false);
      return;
    }
    expect(compiled.fn).toBeUndefined();
    expect(compiled.error?.message).toContain(fixture.messageContains);
  });

  it.each(baseline.mobiusCases)("preserves Mobius behavior $id", (fixture) => {
    const params = toMobiusParams(fixture.params);
    expect(classifyMobiusBasic(params).kind).toBe(fixture.classification);
    const actual = mapMobiusPoint(C(fixture.z[0]!, fixture.z[1]!), params);
    if (fixture.expected === null) {
      expect(actual).toBeNull();
    } else {
      expectPairNear(actual, fixture.expected, baseline.defaultTolerance);
    }
  });

  it.each(baseline.riemannCases)("preserves Riemann projection $id", (fixture) => {
    const sphere = stereographicToSphere(fixture.z[0]!, fixture.z[1]!);
    if (fixture.sphere) {
      expect([sphere.x, sphere.y, sphere.z]).toEqual(fixture.sphere);
    }
    if (fixture.roundTrip) {
      expectPairNear(sphereToStereographic(sphere), fixture.z, fixture.tolerance ?? baseline.defaultTolerance);
    }
  });

  it.each(baseline.branchCases)("preserves represented branch sheet $id", (fixture) => {
    const actual = evalRiemannSheet(
      fixture.z[0]!,
      fixture.z[1]!,
      fixture.sheetIndex,
      fixture.sheetCount,
      fixture.branchCutAngle
    );
    expectPairNear(actual, fixture.expected, baseline.defaultTolerance);
  });

  it.each(baseline.complexMapCases)("preserves complex-map sample $id", (fixture) => {
    const compiled = compileComplexMapExpressions("u", "v", {
      inputMode: "fz",
      fExpr: fixture.expression,
    });
    expect(compiled.error).toBeUndefined();
    const actual = {
      re: compiled.reFn?.(fixture.z[0]!, fixture.z[1]!),
      im: compiled.imFn?.(fixture.z[0]!, fixture.z[1]!),
    };
    expectPairNear(
      actual.re == null || actual.im == null ? null : { re: actual.re, im: actual.im },
      fixture.expected,
      baseline.defaultTolerance
    );
  });
});
