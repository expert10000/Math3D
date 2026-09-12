import type { SurfaceAnalysisDomain, SurfaceAnalysisMethod, SurfaceRepresentation, SurfaceResultKind } from "./contracts";

export type SurfaceAnalysisExecutionState = "queued" | "running" | "progressive" | "cached" | "ready" | "stale" | "failed" | "cancelled";
export type SurfaceAnalysisTaskKind = "derivatives" | "metric-forms" | "curvature" | "principal-directions" | "curvature-lines" | "features" | "implicit-projection" | "geodesics" | "chart-distortion" | "tessellation";

export const SURFACE_ANALYSIS_DEPENDENCIES: Readonly<Record<SurfaceAnalysisTaskKind, readonly SurfaceAnalysisTaskKind[]>> = {
  derivatives: [],
  "metric-forms": ["derivatives"],
  curvature: ["metric-forms"],
  "principal-directions": ["curvature"],
  "curvature-lines": ["principal-directions"],
  features: ["principal-directions"],
  "implicit-projection": ["derivatives"],
  geodesics: ["metric-forms"],
  "chart-distortion": ["metric-forms"],
  tessellation: [],
};

export type SurfaceAnalysisCacheKeyInput = {
  surfaceId: string;
  surfaceRevision: number;
  representation: SurfaceRepresentation;
  domain: SurfaceAnalysisDomain | string;
  samplingResolution: number | readonly number[] | Readonly<Record<string, number | string | boolean | null>>;
  analysisKind: SurfaceResultKind | SurfaceAnalysisTaskKind;
  parameters: Readonly<Record<string, unknown>>;
  method: SurfaceAnalysisMethod | string;
  dependencyRevisions: Readonly<Record<string, number | string>>;
};

const stable = (value: unknown): unknown => {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return value > 0 ? "+Infinity" : "-Infinity";
    if (Object.is(value, -0)) return "-0";
  }
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
  return value;
};

export const createSurfaceAnalysisCacheKey = (input: SurfaceAnalysisCacheKeyInput): string => JSON.stringify(stable(input));

export const surfaceTaskDependencies = (task: SurfaceAnalysisTaskKind): readonly SurfaceAnalysisTaskKind[] => SURFACE_ANALYSIS_DEPENDENCIES[task];

export const shouldWorkerizeSurfaceAnalysis = (task: SurfaceAnalysisTaskKind, sampleCount: number): boolean => {
  const heavy = task === "curvature" || task === "features" || task === "implicit-projection" || task === "geodesics" || task === "chart-distortion" || task === "tessellation";
  return heavy && sampleCount >= 10_000;
};

export const SURFACE_ANALYSIS_PERFORMANCE_BUDGETS_MS = {
  interaction: 16,
  pointProbe: 50,
  samples10k: 500,
  samples100k: 4_000,
  overlayPublication: 100,
  cancellation: 100,
  moduleSwitch: 250,
  derivedMeshRegeneration: 2_000,
} as const;

export type SurfacePerformanceMeasurement = { scenario: keyof typeof SURFACE_ANALYSIS_PERFORMANCE_BUDGETS_MS; durationMs: number; sampleCount?: number; memoryBytes?: number | null };
export const createSurfacePerformanceReport = (measurements: readonly SurfacePerformanceMeasurement[]) => ({
  version: 1 as const,
  generatedAt: Date.now(),
  measurements: measurements.map((measurement) => ({ ...measurement, budgetMs: SURFACE_ANALYSIS_PERFORMANCE_BUDGETS_MS[measurement.scenario], withinBudget: measurement.durationMs <= SURFACE_ANALYSIS_PERFORMANCE_BUDGETS_MS[measurement.scenario] })),
});

export type SurfaceScheduledJob<T> = {
  requestId: string;
  surfaceRevision: number;
  cacheKey: string;
  state: SurfaceAnalysisExecutionState;
  progress: number | null;
  value: T | null;
  error: string | null;
};

/** Small revision-safe scheduler used by Surface workers and testable without browser Worker globals. */
export class SurfaceAnalysisScheduler<T> {
  private readonly cache = new Map<string, T>();
  private active: { requestId: string; surfaceRevision: number; controller: AbortController } | null = null;

  getCached(cacheKey: string): T | null { return this.cache.get(cacheKey) ?? null; }
  cancel(): void { this.active?.controller.abort(); this.active = null; }

  async run(args: {
    requestId: string;
    surfaceRevision: number;
    cacheKey: string;
    compute: (signal: AbortSignal, publishProgress: (progress: number) => void) => Promise<T> | T;
    publish: (job: SurfaceScheduledJob<T>) => void;
  }): Promise<SurfaceScheduledJob<T>> {
    const cached = this.cache.get(args.cacheKey);
    if (cached !== undefined) {
      const job = { requestId: args.requestId, surfaceRevision: args.surfaceRevision, cacheKey: args.cacheKey, state: "cached" as const, progress: 1, value: cached, error: null };
      args.publish(job); return job;
    }
    this.cancel();
    const controller = new AbortController();
    this.active = { requestId: args.requestId, surfaceRevision: args.surfaceRevision, controller };
    const emit = (state: SurfaceAnalysisExecutionState, progress: number | null, value: T | null, error: string | null) => args.publish({ requestId: args.requestId, surfaceRevision: args.surfaceRevision, cacheKey: args.cacheKey, state, progress, value, error });
    emit("queued", 0, null, null); emit("running", 0, null, null);
    try {
      const value = await args.compute(controller.signal, (progress) => {
        if (this.active?.requestId === args.requestId && this.active.surfaceRevision === args.surfaceRevision && !controller.signal.aborted) emit("progressive", Math.max(0, Math.min(1, progress)), null, null);
      });
      if (controller.signal.aborted) { const job = { requestId: args.requestId, surfaceRevision: args.surfaceRevision, cacheKey: args.cacheKey, state: "cancelled" as const, progress: null, value: null, error: "Cancelled." }; args.publish(job); return job; }
      if (this.active?.requestId !== args.requestId || this.active.surfaceRevision !== args.surfaceRevision) { const job = { requestId: args.requestId, surfaceRevision: args.surfaceRevision, cacheKey: args.cacheKey, state: "stale" as const, progress: null, value: null, error: "A newer Surface request superseded this result." }; args.publish(job); return job; }
      this.cache.set(args.cacheKey, value); this.active = null;
      const job = { requestId: args.requestId, surfaceRevision: args.surfaceRevision, cacheKey: args.cacheKey, state: "ready" as const, progress: 1, value, error: null }; args.publish(job); return job;
    } catch (error) {
      const cancelled = controller.signal.aborted;
      if (this.active?.requestId === args.requestId) this.active = null;
      const job = { requestId: args.requestId, surfaceRevision: args.surfaceRevision, cacheKey: args.cacheKey, state: cancelled ? "cancelled" as const : "failed" as const, progress: null, value: null, error: cancelled ? "Cancelled." : error instanceof Error ? error.message : String(error) };
      args.publish(job); return job;
    }
  }
}
