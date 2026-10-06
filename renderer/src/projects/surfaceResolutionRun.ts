import type { CanonicalJsonValue } from "@math3d/core";
import type { studyInteriorStatistics } from "./savedStudyComparison";

export type SurfaceResolutionRun = { studyId: string; resultId: string; interior: ReturnType<typeof studyInteriorStatistics> };
export const readSurfaceResolutionRun = (parameters: CanonicalJsonValue): SurfaceResolutionRun | undefined => {
  const value = (parameters as { resolutionStudy?: SurfaceResolutionRun } | null)?.resolutionStudy;
  if (!value || typeof value.studyId !== "string" || !value.studyId || typeof value.resultId !== "string" || !value.resultId || !value.interior ||
      !Number.isSafeInteger(value.interior.count) || value.interior.count < 1 || !Number.isSafeInteger(value.interior.excluded) || value.interior.excluded < 0 ||
      [value.interior.averageK, value.interior.averageH, value.interior.averageAbsH, value.interior.maxAbsH].some(item => item !== null && (typeof item !== "number" || !Number.isFinite(item)))) return undefined;
  return value;
};
