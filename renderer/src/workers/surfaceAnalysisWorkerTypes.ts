import type { SurfaceCurvatureFieldPayload } from "../surfaceAnalysis/contracts";
import type { SurfaceCurvatureFieldSource, SurfaceCurvatureOptions } from "../surfaceAnalysis/surfaceCurvature";

export type SurfaceAnalysisWorkerRequest = { type: "compute-curvature"; requestId: string; surfaceRevision: number; source: SurfaceCurvatureFieldSource; options: SurfaceCurvatureOptions };
export type SurfaceAnalysisWorkerMessage =
  | { type: "progress"; requestId: string; surfaceRevision: number; progress: number; phase: string }
  | { type: "curvature-result"; requestId: string; surfaceRevision: number; result: SurfaceCurvatureFieldPayload; computeTimeMs: number }
  | { type: "error"; requestId: string; surfaceRevision: number; error: string };
