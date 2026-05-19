import { describe, expect, it } from "vitest";
import { C } from "./complex";
import {
  classifyMobiusBasic,
  mapMobiusCircleOrLine,
  mapMobiusGrid,
  mapMobiusPoint,
  mobiusFixedPoints,
  mobiusImageOfInfinity,
  mobiusPole,
  mobiusSafe,
  type MobiusParams,
} from "./mobius";

const identity: MobiusParams = {
  a: C(1, 0),
  b: C(0, 0),
  c: C(0, 0),
  d: C(1, 0),
};

const inversion: MobiusParams = {
  a: C(0, 0),
  b: C(1, 0),
  c: C(1, 0),
  d: C(0, 0),
};

describe("mobius core", () => {
  it("maps points with identity and handles poles", () => {
    const z = C(1.2, -0.3);
    const w = mapMobiusPoint(z, identity);
    expect(w?.re).toBeCloseTo(1.2, 10);
    expect(w?.im).toBeCloseTo(-0.3, 10);

    const poleOut = mapMobiusPoint(C(0, 0), inversion);
    expect(poleOut).toBeNull();
    const safePoleOut = mobiusSafe(C(0, 0), inversion);
    expect(Number.isNaN(safePoleOut.re)).toBe(true);
    expect(Number.isNaN(safePoleOut.im)).toBe(true);
  });

  it("computes pole and image of infinity", () => {
    const p: MobiusParams = {
      a: C(2, 0),
      b: C(1, 0),
      c: C(1, 0),
      d: C(3, 0),
    };
    const pole = mobiusPole(p);
    const infImage = mobiusImageOfInfinity(p);
    expect(pole?.re).toBeCloseTo(-3, 10);
    expect(pole?.im).toBeCloseTo(0, 10);
    expect(infImage?.re).toBeCloseTo(2, 10);
    expect(infImage?.im).toBeCloseTo(0, 10);
  });

  it("computes fixed points for affine and non-affine maps", () => {
    const affineShift: MobiusParams = {
      a: C(1, 0),
      b: C(1, 0),
      c: C(0, 0),
      d: C(1, 0),
    };
    const affineFixed = mobiusFixedPoints(affineShift);
    expect(affineFixed.kind).toBe("none");

    const pairFixed = mobiusFixedPoints(inversion);
    expect(pairFixed.kind).toBe("pair");
    expect(pairFixed.values.length).toBe(2);
    const reVals = pairFixed.values.map((v) => v.re).sort((a, b) => a - b);
    expect(reVals[0]).toBeCloseTo(-1, 8);
    expect(reVals[1]).toBeCloseTo(1, 8);
  });

  it("classifies basic map types", () => {
    const translation: MobiusParams = {
      a: C(1, 0),
      b: C(2, 0),
      c: C(0, 0),
      d: C(1, 0),
    };
    const singular: MobiusParams = {
      a: C(1, 0),
      b: C(2, 0),
      c: C(2, 0),
      d: C(4, 0),
    };
    expect(classifyMobiusBasic(identity).kind).toBe("identity");
    expect(classifyMobiusBasic(translation).kind).toBe("translation");
    expect(classifyMobiusBasic(inversion).kind).toBe("inversionLike");
    expect(classifyMobiusBasic(singular).kind).toBe("singular");
  });

  it("maps circles/lines to generalized circles", () => {
    const circleThroughPole = {
      kind: "circle" as const,
      center: C(1, 0),
      radius: 1,
    };
    const lineNotThroughPole = {
      kind: "line" as const,
      point: C(1, 0),
      direction: C(0, 1),
    };
    const mappedCircle = mapMobiusCircleOrLine(circleThroughPole, inversion);
    expect(mappedCircle.kind).toBe("line");
    const mappedLine = mapMobiusCircleOrLine(lineNotThroughPole, inversion);
    expect(mappedLine.kind === "circle" || mappedLine.kind === "line").toBe(true);
  });

  it("maps grid lines with segment output", () => {
    const grid = mapMobiusGrid(inversion, { extent: 2, step: 1, samplesPerLine: 64, clipAbs: 20 });
    expect(grid.horizontals.length).toBe(5);
    expect(grid.verticals.length).toBe(5);
    expect(grid.horizontals.some((l) => l.wSegments.length > 0)).toBe(true);
    expect(grid.verticals.some((l) => l.wSegments.length > 0)).toBe(true);
  });
});

