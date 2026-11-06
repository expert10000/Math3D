/** Deterministic views of pinned G04 curves. Real samples are numerical; finite points are exact. */
import { ellipticCurveFacts, ellipticDouble, mod, parseRational, rational,
  type EllipticCurveDefinition } from "./ellipticCurve";

export type RealCurvePoint = readonly [number, number];
export type RealCurveSample = Readonly<{ domain: "real"; xMin: number; xMax: number;
  yMax: number; sampleCount: number; segments: readonly (readonly RealCurvePoint[])[];
  completeness: "bounded-numerical-sample" }>;
export type FiniteCurveDiagram = Readonly<{ domain: "finite-prime-field"; characteristic: number;
  points: readonly (readonly [number, number])[]; pointAtInfinity: true; groupOrder: number;
  completeness: "complete-enumeration" }>;

const cubic = (x: number, a: number, b: number) => x * x * x + a * x + b;

/** Samples both y branches, splitting at every region with no real points. */
export const sampleRealEllipticCurve = (definition: EllipticCurveDefinition,
  xMin = -3, xMax = 3, sampleCount = 401): RealCurveSample => {
  ellipticCurveFacts(definition.a, definition.b);
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin < -100 || xMax > 100 ||
      xMax - xMin < 0.1 || xMax - xMin > 100 || !Number.isSafeInteger(sampleCount) ||
      sampleCount < 101 || sampleCount > 801)
    throw new TypeError("Real curve view requires bounded x limits and 101–801 samples.");
  const a = Number(definition.a), b = Number(definition.b);
  const positive: RealCurvePoint[][] = [];
  let current: RealCurvePoint[] = [];
  const append = (x: number, value: number) => current.push([x, Math.sqrt(Math.max(0, value))]);
  const finish = () => { if (current.length > 0) positive.push(current); current = []; };
  const rootBetween = (left: number, right: number, leftValue: number): number => {
    let lo = left, hi = right, loPositive = leftValue >= 0;
    for (let i = 0; i < 40; i += 1) {
      const middle = (lo + hi) / 2;
      if ((cubic(middle, a, b) >= 0) === loPositive) lo = middle;
      else hi = middle;
    }
    return (lo + hi) / 2;
  };
  let previousX = xMin, previousValue = cubic(xMin, a, b);
  if (previousValue >= 0) append(previousX, previousValue);
  for (let i = 1; i < sampleCount; i += 1) {
    const x = xMin + (xMax - xMin) * i / (sampleCount - 1), value = cubic(x, a, b);
    if (previousValue < 0 && value >= 0) append(rootBetween(previousX, x, previousValue), 0);
    if (previousValue >= 0 && value < 0) {
      append(rootBetween(previousX, x, previousValue), 0); finish();
    }
    if (value >= 0) append(x, value);
    previousX = x; previousValue = value;
  }
  finish();
  const segments = positive.flatMap((upper) => [upper, upper.map(([x, y]) => [x, -y] as const)]);
  const yMax = Math.max(1, ...positive.flatMap((segment) => segment.map(([, y]) => y))) * 1.1;
  return { domain: "real", xMin, xMax, yMax, sampleCount, segments,
    completeness: "bounded-numerical-sample" };
};

/** Complete affine point list for diagrams up to p=31; infinity is recorded separately. */
export const enumerateFiniteEllipticCurve = (definition: EllipticCurveDefinition,
  characteristic: number): FiniteCurveDiagram => {
  ellipticCurveFacts(definition.a, definition.b, characteristic);
  if (characteristic > 31) throw new TypeError("Complete finite-field point diagrams are bounded to p ≤ 31.");
  const p = BigInt(characteristic), a = BigInt(definition.a), b = BigInt(definition.b);
  const points: [number, number][] = [];
  for (let x = 0; x < characteristic; x += 1)
    for (let y = 0; y < characteristic; y += 1)
      if (mod(BigInt(y) ** 2n - BigInt(x) ** 3n - a * BigInt(x) - b, p) === 0n)
        points.push([x, y]);
  return { domain: "finite-prime-field", characteristic, points, pointAtInfinity: true,
    groupOrder: points.length + 1, completeness: "complete-enumeration" };
};

/** Exact tangent metadata for a verified integer-coordinate rational point. */
export const realEllipticTangent = (definition: EllipticCurveDefinition,
  point: readonly [string, string]): Readonly<{ point: readonly [string, string];
  slope: string | null; thirdIntersection: readonly [string, string] | null;
  doublePoint: readonly [string, string] | null; rule: "tangent-and-reflection" | "vertical-to-infinity" }> => {
  const doublePoint = ellipticDouble(definition.a, definition.b, 0, point);
  if (!doublePoint) return { point, slope: null, thirdIntersection: null, doublePoint: null,
    rule: "vertical-to-infinity" };
  const x = BigInt(point[0]), y = BigInt(point[1]), a = BigInt(definition.a);
  const slope = rational(3n * x * x + a, 2n * y);
  const [thirdNumerator, thirdDenominator] = parseRational(doublePoint[1]);
  return { point, slope, thirdIntersection: [doublePoint[0], rational(-thirdNumerator, thirdDenominator)],
    doublePoint, rule: "tangent-and-reflection" };
};
