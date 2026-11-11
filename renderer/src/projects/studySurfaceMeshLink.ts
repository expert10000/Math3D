import { readProjectCoordinateFrame, sameProjectCoordinateFrame,
  upsertProjectStudy, type Math3DProject, type MeshDocument,
  type ProjectCoordinateFrame, type StudyRecordV1, type SurfaceDocument } from "@math3d/core";
import { resolveStudyPane } from "./studyPaneResolution";

export const STUDY_SURFACE_MESH_MAPPING = "surface.mesh-physical-coordinate";
export type QualifiedStudySurfaceMesh = Readonly<{ surfacePaneId: string; meshPaneId: string;
  surface: SurfaceDocument; mesh: MeshDocument; frame: ProjectCoordinateFrame }>;
export type StudySurfaceMeshQualification = Readonly<{ status: "ready"; value: QualifiedStudySurfaceMesh } | {
  status: "disabled"; reason: string }>;

/** A common physical marker is allowed only for exact saved generations in one declared frame. */
export function qualifyStudySurfaceMeshLink(project: Math3DProject, study: StudyRecordV1):
  StudySurfaceMeshQualification {
  if (study.layout.panes.length !== 2)
    return { status: "disabled", reason: "Surface–Mesh coordinate linking needs exactly two Study panes." };
  const resolved = study.layout.panes.map(pane => ({ paneId: pane.paneId,
    value: resolveStudyPane(project, study, pane.paneId) }));
  const unavailable = resolved.find(item => item.value.status === "withheld");
  if (unavailable?.value.status === "withheld")
    return { status: "disabled", reason: unavailable.value.reason };
  const surface = resolved.find(item => item.value.status === "ready" &&
    item.value.document.format === "math3d.surface-document");
  const mesh = resolved.find(item => item.value.status === "ready" &&
    item.value.document.format === "math3d.mesh-document");
  if (!surface || !mesh || surface.value.status !== "ready" || mesh.value.status !== "ready" ||
      surface.value.document.format !== "math3d.surface-document" ||
      mesh.value.document.format !== "math3d.mesh-document")
    return { status: "disabled", reason: "Study needs one current Surface and one current Mesh." };
  const surfaceFrame = readProjectCoordinateFrame(surface.value.document);
  const meshFrame = readProjectCoordinateFrame(mesh.value.document);
  if (surfaceFrame.status !== "declared" || meshFrame.status !== "declared" ||
      !surfaceFrame.value || !meshFrame.value)
    return { status: "disabled", reason: "Both sources need declared physical coordinate frames." };
  if (!sameProjectCoordinateFrame(surfaceFrame.value, meshFrame.value))
    return { status: "disabled", reason: "Surface and Mesh physical frames or units differ." };
  return { status: "ready", value: { surfacePaneId: surface.paneId, meshPaneId: mesh.paneId,
    surface: surface.value.document, mesh: mesh.value.document, frame: surfaceFrame.value } };
}

export function studyHasQualifiedSurfaceMeshLink(study: StudyRecordV1,
  pair: QualifiedStudySurfaceMesh): boolean {
  return study.links.some(link => link.kind === "cursor" && link.mappingId === STUDY_SURFACE_MESH_MAPPING &&
    link.sourcePaneId === pair.surfacePaneId && link.targetPaneId === pair.meshPaneId &&
    link.direction === "two-way");
}

export function addQualifiedStudySurfaceMeshLink(project: Math3DProject, studyId: string): Math3DProject {
  const study = project.workspace.studies?.find(item => item.id === studyId);
  if (!study) throw new TypeError("Study is unavailable.");
  const qualified = qualifyStudySurfaceMeshLink(project, study);
  if (qualified.status !== "ready") throw new TypeError(qualified.reason);
  const pair = qualified.value;
  if (studyHasQualifiedSurfaceMeshLink(study, pair)) return project;
  return upsertProjectStudy(project, { ...study, links: [...study.links, {
    id: `cursor-${pair.surfacePaneId}-${pair.meshPaneId}`, kind: "cursor",
    sourcePaneId: pair.surfacePaneId, targetPaneId: pair.meshPaneId,
    mappingId: STUDY_SURFACE_MESH_MAPPING, direction: "two-way",
  }] });
}
