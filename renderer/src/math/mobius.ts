// src/math/mobius.ts
import type { Complex } from "./complex";
import { C, add, mul, abs2, div } from "./complex";

export type MobiusParams = {
  a: Complex;
  b: Complex;
  c: Complex;
  d: Complex;
};

export function mobiusSafe(z: Complex, p: MobiusParams): Complex {
  const { a, b, c, d } = p;

  // denom = c*z + d
  const denom = add(mul(c, z), d);
  if (abs2(denom) < 1e-12) {
    // Pole → treat as ∞
    return C(NaN, NaN);
  }

  // num = a*z + b
  const num = add(mul(a, z), b);

  // (a z + b) / (c z + d)
  return div(num, denom);
}
