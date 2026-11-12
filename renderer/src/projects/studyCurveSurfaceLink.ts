import { upsertProjectStudy, type CurveDocument, type Math3DProject, type SurfaceDocument,
  type StudyRecordV1 } from "@math3d/core";
import { currentCurveSurfacePair } from "../curveAnalysis/curveSurfaceCursor";
import { resolveStudyPane } from "./studyPaneResolution";

export const STUDY_CURVE_SURFACE_MAPPING = "surface.chart-curve";
export type QualifiedStudyCurveSurface = Readonly<{ curvePaneId: string; surfacePaneId: string;
  curve: CurveDocument; surface: SurfaceDocument }>;

/** Only an exact saved relation between replayed Study members authorizes this chart link. */
export function qualifyStudyCurveSurfaceLink(project: Math3DProject, study: StudyRecordV1):
  QualifiedStudyCurveSurface | null {
  if (study.layout.panes.length !== 2) return null;
  const resolved = study.layout.panes.map(pane => ({ paneId: pane.paneId,
    value: resolveStudyPane(project, study, pane.paneId) }));
  const curve = resolved.find(item => item.value.status === "ready" &&
    item.value.document.format === "math3d.curve-document");
  const surface = resolved.find(item => item.value.status === "ready" &&
    item.value.document.format === "math3d.surface-document");
  if (!curve || !surface || curve.value.status !== "ready" || surface.value.status !== "ready") return null;
  const pair = currentCurveSurfacePair(project, curve.value.document.identity.id, surface.value.document.identity.id);
  return pair ? { curvePaneId: curve.paneId, surfacePaneId: surface.paneId,
    curve: pair.curve, surface: pair.surface } : null;
}

export function studyHasQualifiedCurveSurfaceLink(study: StudyRecordV1,
  pair: QualifiedStudyCurveSurface): boolean {
  return study.links.some(link => link.kind === "parameter" && link.mappingId === STUDY_CURVE_SURFACE_MAPPING &&
    link.sourcePaneId === pair.curvePaneId && link.targetPaneId === pair.surfacePaneId &&
    link.direction === "two-way");
}

export function addQualifiedStudyCurveSurfaceLink(project: Math3DProject, studyId: string): Math3DProject {
  const study = project.workspace.studies?.find(item => item.id === studyId);
  if (!study) throw new TypeError("Study is unavailable.");
  const pair = qualifyStudyCurveSurfaceLink(project, study);
  if (!pair) throw new TypeError("Study panes have no current Curve-on-Surface chart mapping.");
  if (studyHasQualifiedCurveSurfaceLink(study, pair)) return project;
  return upsertProjectStudy(project, { ...study, links: [...study.links, {
    id: `parameter-${pair.curvePaneId}-${pair.surfacePaneId}`, kind: "parameter",
    sourcePaneId: pair.curvePaneId, targetPaneId: pair.surfacePaneId,
    mappingId: STUDY_CURVE_SURFACE_MAPPING, direction: "two-way",
  }] });
}
