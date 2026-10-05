import { isScientificSourceGeneration, type CanonicalJsonValue, type ScientificSourceGeneration } from "@math3d/core";
import type { SurfaceStudyPresetId } from "./surfaceStudyPresets";
import type { SurfaceStudyResolution } from "./surfaceStudyResolution";
import type { studyInteriorStatistics } from "./savedStudyComparison";

export const SURFACE_STUDY_VARIANT_OPERATION = "surface.study-variant";
export type SurfaceStudyRun = {
  sweepId: string; presetId: SurfaceStudyPresetId; value: number; resolution: SurfaceStudyResolution;
  baseSource: ScientificSourceGeneration; resultId: string;
  interior: ReturnType<typeof studyInteriorStatistics>;
};
export const readSurfaceStudyRun = (parameters: CanonicalJsonValue): SurfaceStudyRun | undefined => {
  const run = (parameters as { studyRun?: SurfaceStudyRun } | null)?.studyRun;
  if (!run || !["helicoid", "catenoid"].includes(run.presetId) || !Number.isFinite(run.value) || run.value <= 0 || run.value > 100 || ![17, 33, 65].includes(run.resolution) ||
      typeof run.sweepId !== "string" || !run.sweepId || typeof run.resultId !== "string" || !run.resultId || !isScientificSourceGeneration(run.baseSource) || !run.interior || !Number.isSafeInteger(run.interior.count) || run.interior.count < 1 || !Number.isSafeInteger(run.interior.excluded) || run.interior.excluded < 0 || [run.interior.averageK, run.interior.averageH, run.interior.averageAbsH, run.interior.maxAbsH].some(value => value !== null && (typeof value !== "number" || !Number.isFinite(value)))) return undefined;
  return run;
};

