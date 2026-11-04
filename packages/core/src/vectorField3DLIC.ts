import type { VectorField3DSliceArtifact } from "./vectorField3DSlices";

export type VectorField3DLIC = Readonly<{
  source: VectorField3DSliceArtifact["source"]; sourceHash: string | null;
  normalAxis: 0 | 1 | 2; fixedCoordinate: number;
  width: number; height: number; pixels: Float32Array; mask: Uint8Array;
  coveredPixels: number; stoppedAtBoundary: number; stoppedAtMissing: number;
  stationaryPixels: number; work: number; elapsedMs: number;
  state: "complete" | "time-budget" | "work-budget";
  method: "cpu-bilinear-lic-rk2"; noiseSeed: number;
  verifiedSamples: VectorField3DSliceArtifact["verifiedSamples"] | null;
}>;
export type VectorField3DLICOptions = Readonly<{ width: number; height: number;
  steps: number; noiseSeed: number; maxWork: number; timeBudgetMs: number }>;

/** Deterministic orthogonal-plane LIC with bounded work and no interpolation over gaps. */
export function computeVectorField3DLIC(slice: VectorField3DSliceArtifact,
  options: VectorField3DLICOptions, now: () => number = () => performance.now()): VectorField3DLIC {
  const { width, height, steps, noiseSeed, maxWork, timeBudgetMs } = options;
  if (![width, height, steps, maxWork, timeBudgetMs].every(Number.isSafeInteger) ||
      width < 8 || width > 192 || height < 8 || height > 192 ||
      steps < 1 || steps > 16 || !Number.isSafeInteger(noiseSeed) ||
      maxWork < 1 || maxWork > 1_500_000 || timeBudgetMs < 1 || timeBudgetMs > 5000)
    throw new RangeError("LIC resolution or work/time budget is out of range.");
  if (!slice.vectors || slice.vectors.length !== slice.shape[0] * slice.shape[1] ||
      !slice.planeUnits || slice.planeUnits[0] !== slice.planeUnits[1] ||
      slice.coordinates.some(axis => axis.length < 2 ||
        axis.some((value, index) => !Number.isFinite(value) ||
          index > 0 && value <= axis[index - 1]!)))
    throw new TypeError("LIC needs a verified orthogonal vector slice with matching physical axis units.");
  const started = now();
  const pixels = new Float32Array(width * height), mask = new Uint8Array(width * height);
  const axes = slice.planeAxes, coords = slice.coordinates;
  const x0 = coords[0][0]!, x1 = coords[0][coords[0].length - 1]!;
  const y0 = coords[1][0]!, y1 = coords[1][coords[1].length - 1]!;
  const cell = Math.min((x1 - x0) / (width - 1), (y1 - y0) / (height - 1));
  const noise = (x: number, y: number) => {
    let n = (Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b) ^ noiseSeed) >>> 0;
    n ^= n >>> 16; n = Math.imul(n, 0x7feb352d); n ^= n >>> 15;
    return (n >>> 0) / 0xffffffff;
  };
  const bracket = (axis: readonly number[], value: number): [number, number] | null => {
    if (value < axis[0]! || value > axis[axis.length - 1]!) return null;
    let lo = 0, hi = axis.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1;
      if (axis[mid]! <= value) lo = mid; else hi = mid; }
    return [lo, (value - axis[lo]!) / (axis[hi]! - axis[lo]!)];
  };
  const flow = (x: number, y: number): readonly [number, number] | null => {
    const bx = bracket(coords[0], x), by = bracket(coords[1], y);
    if (!bx || !by) return null;
    const vector = [0, 0];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const sample = slice.vectors![(bx[0] + i) * slice.shape[1] + by[0] + j];
      if (!sample || sample.some(value => !Number.isFinite(value))) return null;
      const weight = (i ? bx[1] : 1 - bx[1]) * (j ? by[1] : 1 - by[1]);
      vector[0] += sample[axes[0]]! * weight;
      vector[1] += sample[axes[1]]! * weight;
    }
    const length = Math.hypot(vector[0]!, vector[1]!);
    return length > 1e-12 ? [vector[0]! / length, vector[1]! / length] : [0, 0];
  };
  let coveredPixels = 0, stoppedAtBoundary = 0, stoppedAtMissing = 0;
  let stationaryPixels = 0, work = 0, state: VectorField3DLIC["state"] = "complete";
  outer: for (let px = 0; px < width; px++) for (let py = 0; py < height; py++) {
    if (now() - started > timeBudgetMs) { state = "time-budget"; break outer; }
    const index = py * width + px, x = x0 + px * (x1 - x0) / (width - 1),
      y = y0 + py * (y1 - y0) / (height - 1);
    const initial = flow(x, y);
    if (!initial) { stoppedAtMissing++; continue; }
    if (initial[0] === 0 && initial[1] === 0) { stationaryPixels++; continue; }
    let sum = noise(px, py), count = 1;
    for (const sign of [-1, 1]) {
      let sx = x, sy = y;
      for (let step = 0; step < steps; step++) {
        if (++work > maxWork) { state = "work-budget"; break outer; }
        const velocity = flow(sx, sy);
        if (!velocity) { stoppedAtMissing++; break; }
        if (velocity[0] === 0 && velocity[1] === 0) { stationaryPixels++; break; }
        const midX = sx + sign * velocity[0] * cell / 2;
        const midY = sy + sign * velocity[1] * cell / 2;
        const midpoint = flow(midX, midY);
        if (!midpoint) {
          if (midX < x0 || midX > x1 || midY < y0 || midY > y1)
            stoppedAtBoundary++;
          else stoppedAtMissing++;
          break;
        }
        sx += sign * midpoint[0] * cell; sy += sign * midpoint[1] * cell;
        if (sx < x0 || sx > x1 || sy < y0 || sy > y1) {
          stoppedAtBoundary++; break;
        }
        const nx = Math.min(width - 1, Math.max(0, Math.round((sx - x0) / (x1 - x0) * (width - 1))));
        const ny = Math.min(height - 1, Math.max(0, Math.round((sy - y0) / (y1 - y0) * (height - 1))));
        sum += noise(nx, ny); count++;
      }
    }
    pixels[index] = sum / count; mask[index] = 1; coveredPixels++;
  }
  return { source: slice.source, sourceHash: slice.sourceHash ?? null,
    normalAxis: slice.normalAxis, fixedCoordinate: slice.fixedCoordinate,
    width, height, pixels, mask, coveredPixels, stoppedAtBoundary, stoppedAtMissing,
    stationaryPixels, work, elapsedMs: Math.max(0, now() - started), state,
    method: "cpu-bilinear-lic-rk2", noiseSeed,
    verifiedSamples: slice.verifiedSamples ?? null };
}
