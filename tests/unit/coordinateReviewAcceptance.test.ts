import { describe, expect, it } from "vitest";
import { parseProjectPackage, projectResourceInventory } from "../../renderer/src/projects/projectResources";
import { readProjectWorkbook } from "../../renderer/src/projects/projectWorkbookBinding";
import { inspectWorkbookCoordinateReview, workbookCoordinateReviewHtml } from "../../renderer/src/projects/projectCoordinateWorkbookReview";
import { notebookPublicationManifest, notebookPublicationManifestHtml } from "../../renderer/src/workbook/notebookPublication";
import { pc28CoordinateReviewProject } from "../fixtures/pc28CoordinateReviewProject";

describe("PC28 qualified coordinate review evidence", () => {
  it("withholds markers and Note text for missing Notes, missing sources and altered sidecars", () => {
    const fixture = pc28CoordinateReviewProject();
    const imported = parseProjectPackage(fixture.raw);
    const project = imported.project;
    const workbookRef = project.workbooks!.find(item => item.id === fixture.workbookId)!;
    const workbook = readProjectWorkbook(imported.resources.bytes({ kind: "workbook-payload", id: workbookRef.id })!, workbookRef);
    const reference = workbook.stages.find(stage => stage.id === "visualize")!.blocks[0]!.visualize!.coordinateReview!;
    const read = (item: Parameters<typeof imported.resources.bytes>[0]) => imported.resources.bytes(item);
    expect(inspectWorkbookCoordinateReview(project, reference, read).entries[0]?.status).toBe("verified");
    const unavailable = [
      inspectWorkbookCoordinateReview({ ...project, notes: [] }, reference, read),
      inspectWorkbookCoordinateReview({ ...project, notes: project.notes!.map(note =>
        note.identity.id === fixture.noteId ? { ...note, body: "Forged observation" } : note) }, reference, read),
      inspectWorkbookCoordinateReview(project, reference, () => null),
    ];
    const sidecar = projectResourceInventory(project).find(item => item.kind === "mesh-buffers")!;
    unavailable.push(inspectWorkbookCoordinateReview(project, reference, item => {
      const bytes = read(item);
      if (!bytes || item.id !== sidecar.id) return bytes;
      const altered = bytes.slice(); altered[0] ^= 1; return altered;
    }));
    for (const snapshot of unavailable) {
      expect(snapshot.entries[0]).toMatchObject({ status: "unavailable", evidence: null });
      const html = workbookCoordinateReviewHtml(snapshot);
      expect(html).toContain("Coordinate and observation text withheld.");
      expect(html).not.toContain("Authored PC28 review observation.");
      expect(html).not.toContain("0.1, 0.2, 0");
    }
    const report = notebookPublicationManifest([workbook], project, undefined, undefined, () => null);
    expect(report.blocks.find(block => block.coordinateReview)?.coordinateReview?.entries[0]?.status).toBe("unavailable");
    const reportHtml = notebookPublicationManifestHtml(report);
    expect(reportHtml).toContain("data-coordinate-review");
    expect(reportHtml).not.toContain("Authored PC28 review observation.");
  });
});
