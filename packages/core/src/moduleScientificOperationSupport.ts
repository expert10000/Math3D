import type { DiscoveryJsonSchema } from "./platformDiscovery";

export const n: DiscoveryJsonSchema = { type: "number" };
export const i: DiscoveryJsonSchema = { type: "integer" };
export const positive: DiscoveryJsonSchema = { type: "number", minimum: 0 };
export const a = (items: DiscoveryJsonSchema, minItems: number, maxItems: number): DiscoveryJsonSchema =>
  ({ type: "array", items, minItems, maxItems });
export const t = (length: number, items: DiscoveryJsonSchema = n): DiscoveryJsonSchema =>
  a(items, length, length);
export const o = (properties: Record<string, DiscoveryJsonSchema>): DiscoveryJsonSchema =>
  ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export const x = (schema: DiscoveryJsonSchema, sample: unknown): DiscoveryJsonSchema =>
  ({ ...schema, example: sample });
export const v2 = t(2);
export const v3 = t(3);
export const complex = o({ re: n, im: n });
export const finiteResult = (value: number, name: string): number => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} is not finite.`);
  return value;
};
export const dot = (left: number[], right: number[]) => left.reduce((sum, value, at) => sum + value * right[at], 0);
export const cross = (left: number[], right: number[]) => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];
export const magnitude = (values: number[]) => Math.hypot(...values);
export const unit = (values: number[], name: string): number[] => {
  const length = magnitude(values);
  if (!Number.isFinite(length) || length === 0) throw new RangeError(`${name} must be nonzero and finite.`);
  return values.map(value => finiteResult(value / length, name));
};
export const gcd = (left: number, right: number): number => {
  let a = Math.abs(left), b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
};
export const mod = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus;
export const inverse = (value: number, modulus: number): number | null => {
  let r = modulus, nextR = mod(value, modulus), t = 0, nextT = 1;
  while (nextR !== 0) {
    const q = Math.floor(r / nextR);
    [r, nextR] = [nextR, r - q * nextR];
    [t, nextT] = [nextT, t - q * nextT];
  }
  return r === 1 ? mod(t, modulus) : null;
};
