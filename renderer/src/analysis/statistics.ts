import type { AnalysisHistogramBin } from "./contracts";

export type AnalysisScalarStatistics = {
  min: number;
  max: number;
  mean: number;
  std: number;
  count: number;
};

export type AnalysisScalarSummary = AnalysisScalarStatistics & {
  median: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  minIndex: number;
  maxIndex: number;
  histogram: AnalysisHistogramBin[];
};

export const summarizeAnalysisScalarField = (
  values: ArrayLike<number> | null | undefined,
  selected?: ArrayLike<number | boolean> | null,
  requestedBinCount = 12
): AnalysisScalarSummary | null => {
  if (!values?.length) return null;
  const useSelection = !!selected && selected.length === values.length;
  const samples: Array<{ value: number; index: number }> = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let minIndex = -1;
  let maxIndex = -1;
  let sum = 0;
  let sumSquares = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (useSelection && !selected[index]) continue;
    const value = Number(values[index]);
    if (!Number.isFinite(value)) continue;
    samples.push({ value, index });
    sum += value;
    sumSquares += value * value;
    if (value < min) { min = value; minIndex = index; }
    if (value > max) { max = value; maxIndex = index; }
  }
  if (!samples.length) return null;
  const count = samples.length;
  const mean = sum / count;
  const std = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
  const sorted = samples.map(({ value }) => value).sort((left, right) => left - right);
  const quantile = (fraction: number) => {
    const position = Math.max(0, Math.min(count - 1, fraction * (count - 1)));
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  const binCount = Number.isFinite(requestedBinCount)
    ? Math.max(1, Math.min(32, Math.round(requestedBinCount)))
    : 12;
  const span = max - min;
  const histogram = Array.from({ length: binCount }, (_, index) => ({
    min: span > 0 ? min + (span * index) / binCount : min,
    max: span > 0 ? min + (span * (index + 1)) / binCount : max,
    count: 0,
  }));
  for (const { value } of samples) {
    const binIndex = span > 0 ? Math.min(binCount - 1, Math.floor(((value - min) / span) * binCount)) : 0;
    histogram[binIndex].count += 1;
  }
  return {
    min,
    max,
    mean,
    median: quantile(0.5),
    p05: quantile(0.05),
    p25: quantile(0.25),
    p75: quantile(0.75),
    p95: quantile(0.95),
    std,
    count,
    minIndex,
    maxIndex,
    histogram,
  };
};
