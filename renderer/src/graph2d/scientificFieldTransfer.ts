export type { ScientificFieldTransfer } from "@math3d/core";
import type { ScientificFieldTransfer } from "@math3d/core";

export const DEFAULT_SCIENTIFIC_FIELD_TRANSFER: ScientificFieldTransfer = { mode: "data" };

export type ScientificFieldRange = Readonly<{
  min: number; max: number; dataMin: number; dataMax: number;
  below: number; above: number; constant: boolean;
}>;

/** Computes display bounds only; the checked sample array is never modified. */
export function scientificFieldRange(values: readonly number[], transfer: ScientificFieldTransfer): ScientificFieldRange {
  if (!values.length || values.some(value => !Number.isFinite(value)))
    throw new TypeError("A verified finite field is required for display.");
  const sorted = [...values].sort((a, b) => a - b);
  const dataMin = sorted[0]!, dataMax = sorted[sorted.length - 1]!;
  let min = dataMin, max = dataMax;
  if (transfer.mode === "percentile") {
    // Nearest ranks keep a single extreme outlier from stretching a large field's colors.
    min = sorted[Math.floor((sorted.length - 1) * 0.02)]!;
    max = sorted[Math.ceil((sorted.length - 1) * 0.98)]!;
  } else if (transfer.mode === "manual") {
    if (!Number.isFinite(transfer.min) || !Number.isFinite(transfer.max) || transfer.min >= transfer.max)
      throw new RangeError("The color maximum must be greater than the color minimum.");
    min = transfer.min; max = transfer.max;
  }
  return { min, max, dataMin, dataMax, below: values.filter(value => value < min).length,
    above: values.filter(value => value > max).length, constant: dataMin === dataMax };
}

export function scientificFieldColor(value: number, range: ScientificFieldRange): readonly [number, number, number] {
  const t = range.max === range.min ? value < range.min ? 0 : value > range.max ? 1 : 0.5 :
    Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return [Math.round(30 + 220 * t), Math.round(80 + 135 * (1 - Math.abs(2 * t - 1))),
    Math.round(235 - 205 * t)];
}
