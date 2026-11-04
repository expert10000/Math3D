import { verifyGraph2DScientificPlane, type Graph2DScientificPlane } from "./graph2dScientificDataset";

export type ComplexPlaneContour = Readonly<{ left: number; right: number; top: number; bottom: number }>;
export type ComplexPlaneAnalysis = Readonly<{
  source: Readonly<{ fingerprint: string; datasetId: string; realResourceSha256: string;
    imaginaryResourceSha256: string; realPlaneSha256: string; imaginaryPlaneSha256: string }>;
  shape: readonly [number, number];
  density: readonly (number | null)[];
  rgba: readonly number[];
  definedCount: number; undefinedCount: number;
  contour: ComplexPlaneContour;
  winding: Readonly<{ status: "resolved" | "inconclusive" | "undefined";
    integer: number | null; fineTurns: number | null; coarseTurns: number | null;
    reason: string | null; fineSamples: number; coarseSamples: number }>;
}>;

const sample = (real: Graph2DScientificPlane, imaginary: Graph2DScientificPlane,
  x: number, y: number) => {
  const index = y * real.shape[1] + x;
  return [real.values[index]!, imaginary.values[index]!] as const;
};
const hueRgb = (hue: number): readonly [number, number, number] => {
  const f = (n: number) => {
    const k = (n + hue * 6) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
};
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Analyze a verified real/imaginary slice; sampled fields make no holomorphic claim. */
export function analyzeScientificComplexPlane(manifestJson: string, fingerprint: string,
  realInput: Graph2DScientificPlane, imaginaryInput: Graph2DScientificPlane,
  contour: ComplexPlaneContour): ComplexPlaneAnalysis {
  const real = verifyGraph2DScientificPlane(manifestJson, fingerprint, realInput);
  const imaginary = verifyGraph2DScientificPlane(manifestJson, fingerprint, imaginaryInput);
  if (real.component !== "real" || imaginary.component !== "imaginary" ||
      real.datasetId !== imaginary.datasetId || real.normalAxis !== imaginary.normalAxis ||
      real.fixedIndex !== imaginary.fixedIndex || real.shape[0] !== imaginary.shape[0] ||
      real.shape[1] !== imaginary.shape[1] || real.planeAxes.some((axis, i) =>
        axis !== imaginary.planeAxes[i]))
    throw new TypeError("Real and imaginary planes must share the verified dataset and grid.");
  const [height, width] = real.shape;
  if (width * height > 65536 || width < 5 || height < 5)
    throw new RangeError("Complex plane analysis requires a 5×5 to 65536-point grid.");
  if (![contour.left, contour.right, contour.top, contour.bottom].every(Number.isSafeInteger) ||
      contour.left < 0 || contour.top < 0 || contour.right >= width ||
      contour.bottom >= height || contour.right - contour.left < 4 ||
      contour.bottom - contour.top < 4)
    throw new RangeError("Contour needs at least four grid intervals on each side inside the plane.");
  const magnitudes = real.values.map((value, index) => Math.hypot(value, imaginary.values[index]!));
  const positive = magnitudes.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const scale = positive[Math.floor(positive.length / 2)] ?? 1;
  const density: (number | null)[] = [], rgba: number[] = [];
  let definedCount = 0;
  for (let index = 0; index < real.values.length; index++) {
    const magnitude = magnitudes[index]!;
    const squared = magnitude * magnitude;
    if (!Number.isFinite(magnitude) || magnitude === 0 || !Number.isFinite(squared)) {
      density.push(null); rgba.push(0, 0, 0, 0); continue;
    }
    density.push(squared);
    const hue = (Math.atan2(imaginary.values[index]!, real.values[index]!) + Math.PI) / (2 * Math.PI);
    const brightness = .25 + .75 * magnitude / (magnitude + scale);
    const rgb = hueRgb(hue);
    rgba.push(...rgb.map(channel => Math.round(channel * brightness)), 255);
    definedCount++;
  }
  const perimeter = (step: number) => {
    const coordinates: [number, number][] = [];
    const append = (start: number, end: number) => {
      const values = [start];
      for (let v = start + step; v < end; v += step) values.push(v);
      values.push(end);
      return values;
    };
    for (const x of append(contour.left, contour.right)) coordinates.push([x, contour.top]);
    for (const y of append(contour.top, contour.bottom).slice(1)) coordinates.push([contour.right, y]);
    for (const x of append(contour.left, contour.right).reverse().slice(1))
      coordinates.push([x, contour.bottom]);
    for (const y of append(contour.top, contour.bottom).reverse().slice(1, -1))
      coordinates.push([contour.left, y]);
    return coordinates;
  };
  const turns = (coordinates: readonly (readonly [number, number])[]) => {
    let total = 0;
    for (let index = 0; index < coordinates.length; index++) {
      const [x, y] = coordinates[index]!, [nextX, nextY] = coordinates[(index + 1) % coordinates.length]!;
      const first = sample(real, imaginary, x, y), next = sample(real, imaginary, nextX, nextY);
      if (Math.hypot(...first) <= 1e-14 || Math.hypot(...next) <= 1e-14)
        return null;
      const delta = wrap(Math.atan2(next[1], next[0]) - Math.atan2(first[1], first[0]));
      if (Math.abs(delta) > .9 * Math.PI) return null;
      total += delta;
    }
    return total / (2 * Math.PI);
  };
  const fine = perimeter(1), coarse = perimeter(2);
  const fineTurns = turns(fine), coarseTurns = turns(coarse);
  const integer = fineTurns === null ? null : Math.round(fineTurns);
  const converged = integer !== null && coarseTurns !== null &&
    Math.abs(fineTurns! - integer) <= .05 && Math.abs(coarseTurns - integer) <= .05 &&
    Math.abs(fineTurns! - coarseTurns) <= .05;
  return { source: { fingerprint, datasetId: real.datasetId,
      realResourceSha256: real.resourceSha256, imaginaryResourceSha256: imaginary.resourceSha256,
      realPlaneSha256: real.planeSha256, imaginaryPlaneSha256: imaginary.planeSha256 },
    shape: [width, height], density, rgba, definedCount,
    undefinedCount: real.values.length - definedCount, contour,
    winding: { status: fineTurns === null || coarseTurns === null ? "undefined" :
        converged ? "resolved" : "inconclusive",
      integer: converged ? integer : null, fineTurns, coarseTurns,
      reason: fineTurns === null || coarseTurns === null ? "undefined-or-undersampled-contour" :
        converged ? null : "contour-resolution-disagrees", fineSamples: fine.length,
      coarseSamples: coarse.length } };
}
