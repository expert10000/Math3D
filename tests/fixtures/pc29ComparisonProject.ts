import { createMixedWorkspaceDocument, replaceMath3DProjectWorkspace, upsertMath3DProjectComposition,
  upsertMath3DProjectNote, upsertMath3DProjectWorkbook } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookCoordinateReviewReference,
  createWorkbookSavedMeshReviewReference } from "@math3d/workbook";
import { instantiateMeshComparisonStarter } from "../../renderer/src/projects/meshComparisonStarter";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";
import { resolveLinkedCoordinateProbe } from "../../renderer/src/projects/projectLinkedCoordinateProbe";
import { createProjectComparisonNote } from "../../renderer/src/projects/projectComparisonNotes";
import { captureProjectResources, exportProjectPackage } from "../../renderer/src/projects/projectResources";
import { prepareProjectWorkbook } from "../../renderer/src/projects/projectWorkbookBinding";

/** One portable Project containing retained Mesh results, three A/B pairs, and a coordinate Note. */
export function pc29ComparisonProject() {
  const made = instantiateMeshComparisonStarter("pc29-release-gate", "mesh-comparison-review");
  const geometryMade = instantiateMeshComparisonStarter("pc29-release-gate-geometry", "mesh-geometry-probe");
  const geometry = geometryMade.project.workspace.entries.find(entry => entry.module === "geometry")!;
  const read = (item: Parameters<typeof made.resources.bytes>[0]) => made.resources.bytes(item);
  let project = replaceMath3DProjectWorkspace(made.project, createMixedWorkspaceDocument({ ...made.project.workspace,
    entries: [...made.project.workspace.entries, geometry],
    activeDocumentIds: [...made.project.workspace.activeDocumentIds, geometry.expected.id] }));
  const mesh = project.workspace.entries.find(entry => entry.module === "mesh")!;
  const composition = { id: "pc29:mesh-geometry", title: "PC29 Mesh / Geometry · metres", mode: "side-by-side" as const,
    members: [
      { documentId: mesh.expected.id, expected: mesh.expected, visible: true, color: "#3976d7", opacity: 1 },
      { documentId: geometry.expected.id, expected: geometry.expected, visible: true, color: "#e8793a", opacity: 0.8 },
    ] };
  project = upsertMath3DProjectComposition(project, composition);
  const members = composition.members.map((member, slot) =>
    ({ ...resolveProjectCompositionMember(project, member, read), slot: slot as 0 | 1 }));
  const source = members[1]!;
  const probe = resolveLinkedCoordinateProbe(members, { memberId: source.id, revision: source.revision,
    hash: source.hash, point: { x: 0.1, y: 0.2, z: 0 } })!;
  project = upsertMath3DProjectNote(project, createProjectComparisonNote(project, composition, read,
    "PC29 coordinate", "Authored PC29 coordinate observation.", 1, "pc29-coordinate", probe));
  const note = project.notes!.find(item => item.title === "PC29 coordinate")!;
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `pc29-workbook-${++sequence}`);
  const block = workbook.stages.find(stage => stage.id === "visualize")!.blocks[0]!;
  block.visualize = { ...block.visualize!,
    savedMeshReview: createWorkbookSavedMeshReviewReference(project, project.savedMeshComparisons!.map(item => item.id)),
    coordinateReview: createWorkbookCoordinateReviewReference(project, [note.identity.id]) };
  const prepared = prepareProjectWorkbook(project, workbook, "pc29-workbook");
  project = upsertMath3DProjectWorkbook(project, prepared.reference);
  const resources = captureProjectResources(project, item => item.kind === "workbook-payload" && item.id === prepared.reference.id
    ? prepared.bytes : read(item));
  return { raw: exportProjectPackage(project, resources), projectId: project.identity.id,
    workbookId: prepared.reference.id, noteId: note.identity.id, compositionId: composition.id,
    meshId: mesh.expected.id, resultIds: project.workspace.results.map(item => item.resultId),
    pairIds: project.savedMeshComparisons!.map(item => item.id) };
}
