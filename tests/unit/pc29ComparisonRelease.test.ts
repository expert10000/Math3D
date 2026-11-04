import { describe, expect, it } from "vitest";
import { pc29ComparisonProject } from "../fixtures/pc29ComparisonProject";
import { parseProjectPackage } from "../../renderer/src/projects/projectResources";
import { readProjectWorkbook } from "../../renderer/src/projects/projectWorkbookBinding";
import { buildSavedMeshResultTrend } from "../../renderer/src/projects/projectSavedMeshResultTrend";
import { inspectWorkbookSavedMeshReview } from "../../renderer/src/projects/projectSavedMeshWorkbookReview";
import { inspectWorkbookCoordinateReview } from "../../renderer/src/projects/projectCoordinateWorkbookReview";
import { notebookPublicationManifest, notebookPublicationManifestHtml } from "../../renderer/src/workbook/notebookPublication";

describe("PC29 multi-feature Project release gate", () => {
  const open = () => {
    const fixture = pc29ComparisonProject();
    const imported = parseProjectPackage(fixture.raw), project = imported.project;
    const read = (item: Parameters<typeof imported.resources.bytes>[0]) => imported.resources.bytes(item);
    const workbookRef = project.workbooks!.find(item => item.id === fixture.workbookId)!;
    const workbook = readProjectWorkbook(read({ kind: "workbook-payload", id: workbookRef.id })!, workbookRef);
    const visualize = workbook.stages.find(stage => stage.id === "visualize")!.blocks[0]!.visualize!;
    return { fixture, imported, project, read, workbook, visualize };
  };
  it("keeps retained generations, saved results, A/B pairs and a coordinate Note in one portable Project", () => {
    const { fixture, project, read, visualize } = open();
    expect(fixture.resultIds).toHaveLength(3);
    expect(fixture.pairIds).toHaveLength(3);
    expect(buildSavedMeshResultTrend(project, fixture.resultIds[0]!, "metrics.triangleArea.avg", read)
      .rows.map(row => row.status)).toEqual(["available", "available", "available"]);
    expect(inspectWorkbookSavedMeshReview(project, visualize.savedMeshReview!, read).entries
      .map(entry => entry.status)).toEqual(["verified", "verified", "verified"]);
    expect(inspectWorkbookCoordinateReview(project, visualize.coordinateReview!, read).entries[0]?.status).toBe("verified");
  });
  it("withholds both reviews when their Mesh sidecars are missing or altered", () => {
    const { project, read, workbook, visualize } = open();
    for (const mode of ["missing", "altered"] as const) {
      const unavailable = (item: Parameters<typeof read>[0]) => {
        const bytes = read(item);
        if (item.kind !== "mesh-buffers" || !bytes) return bytes;
        if (mode === "missing") return null;
        const changed = bytes.slice(); changed[0] ^= 1; return changed;
      };
      expect(inspectWorkbookSavedMeshReview(project, visualize.savedMeshReview!, unavailable).entries
        .some(entry => entry.status === "unavailable")).toBe(true);
      expect(inspectWorkbookCoordinateReview(project, visualize.coordinateReview!, unavailable).entries[0]?.status)
        .toBe("unavailable");
      const html = notebookPublicationManifestHtml(notebookPublicationManifest([workbook], project,
        undefined, undefined, unavailable));
      expect(html).not.toContain("Authored PC29 coordinate observation.");
      expect(html).not.toContain("The first saved scaling raises");
    }
  });
  it("refuses changed Note and resource bytes in portable import", () => {
    const { fixture } = open(), packaged = JSON.parse(fixture.raw);
    const changedNote = structuredClone(packaged);
    changedNote.project.notes.find((item: { title: string }) => item.title === "PC29 coordinate").body = "Forged";
    expect(() => parseProjectPackage(JSON.stringify(changedNote))).toThrow();
    const changedBytes = structuredClone(packaged);
    const sidecar = changedBytes.resources.find((item: { kind: string }) => item.kind === "mesh-buffers");
    sidecar.data = (sidecar.data[0] === "A" ? "B" : "A") + sidecar.data.slice(1);
    expect(() => parseProjectPackage(JSON.stringify(changedBytes))).toThrow();
  });
});
