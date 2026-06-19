type MetricMap = Record<string, number>;

export type MemoryDiagnosticsSnapshot = {
  startedAt: number;
  sampledAt: number;
  counters: MetricMap;
  gauges: MetricMap;
  heap: {
    usedBytes: number | null;
    totalBytes: number | null;
    limitBytes: number | null;
  };
};

export type MemoryDiagnosticsDelta = {
  elapsedMs: number;
  heapUsedBytes: number | null;
  counters: MetricMap;
  gauges: MetricMap;
};

export type MemoryDiagnosticsThresholds = {
  maxHeapGrowthBytes?: number;
  maxActiveContextGrowth?: number;
  maxContextImbalance?: number;
  maxHistoryMeshGrowthBytes?: number;
};

export type MemoryDiagnosticsReport = {
  passed: boolean;
  baseline: string;
  thresholds: MemoryDiagnosticsThresholds;
  delta: MemoryDiagnosticsDelta;
  violations: string[];
};

type DiagnosticsApi = {
  snapshot: () => MemoryDiagnosticsSnapshot;
  resetCounters: () => void;
  sampleNow: () => MemoryDiagnosticsSnapshot;
  mark: (name?: string) => MemoryDiagnosticsSnapshot;
  delta: (name?: string) => MemoryDiagnosticsDelta | null;
  report: (
    name?: string,
    thresholds?: MemoryDiagnosticsThresholds
  ) => MemoryDiagnosticsReport | null;
  exportJson: (name?: string, thresholds?: MemoryDiagnosticsThresholds) => string;
};

declare global {
  interface Window {
    __math3dMemoryDiagnostics?: DiagnosticsApi;
  }
}

const startedAt = Date.now();
const counters: MetricMap = {};
const gauges: MetricMap = {};
let sampledAt = startedAt;
let installed = false;
const marks = new Map<string, MemoryDiagnosticsSnapshot>();

const heapSnapshot = () => {
  const memory = (performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
  }).memory;
  return {
    usedBytes: Number.isFinite(memory?.usedJSHeapSize) ? Number(memory?.usedJSHeapSize) : null,
    totalBytes: Number.isFinite(memory?.totalJSHeapSize) ? Number(memory?.totalJSHeapSize) : null,
    limitBytes: Number.isFinite(memory?.jsHeapSizeLimit) ? Number(memory?.jsHeapSizeLimit) : null,
  };
};

export const bumpMemoryCounter = (name: string, delta = 1) => {
  counters[name] = (counters[name] ?? 0) + delta;
};

export const setMemoryGauge = (name: string, value: number) => {
  gauges[name] = Number.isFinite(value) ? value : 0;
};

export const addMemoryGauge = (name: string, delta: number) => {
  setMemoryGauge(name, (gauges[name] ?? 0) + delta);
};

export const getMemoryDiagnosticsSnapshot = (): MemoryDiagnosticsSnapshot => {
  sampledAt = Date.now();
  return {
    startedAt,
    sampledAt,
    counters: { ...counters },
    gauges: { ...gauges },
    heap: heapSnapshot(),
  };
};

export const installMemoryDiagnostics = () => {
  if (installed || typeof window === "undefined") return;
  if (window.__math3dMemoryDiagnostics) {
    installed = true;
    return;
  }
  installed = true;
  const mark = (name = "default") => {
    const snapshot = getMemoryDiagnosticsSnapshot();
    marks.set(name, snapshot);
    return snapshot;
  };
  const delta = (name = "default"): MemoryDiagnosticsDelta | null => {
    const baseline = marks.get(name);
    if (!baseline) return null;
    const current = getMemoryDiagnosticsSnapshot();
    const counterDelta: MetricMap = {};
    const gaugeDelta: MetricMap = {};
    for (const key of new Set([...Object.keys(baseline.counters), ...Object.keys(current.counters)])) {
      counterDelta[key] = (current.counters[key] ?? 0) - (baseline.counters[key] ?? 0);
    }
    for (const key of new Set([...Object.keys(baseline.gauges), ...Object.keys(current.gauges)])) {
      gaugeDelta[key] = (current.gauges[key] ?? 0) - (baseline.gauges[key] ?? 0);
    }
    return {
      elapsedMs: current.sampledAt - baseline.sampledAt,
      heapUsedBytes:
        baseline.heap.usedBytes == null || current.heap.usedBytes == null
          ? null
          : current.heap.usedBytes - baseline.heap.usedBytes,
      counters: counterDelta,
      gauges: gaugeDelta,
    };
  };
  const report = (
    name = "default",
    thresholds: MemoryDiagnosticsThresholds = {}
  ): MemoryDiagnosticsReport | null => {
    const measured = delta(name);
    if (!measured) return null;
    const violations: string[] = [];
    const heapGrowth = measured.heapUsedBytes;
    if (
      thresholds.maxHeapGrowthBytes != null &&
      heapGrowth != null &&
      heapGrowth > thresholds.maxHeapGrowthBytes
    ) {
      violations.push(
        `heap growth ${heapGrowth} exceeds ${thresholds.maxHeapGrowthBytes} bytes`
      );
    }
    const activeContextGrowth = measured.gauges["webgl.contextsActive"] ?? 0;
    if (
      thresholds.maxActiveContextGrowth != null &&
      activeContextGrowth > thresholds.maxActiveContextGrowth
    ) {
      violations.push(
        `active WebGL context growth ${activeContextGrowth} exceeds ${thresholds.maxActiveContextGrowth}`
      );
    }
    const contextImbalance =
      (measured.counters["webgl.contextsCreated"] ?? 0) -
      (measured.counters["webgl.contextsDisposed"] ?? 0);
    if (
      thresholds.maxContextImbalance != null &&
      contextImbalance > thresholds.maxContextImbalance
    ) {
      violations.push(
        `WebGL context create/dispose imbalance ${contextImbalance} exceeds ${thresholds.maxContextImbalance}`
      );
    }
    const historyGrowth = measured.gauges["history.meshBytesRetained"] ?? 0;
    if (
      thresholds.maxHistoryMeshGrowthBytes != null &&
      historyGrowth > thresholds.maxHistoryMeshGrowthBytes
    ) {
      violations.push(
        `history mesh growth ${historyGrowth} exceeds ${thresholds.maxHistoryMeshGrowthBytes} bytes`
      );
    }
    return {
      passed: violations.length === 0,
      baseline: name,
      thresholds: { ...thresholds },
      delta: measured,
      violations,
    };
  };
  const api: DiagnosticsApi = {
    snapshot: getMemoryDiagnosticsSnapshot,
    sampleNow: getMemoryDiagnosticsSnapshot,
    mark,
    delta,
    report,
    exportJson: (name = "default", thresholds = {}) =>
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          snapshot: getMemoryDiagnosticsSnapshot(),
          report: report(name, thresholds),
        },
        null,
        2
      ),
    resetCounters: () => {
      for (const key of Object.keys(counters)) delete counters[key];
      marks.clear();
    },
  };
  window.__math3dMemoryDiagnostics = api;
  getMemoryDiagnosticsSnapshot();
  window.setInterval(getMemoryDiagnosticsSnapshot, 5000);
};
