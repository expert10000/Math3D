import { upsertMath3DProjectNote, upsertMath3DProjectWorkbook } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookCoordinateReviewReference } from "@math3d/workbook";
import { instantiateMeshComparisonStarter } from "../../renderer/src/projects/meshComparisonStarter";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";
import { resolveLinkedCoordinateProbe } from "../../renderer/src/projects/projectLinkedCoordinateProbe";
import { createProjectComparisonNote } from "../../renderer/src/projects/projectComparisonNotes";
import { captureProjectResources, exportProjectPackage } from "../../renderer/src/projects/projectResources";
import { prepareProjectWorkbook } from "../../renderer/src/projects/projectWorkbookBinding";

/** A normal portable Project package with exact Note, Workbook, composition and Mesh sidecar bytes. */
export function pc28CoordinateReviewProject() {
  const made = instantiateMeshComparisonStarter("pc28-coordinate-review", "mesh-geometry-probe");
  const read = (item: Parameters<typeof made.resources.bytes>[0]) => made.resources.bytes(item);
  const composition = made.project.compositions!.find(item => item.title === "Mesh / Geometry · shared metres")!;
  const members = composition.members.map((member, slot) =>
    ({ ...resolveProjectCompositionMember(made.project, member, read), slot: slot as 0 | 1 }));
  const source = members[1]!;
  const probe = resolveLinkedCoordinateProbe(members, { memberId: source.id, revision: source.revision,
    hash: source.hash, point: { x: 0.1, y: 0.2, z: 0 } })!;
  let project = upsertMath3DProjectNote(made.project, createProjectComparisonNote(made.project, composition, read,
    "PC28 coordinate", "Authored PC28 review observation.", 1, "pc28-coordinate", probe));
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `pc28-workbook-${++sequence}`);
  const block = workbook.stages.find(stage => stage.id === "visualize")!.blocks[0]!;
  block.visualize = { ...block.visualize!, coordinateReview: createWorkbookCoordinateReviewReference(project,
    [project.notes![0]!.identity.id]) };
  const prepared = prepareProjectWorkbook(project, workbook, "pc28-workbook");
  project = upsertMath3DProjectWorkbook(project, prepared.reference);
  const resources = captureProjectResources(project, item => item.kind === "workbook-payload" && item.id === prepared.reference.id
    ? prepared.bytes : read(item));
  return { raw: exportProjectPackage(project, resources), projectId: project.identity.id,
    workbookId: prepared.reference.id, noteId: project.notes![0]!.identity.id,
    compositionId: composition.id, coordinate: probe.point };
}
