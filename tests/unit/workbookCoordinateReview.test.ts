import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject, sha256Checksum, upsertMath3DProjectNote, structuralHash } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookCoordinateReviewReference, inspectWorkbookCoordinateReviewReference,
  normalizeWorkbookCoordinateReviewReference, validateWorkbookDependencies } from "@math3d/workbook";
import { instantiateMeshComparisonStarter } from "../../renderer/src/projects/meshComparisonStarter";
import { resolveProjectCompositionMember } from "../../renderer/src/components/ProjectCompositionView";
import { resolveLinkedCoordinateProbe } from "../../renderer/src/projects/projectLinkedCoordinateProbe";
import { createProjectComparisonNote } from "../../renderer/src/projects/projectComparisonNotes";
import { inspectWorkbookCoordinateReview, workbookCoordinateReviewHtml } from "../../renderer/src/projects/projectCoordinateWorkbookReview";
import { captureProjectResources, exportProjectPackage, parseProjectPackage, projectResourceInventory } from "../../renderer/src/projects/projectResources";
import { createPortableNotebookPublication, inspectPortableNotebookPublication, notebookPublicationManifest,
  notebookPublicationManifestHtml } from "../../renderer/src/workbook/notebookPublication";

const fixture = () => {
  const made = instantiateMeshComparisonStarter("pc27-review", "mesh-geometry-probe");
  const read = (item: Parameters<typeof made.resources.bytes>[0]) => made.resources.bytes(item);
  const comparison = made.project.compositions![0]!;
  const members = comparison.members.map((member, slot) => ({ ...resolveProjectCompositionMember(made.project, member, read), slot: slot as 0 | 1 }));
  let project = made.project;
  for (const index of [0, 1]) {
    const source = members[index]!;
    const probe = resolveLinkedCoordinateProbe(members, { memberId: source.id, revision: source.revision,
      hash: source.hash, point: { x: index / 10, y: 0.2, z: 0 } })!;
    project = upsertMath3DProjectNote(project, createProjectComparisonNote(project, comparison, read,
      `Position ${index}`, `Authored observation ${index}`, index + 1, `pc27-${index}`, probe));
  }
  const reference = createWorkbookCoordinateReviewReference(project, project.notes!.map(note => note.identity.id));
  return { project, resources: made.resources, read, reference };
};

describe("PC27 Workbook coordinate review", () => {
  it("pins exact Note identities and rechecks each row without showing changed coordinates", () => {
    const { project, read, reference } = fixture();
    expect(normalizeWorkbookCoordinateReviewReference(reference).notes).toHaveLength(2);
    expect(inspectWorkbookCoordinateReviewReference(project, reference)).toBe("current");
    const checked = inspectWorkbookCoordinateReview(project, reference, read);
    expect(checked.entries.map(item => item.status)).toEqual(["verified", "verified"]);
    expect(checked.entries.map(item => item.evidence?.point)).toEqual([[0.1, 0.2, 0], [0, 0.2, 0]]);
    const missing = inspectWorkbookCoordinateReview(project, reference, () => null);
    expect(missing.entries.map(item => item.status)).toEqual(["unavailable", "unavailable"]);
    expect(missing.entries.every(item => item.evidence === null)).toBe(true);
    expect(workbookCoordinateReviewHtml(missing)).not.toContain("Authored observation");
    const note = project.notes![0]!;
    const edited = { ...project, notes: [{ ...note, body: "Changed text" }, ...project.notes!.slice(1)] };
    expect(inspectWorkbookCoordinateReview(edited, reference, read).entries[0]?.evidence).toBeNull();
    const resource = projectResourceInventory(project).find(item => item.kind === "mesh-buffers")!;
    const tampered = (item: typeof resource) => {
      const bytes = read(item); if (!bytes) return null;
      if (item.id !== resource.id) return bytes;
      const altered = bytes.slice(); altered[0] ^= 1; return altered;
    };
    expect(inspectWorkbookCoordinateReview(project, reference, tampered).entries.every(item => item.evidence === null)).toBe(true);
    expect(() => normalizeWorkbookCoordinateReviewReference({ ...reference, notes: [reference.notes[0], reference.notes[0]] })).toThrow();
  });

  it("reopens after Project serialization and qualifies HTML and portable publication", () => {
    const { project, resources, read, reference } = fixture();
    let seq = 0;
    const workbook = createDefaultWorkbook(() => `pc27-workbook-${++seq}`);
    const block = workbook.stages.find(stage => stage.id === "visualize")!.blocks[0]!;
    block.visualize = { ...block.visualize!, coordinateReview: reference };
    validateWorkbookDependencies(workbook);
    const manifest = notebookPublicationManifest([workbook], project, undefined, undefined, read);
    expect(manifest.blocks.find(item => item.blockId === block.id)?.coordinateReview?.entries.map(item => item.status))
      .toEqual(["verified", "verified"]);
    expect(notebookPublicationManifestHtml(manifest)).toContain("data-coordinate-review");
    const reopened = parseMath3DProject(serializeMath3DProject(parseProjectPackage(exportProjectPackage(project, resources)).project));
    expect(inspectWorkbookCoordinateReviewReference(reopened, reference)).toBe("current");
    const captured = captureProjectResources(project, read);
    const portable = createPortableNotebookPublication(project, [workbook], captured, undefined, read);
    expect(inspectPortableNotebookPublication(portable).project.identity.id).toBe(project.identity.id);
    const altered = { ...portable, manifest: { ...portable.manifest, blocks: portable.manifest.blocks.map(item =>
      item.coordinateReview ? { ...item, coordinateReview: { ...item.coordinateReview,
        entries: item.coordinateReview.entries.map(row => ({ ...row, status: "verified" as const,
          evidence: { ...row.evidence, body: "forged" } })) } } : item) } };
    expect(structuralHash(altered.manifest)).not.toBe(structuralHash(portable.manifest));
    const withValidOuterHash = { ...altered,
      manifestChecksum: sha256Checksum(new TextEncoder().encode(JSON.stringify(altered.manifest))) };
    expect(() => inspectPortableNotebookPublication(withValidOuterHash as typeof portable)).toThrow(/coordinate review sources or Notes changed/i);
  });
});
