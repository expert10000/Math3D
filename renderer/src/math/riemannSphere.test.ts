import { describe, expect, it } from "vitest";
import { C } from "./complex";
import { mapMobiusPointToSphere, RIEMANN_NORTH_POLE, sphereToStereographic, stereographicToSphere } from "./riemannSphere";
import type { MobiusParams } from "./mobius";

const closeTo = (a: number, b: number, digits = 8) => expect(a).toBeCloseTo(b, digits);

describe("riemannSphere", () => {
  it("maps origin to south pole", () => {
    const p = stereographicToSphere(0, 0);
    closeTo(p.x, 0);
    closeTo(p.y, 0);
    closeTo(p.z, -1);
  });

  it("maps non-finite input to north pole", () => {
    const p = stereographicToSphere(Number.POSITIVE_INFINITY, 0);
    expect(p).toEqual(RIEMANN_NORTH_POLE);
  });

  it("round-trips finite points through stereographic projection", () => {
    const z = C(0.75, -1.2);
    const p = stereographicToSphere(z.re, z.im);
    const back = sphereToStereographic(p);
    expect(back).not.toBeNull();
    closeTo(back!.re, z.re, 7);
    closeTo(back!.im, z.im, 7);
  });

  it("maps Mobius poles to north pole on sphere", () => {
    const params: MobiusParams = {
      a: C(1, 0),
      b: C(0, 0),
      c: C(1, 0),
      d: C(-1, 0),
    };
    const zPole = C(1, 0);
    const p = mapMobiusPointToSphere(zPole, params);
    expect(p).toEqual(RIEMANN_NORTH_POLE);
  });
});
