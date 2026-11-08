import { upsertProjectStudy, type CurveDocument, type Math3DProject, type StudyRecordV1 } from "@math3d/core";
import { currentGraphCurvePair } from "../graph2d/graphCurveCursor";
import { resolveStudyPane } from "./studyPaneResolution";

export const STUDY_GRAPH_CURVE_MAPPING = "graph2d.promote-curve";
export type QualifiedStudyGraphCurve = Readonly<{ graphPaneId: string; curvePaneId: string;
  graphId: string; curve: CurveDocument; objectId: string }>;

/** This first Study mapping is available only for an exact, current Graph promotion. */
export function qualifyStudyGraphCurveLink(project: Math3DProject, study: StudyRecordV1): QualifiedStudyGraphCurve | null {
  if (study.layout.panes.length !== 2) return null;
  const resolved = study.layout.panes.map(pane => ({ paneId: pane.paneId,
    value: resolveStudyPane(project, study, pane.paneId) }));
  const graph = resolved.find(item => item.value.status === "ready" &&
    item.value.document.format === "math3d.graph2d-document");
  const curve = resolved.find(item => item.value.status === "ready" &&
    item.value.document.format === "math3d.curve-document");
  if (!graph || !curve || graph.value.status !== "ready" || curve.value.status !== "ready") return null;
  const pair = currentGraphCurvePair(project, graph.value.document.identity.id, curve.value.document.identity.id);
  return pair ? { graphPaneId: graph.paneId, curvePaneId: curve.paneId,
    graphId: pair.graph.identity.id, curve: pair.curve, objectId: pair.object.id } : null;
}

export function studyHasQualifiedGraphCurveLink(study: StudyRecordV1, pair: QualifiedStudyGraphCurve): boolean {
  return study.links.some(link => link.kind === "parameter" && link.mappingId === STUDY_GRAPH_CURVE_MAPPING &&
    link.sourcePaneId === pair.curvePaneId && link.targetPaneId === pair.graphPaneId && link.direction === "two-way");
}

export function addQualifiedStudyGraphCurveLink(project: Math3DProject, studyId: string): Math3DProject {
  const study = project.workspace.studies?.find(item => item.id === studyId);
  if (!study) throw new TypeError("Study is unavailable.");
  const pair = qualifyStudyGraphCurveLink(project, study);
  if (!pair) throw new TypeError("Study panes have no current Graph-to-Curve promotion mapping.");
  if (studyHasQualifiedGraphCurveLink(study, pair)) return project;
  return upsertProjectStudy(project, { ...study, links: [...study.links, {
    id: `parameter-${pair.curvePaneId}-${pair.graphPaneId}`, kind: "parameter",
    sourcePaneId: pair.curvePaneId, targetPaneId: pair.graphPaneId,
    mappingId: STUDY_GRAPH_CURVE_MAPPING, direction: "two-way",
  }] });
}
