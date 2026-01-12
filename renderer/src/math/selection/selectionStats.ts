export type SelectionMetricKey = "K" | "H" | "k1" | "k2";

export type SelectionMetricStats = {
  mean: number;
  variance: number;
  std: number;
  min: number;
  max: number;
  count: number;
};

export type SelectionHistogram = {
  metric: SelectionMetricKey;
  bins: number[];
  min: number;
  max: number;
  binCount: number;
};

export type SelectionStats = {
  count: number;
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
    diag: number;
  };
  meanNormal: [number, number, number];
  metrics: Partial<Record<SelectionMetricKey, SelectionMetricStats>>;
  histogram?: SelectionHistogram;
};

export type SelectionStatsParams = {
  selectedIndices: number[];
  positions: Float32Array;
  normals: Float32Array;
  metrics?: Partial<Record<SelectionMetricKey, Float32Array | null | undefined>>;
  histogramMetric?: SelectionMetricKey;
  binCount?: number;
  normalizeMeanNormal?: boolean;
};

const EMPTY_MEAN_NORMAL: [number, number, number] = [0, 0, 0];

function makeEmptyBBox() {
  return {
    min: [0, 0, 0] as [number, number, number],
    max: [0, 0, 0] as [number, number, number],
    size: [0, 0, 0] as [number, number, number],
    diag: 0,
  };
}

function isFiniteNumber(v: number) {
  return Number.isFinite(v);
}

function computeMetricStats(values: Float32Array, selected: number[]): SelectionMetricStats | null {
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < selected.length; i++) {
    const idx = selected[i];
    if (idx < 0 || idx >= values.length) continue;
    const v = values[idx];
    if (!isFiniteNumber(v)) continue;
    count++;
    sum += v;
    sumSq += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (!count) return null;
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return {
    mean,
    variance,
    std: Math.sqrt(variance),
    min,
    max,
    count,
  };
}

function buildHistogram(opts: {
  metric: SelectionMetricKey;
  values: Float32Array;
  selected: number[];
  min: number;
  max: number;
  binCount: number;
}): SelectionHistogram | null {
  const { metric, values, selected, min, max, binCount } = opts;
  if (!Number.isFinite(min) || !Number.isFinite(max) || binCount <= 0) return null;
  const bins = new Array(binCount).fill(0);
  const range = max - min;

  if (!Number.isFinite(range)) return null;

  if (range === 0) {
    const mid = Math.floor(binCount / 2);
    let count = 0;
    for (let i = 0; i < selected.length; i++) {
      const idx = selected[i];
      if (idx < 0 || idx >= values.length) continue;
      const v = values[idx];
      if (!isFiniteNumber(v)) continue;
      count++;
    }
    bins[mid] = count;
    return { metric, bins, min, max, binCount };
  }

  const invRange = 1 / range;
  for (let i = 0; i < selected.length; i++) {
    const idx = selected[i];
    if (idx < 0 || idx >= values.length) continue;
    const v = values[idx];
    if (!isFiniteNumber(v)) continue;
    const t = (v - min) * invRange;
    const bin = Math.min(binCount - 1, Math.max(0, Math.floor(t * binCount)));
    bins[bin]++;
  }

  return { metric, bins, min, max, binCount };
}

export function computeSelectionStats(params: SelectionStatsParams): SelectionStats {
  const {
    selectedIndices,
    positions,
    normals,
    metrics,
    histogramMetric,
    binCount = 24,
    normalizeMeanNormal = true,
  } = params;

  if (!selectedIndices.length) {
    return {
      count: 0,
      bbox: makeEmptyBBox(),
      meanNormal: [...EMPTY_MEAN_NORMAL] as [number, number, number],
      metrics: {},
    };
  }

  const bboxMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const bboxMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let validCount = 0;
  let normCount = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (let i = 0; i < selectedIndices.length; i++) {
    const idx = selectedIndices[i];
    const base = idx * 3;
    if (base + 2 >= positions.length) continue;
    const x = positions[base];
    const y = positions[base + 1];
    const z = positions[base + 2];
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) continue;
    validCount++;
    if (x < bboxMin[0]) bboxMin[0] = x;
    if (y < bboxMin[1]) bboxMin[1] = y;
    if (z < bboxMin[2]) bboxMin[2] = z;
    if (x > bboxMax[0]) bboxMax[0] = x;
    if (y > bboxMax[1]) bboxMax[1] = y;
    if (z > bboxMax[2]) bboxMax[2] = z;

    if (base + 2 < normals.length) {
      const nX = normals[base];
      const nY = normals[base + 1];
      const nZ = normals[base + 2];
      if (isFiniteNumber(nX) && isFiniteNumber(nY) && isFiniteNumber(nZ)) {
        nx += nX;
        ny += nY;
        nz += nZ;
        normCount++;
      }
    }
  }

  if (!validCount) {
    return {
      count: 0,
      bbox: makeEmptyBBox(),
      meanNormal: [...EMPTY_MEAN_NORMAL] as [number, number, number],
      metrics: {},
    };
  }

  const size: [number, number, number] = [
    bboxMax[0] - bboxMin[0],
    bboxMax[1] - bboxMin[1],
    bboxMax[2] - bboxMin[2],
  ];
  const diag = Math.hypot(size[0], size[1], size[2]);

  let meanNormal: [number, number, number] = [0, 0, 0];
  if (normCount) {
    const inv = 1 / normCount;
    meanNormal = [nx * inv, ny * inv, nz * inv];
    if (normalizeMeanNormal) {
      const len = Math.hypot(meanNormal[0], meanNormal[1], meanNormal[2]);
      if (len > 1e-12) {
        meanNormal = [meanNormal[0] / len, meanNormal[1] / len, meanNormal[2] / len];
      }
    }
  }

  const metricStats: Partial<Record<SelectionMetricKey, SelectionMetricStats>> = {};
  if (metrics) {
    (["K", "H", "k1", "k2"] as const).forEach((key) => {
      const values = metrics[key];
      if (!values) return;
      const stats = computeMetricStats(values, selectedIndices);
      if (stats) metricStats[key] = stats;
    });
  }

  let histogram: SelectionHistogram | undefined;
  if (histogramMetric && metrics?.[histogramMetric]) {
    const stats = metricStats[histogramMetric];
    if (stats) {
      const h = buildHistogram({
        metric: histogramMetric,
        values: metrics[histogramMetric] as Float32Array,
        selected: selectedIndices,
        min: stats.min,
        max: stats.max,
        binCount,
      });
      if (h) histogram = h;
    }
  }

  return {
    count: validCount,
    bbox: {
      min: bboxMin,
      max: bboxMax,
      size,
      diag,
    },
    meanNormal,
    metrics: metricStats,
    histogram,
  };
}
