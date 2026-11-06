/** Exact short Weierstrass models in characteristic zero or prime characteristic above three. */
import type { AlgebraObjectRef } from "./algebraObjects";

export type EllipticCurveDefinition = Readonly<{ kind: "elliptic-curve"; baseField: AlgebraObjectRef;
  model: "short-weierstrass"; a: string; b: string }>;

const integer = (value: unknown, label: string): bigint => {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,3})$/.test(value))
    throw new TypeError(`${label} must be a canonical integer from -4096 to 4096.`);
  const n = BigInt(value);
  if (n < -4096n || n > 4096n) throw new TypeError(`${label} exceeds the coefficient bound 4096.`);
  return n;
};
export const mod = (n: bigint, p: bigint): bigint => ((n % p) + p) % p;
const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a, y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
};
export const rational = (n: bigint, d = 1n): string => {
  if (d === 0n) throw new TypeError("Elliptic curve denominator is zero.");
  const sign = d < 0n ? -1n : 1n, divisor = gcd(n, d);
  const a = sign * n / divisor, b = sign * d / divisor;
  return b === 1n ? String(a) : `${a}/${b}`;
};
export const parseRational = (value: unknown): readonly [bigint, bigint] => {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,30})(?:\/[1-9][0-9]{0,30})?$/.test(value))
    throw new TypeError("Elliptic curve value must be a bounded canonical rational.");
  const [n, d = "1"] = value.split("/");
  const pair = [BigInt(n), BigInt(d)] as const;
  if (rational(...pair) !== value) throw new TypeError("Elliptic curve rational is not reduced.");
  return pair;
};
export const ellipticCurveFacts = (aValue: unknown, bValue: unknown, characteristic = 0): Readonly<{
  a: string; b: string; characteristic: number; discriminant: string; jInvariant: string }> => {
  const a = integer(aValue, "Curve coefficient a"), b = integer(bValue, "Curve coefficient b");
  if (!Number.isSafeInteger(characteristic) || characteristic < 0 || characteristic === 2 || characteristic === 3 ||
      characteristic > 1009) throw new TypeError("Short Weierstrass curves require QQ or GF(p), 5 ≤ p ≤ 1009.");
  if (characteristic !== 0) for (let divisor = 2; divisor * divisor <= characteristic; divisor += 1)
    if (characteristic % divisor === 0) throw new TypeError("Short Weierstrass base characteristic must be prime.");
  const delta = -16n * (4n * a ** 3n + 27n * b ** 2n);
  if (characteristic === 0) {
    if (delta === 0n) throw new TypeError("Singular Weierstrass model: discriminant is zero.");
    return { a: String(a), b: String(b), characteristic,
      discriminant: String(delta), jInvariant: rational((-48n * a) ** 3n, delta) };
  }
  const p = BigInt(characteristic);
  if (a < 0n || a >= p || b < 0n || b >= p)
    throw new TypeError("GF(p) curve coefficients must be canonical residues from 0 to p−1.");
  if (mod(delta, p) === 0n) throw new TypeError("Singular Weierstrass model modulo p: discriminant is zero.");
  const inverse = (n: bigint): bigint => {
    for (let x = 1n; x < p; x += 1n) if (mod(n * x, p) === 1n) return x;
    throw new TypeError("No inverse in the selected prime field.");
  };
  return { a: String(a), b: String(b), characteristic,
    discriminant: String(mod(delta, p)), jInvariant: String(mod((-48n * a) ** 3n * inverse(delta), p)) };
};

export const ellipticDouble = (aValue: string, bValue: string, characteristic: number,
  point: readonly [string, string] | null): readonly [string, string] | null => {
  if (!point) return null;
  const facts = ellipticCurveFacts(aValue, bValue, characteristic);
  const a = BigInt(facts.a), b = BigInt(facts.b);
  const [x, y] = point.map((value) => parseRational(value)) as [[bigint, bigint], [bigint, bigint]];
  if (x[1] !== 1n || y[1] !== 1n || x[0] < -4096n || x[0] > 4096n ||
      y[0] < -4096n || y[0] > 4096n) throw new TypeError("Sample point requires bounded integer coordinates.");
  if (characteristic === 0) {
    if (y[0] ** 2n !== x[0] ** 3n + a * x[0] + b)
      throw new TypeError("Sample point is not on the elliptic curve.");
    if (y[0] === 0n) return null;
    const mN = 3n * x[0] ** 2n + a, mD = 2n * y[0];
    const outXn = mN ** 2n - 2n * x[0] * mD ** 2n, outXd = mD ** 2n;
    const outYn = mN * (x[0] * outXd - outXn) - y[0] * mD * outXd;
    return [rational(outXn, outXd), rational(outYn, mD * outXd)];
  }
  const p = BigInt(characteristic);
  if (x[0] < 0n || x[0] >= p || y[0] < 0n || y[0] >= p)
    throw new TypeError("GF(p) sample point requires canonical residues.");
  if (mod(y[0] ** 2n - x[0] ** 3n - a * x[0] - b, p) !== 0n)
    throw new TypeError("Sample point is not on the elliptic curve.");
  if (y[0] === 0n) return null;
  let inverse = 0n;
  for (let i = 1n; i < p; i += 1n) if (mod(i * 2n * y[0], p) === 1n) { inverse = i; break; }
  const slope = mod((3n * x[0] ** 2n + a) * inverse, p);
  const outX = mod(slope ** 2n - 2n * x[0], p);
  return [String(outX), String(mod(slope * (x[0] - outX) - y[0], p))];
};
