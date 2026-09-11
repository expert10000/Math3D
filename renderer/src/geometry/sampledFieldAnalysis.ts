import { evaluateExactSurfacePoint, getGeometryExactSurfacePreset, type ExactSurfaceVec3, type GeometryExactSurfacePresetId } from "./exactSurfaceAnalysis";
import { evaluateExactCurveFrame, getGeometryExactCurvePreset, type GeometryExactCurvePresetId } from "./exactCurveAnalysis";

export type GeometrySampledFieldStage = "pointwise" | "coarse" | "refined" | "full";
export type GeometrySharedOverlayKind = "scalar-heatmap" | "vector-field" | "points" | "polylines" | "contours" | "glyphs" | "frames" | "labels" | "diagnostics";
export type GeometryOverlaySettings = { visible: boolean; opacity: number; density: number; scale: number; legend: boolean; range: readonly [number, number] | null; clamp: boolean; sourceResultId: string; sourceObjectId: string };
export type GeometrySampledOverlay = { id: string; kind: GeometrySharedOverlayKind; settings: GeometryOverlaySettings; sampleCount: number; scalarValues?: number[]; points?: ExactSurfaceVec3[]; vectors?: Array<{ origin: ExactSurfaceVec3; vector: ExactSurfaceVec3 }>; labels?: Array<{ point: ExactSurfaceVec3; text: string }> };
export type GeometrySamplingBudgets = { maxSamples: number; maxGlyphs: number; maxLabels: number; maxPolylines: number; maxUploadBytes: number; targetFrameMs: number };
export const DEFAULT_GEOMETRY_SAMPLING_BUDGETS: GeometrySamplingBudgets = { maxSamples: 100_000, maxGlyphs: 2_000, maxLabels: 300, maxPolylines: 1_000, maxUploadBytes: 16 * 1024 * 1024, targetFrameMs: 8 };
export type GeometrySampledFieldRequest = { requestId: string; sourceObjectId: string; sourceRevision: number; targetKind?: "surface" | "curve"; surfaceId?: GeometryExactSurfacePresetId; curveId?: GeometryExactCurvePresetId; requestedSamples: number; quantity: "K" | "H" | "k1" | "k2" | "jacobian" | "speed" | "curvature" | "torsion"; density: number; budgets?: Partial<GeometrySamplingBudgets> };
export type GeometrySampledFieldProgress = { requestId: string; sourceObjectId: string; sourceRevision: number; stage: GeometrySampledFieldStage; progress: number; status: "preview" | "complete" | "cancelled" | "stale" | "superseded" | "failed"; sampleCount: number; durationMs: number; overlays: GeometrySampledOverlay[]; warnings: string[]; budgets: GeometrySamplingBudgets };

const stageCounts = (requested: number, budget: number): Array<[GeometrySampledFieldStage, number]> => {
  const full = Math.max(1, Math.min(Math.floor(requested), budget));
  return [["pointwise", 1], ["coarse", Math.min(full, 1024)], ["refined", Math.min(full, 10_000)], ["full", full]];
};
const sampleValue = (quantity: GeometrySampledFieldRequest["quantity"], point: ReturnType<typeof evaluateExactSurfacePoint>): number => quantity === "K" ? point.gaussianCurvature ?? Number.NaN : quantity === "H" ? point.meanCurvature ?? Number.NaN : quantity === "k1" ? point.principalCurvatures.k1 ?? Number.NaN : quantity === "k2" ? point.principalCurvatures.k2 ?? Number.NaN : point.jacobian;

export const runGeometrySampledFieldRequest = async (args: { request: GeometrySampledFieldRequest; publish: (progress: GeometrySampledFieldProgress) => void; isCancelled?: () => boolean; yieldControl?: () => Promise<void>; now?: () => number }): Promise<GeometrySampledFieldProgress> => {
  const request = args.request;
  const budgets: GeometrySamplingBudgets = { ...DEFAULT_GEOMETRY_SAMPLING_BUDGETS, ...request.budgets };
  const targetKind = request.targetKind ?? "surface";
  const definition = getGeometryExactSurfacePreset(request.surfaceId ?? "sphere");
  const curveDefinition = getGeometryExactCurvePreset(request.curveId ?? "circle");
  const started = (args.now ?? performance.now.bind(performance))();
  let latest: GeometrySampledFieldProgress | null = null;
  const stages = stageCounts(request.requestedSamples, budgets.maxSamples);
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    const [stage, count] = stages[stageIndex];
    const width = targetKind === "curve" ? count : Math.max(1, Math.ceil(Math.sqrt(count)));
    const points: ExactSurfaceVec3[] = [];
    const scalarValues: number[] = [];
    const vectors: Array<{ origin: ExactSurfaceVec3; vector: ExactSurfaceVec3 }> = [];
    const glyphStride = Math.max(1, Math.ceil(count / Math.max(1, budgets.maxGlyphs * Math.max(0.01, request.density))));
    for (let index = 0; index < count; index += 1) {
      if (args.isCancelled?.()) {
        const cancelled: GeometrySampledFieldProgress = { requestId: request.requestId, sourceObjectId: request.sourceObjectId, sourceRevision: request.sourceRevision, stage, progress: stageIndex / stages.length, status: "cancelled", sampleCount: index, durationMs: (args.now ?? performance.now.bind(performance))() - started, overlays: [], warnings: ["Sampling cancelled before publication."], budgets };
        args.publish(cancelled);
        return cancelled;
      }
      if (targetKind === "curve") {
        const t = curveDefinition.domain.min + (count === 1 ? 0.5 : index / (count - 1)) * (curveDefinition.domain.max - curveDefinition.domain.min);
        const evaluated = evaluateExactCurveFrame(curveDefinition, t, 1e-9);
        points.push(evaluated.position);
        scalarValues.push(request.quantity === "speed" ? evaluated.speed : request.quantity === "torsion" ? evaluated.torsion ?? Number.NaN : evaluated.curvature ?? Number.NaN);
        if (evaluated.tangent && index % glyphStride === 0 && vectors.length < budgets.maxGlyphs) vectors.push({ origin: evaluated.position, vector: evaluated.tangent });
      } else {
        const x = index % width;
        const y = Math.floor(index / width);
        const u = definition.domain.u.min + (width === 1 ? 0.5 : x / (width - 1)) * (definition.domain.u.max - definition.domain.u.min);
        const rows = Math.max(1, Math.ceil(count / width));
        const v = definition.domain.v.min + (rows === 1 ? 0.5 : y / (rows - 1)) * (definition.domain.v.max - definition.domain.v.min);
        const evaluated = evaluateExactSurfacePoint({ definition, u, v, tolerance: 1e-9 });
        points.push(evaluated.position);
        scalarValues.push(sampleValue(request.quantity as "K" | "H" | "k1" | "k2" | "jacobian", evaluated));
        if (evaluated.normal && index % glyphStride === 0 && vectors.length < budgets.maxGlyphs) vectors.push({ origin: evaluated.position, vector: evaluated.normal });
      }
      if (index > 0 && index % 2048 === 0) await (args.yieldControl?.() ?? Promise.resolve());
    }
    const finite = scalarValues.filter(Number.isFinite);
    const range: readonly [number, number] | null = finite.length ? [Math.min(...finite), Math.max(...finite)] : null;
    const settings: GeometryOverlaySettings = { visible: true, opacity: 0.85, density: Math.min(1, Math.max(0.01, request.density)), scale: 1, legend: true, range, clamp: true, sourceResultId: request.requestId, sourceObjectId: request.sourceObjectId };
    const diagnosticSettings = { ...settings, opacity: 1, legend: false };
    const overlays: GeometrySampledOverlay[] = [
      { id: `${request.requestId}:scalar`, kind: "scalar-heatmap", settings, sampleCount: count, scalarValues },
      { id: `${request.requestId}:vectors`, kind: "vector-field", settings: { ...settings, legend: false }, sampleCount: vectors.length, vectors },
      { id: `${request.requestId}:points`, kind: "points", settings: { ...settings, legend: false }, sampleCount: Math.min(points.length, budgets.maxSamples), points },
      { id: `${request.requestId}:polylines`, kind: "polylines", settings: { ...settings, legend: false }, sampleCount: Math.min(width, budgets.maxPolylines) },
      { id: `${request.requestId}:contours`, kind: "contours", settings, sampleCount: Math.min(24, budgets.maxPolylines) },
      { id: `${request.requestId}:glyphs`, kind: "glyphs", settings: { ...settings, legend: false }, sampleCount: vectors.length, vectors },
      { id: `${request.requestId}:frames`, kind: "frames", settings: { ...settings, legend: false }, sampleCount: Math.min(vectors.length, 64), vectors: vectors.slice(0, 64) },
      { id: `${request.requestId}:labels`, kind: "labels", settings: diagnosticSettings, sampleCount: Math.min(budgets.maxLabels, 4), labels: range ? [{ point: points[0], text: `min ${range[0]}` }, { point: points[points.length - 1], text: `max ${range[1]}` }] : [] },
      { id: `${request.requestId}:diagnostics`, kind: "diagnostics", settings: diagnosticSettings, sampleCount: 0 },
    ];
    const estimatedBytes = points.length * 3 * 8 + scalarValues.length * 8 + vectors.length * 6 * 8;
    const warnings = [request.requestedSamples > budgets.maxSamples ? `Requested samples clamped to ${budgets.maxSamples}.` : "", estimatedBytes > budgets.maxUploadBytes ? `Overlay payload exceeds the ${budgets.maxUploadBytes}-byte upload budget; rendering should stream layers.` : ""].filter(Boolean);
    latest = { requestId: request.requestId, sourceObjectId: request.sourceObjectId, sourceRevision: request.sourceRevision, stage, progress: (stageIndex + 1) / stages.length, status: stage === "full" || stageIndex === stages.length - 1 ? "complete" : "preview", sampleCount: count, durationMs: (args.now ?? performance.now.bind(performance))() - started, overlays, warnings, budgets };
    args.publish(latest);
    await (args.yieldControl?.() ?? Promise.resolve());
  }
  return latest!;
};

export const validateGeometryWorkerPublication = (active: { requestId: string; sourceRevision: number } | null, progress: GeometrySampledFieldProgress): "accept" | "superseded" | "stale" => !active || active.requestId !== progress.requestId ? "superseded" : active.sourceRevision !== progress.sourceRevision ? "stale" : "accept";
