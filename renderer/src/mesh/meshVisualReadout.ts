import type { MeshAnalysisFocusedSection } from "./activeAnalysisResult";
import type { MeshResultEvidencePresentation } from "./meshResultPresentation";

export type MeshVisualReadout = Readonly<{
  canShowCurvature: boolean;
  canShowQuality: boolean;
  label: string;
  reason: string;
}>;

/** Apply the Inspector's result qualification to floating measurements and field overlays. */
export const presentMeshVisualReadout = (
  section: MeshAnalysisFocusedSection,
  evidence: MeshResultEvidencePresentation,
): MeshVisualReadout => {
  const isQuality = section === "mesh-quality";
  const isCurvature = section === "differential-geometry" || section === "chart-analysis";
  const allowed = evidence.status === "current" || evidence.status === "session-local";
  return {
    canShowCurvature: isCurvature && allowed,
    canShowQuality: isQuality && allowed,
    label: evidence.status === "current" ? "Current result" : evidence.status === "session-local" ? "Session-local values" : "Values withheld",
    reason: evidence.reason,
  };
};
