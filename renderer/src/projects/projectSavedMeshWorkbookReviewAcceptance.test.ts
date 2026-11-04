import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject, structuralHash } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookSavedMeshReviewReference } from "@math3d/workbook";
import { instantiateMeshComparisonStarter } from "./meshComparisonStarter";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";
import { inspectWorkbookSavedMeshReview } from "./projectSavedMeshWorkbookReview";
import { notebookPublicationManifest, notebookPublicationManifestHtml, notebookPublicationMarkdown,
  createPortableNotebookPublication, inspectPortableNotebookPublication } from "../workbook/notebookPublication";

const fixture = () => {
  const { project, resources } = instantiateMeshComparisonStarter("pc23-acceptance", "mesh-comparison-review");
  const imported = parseProjectPackage(exportProjectPackage(project, resources));
  const reopened = parseMath3DProject(serializeMath3DProject(imported.project));
  const read = (item: Parameters<typeof imported.resources.bytes>[0]) => imported.resources.bytes(item);
  const reference = createWorkbookSavedMeshReviewReference(reopened, reopened.savedMeshComparisons!.map(pair => pair.id));
  let n = 0; const workbook = createDefaultWorkbook(() => `pc23-acceptance-${++n}`);
  workbook.stages[2]!.blocks[0]!.visualize = { live: false, savedMeshReview: reference };
  return { project: reopened, resources: imported.resources, read, reference, workbook };
};

describe("PC23 saved comparison review acceptance", () => {
  it("reopens three exact pairs and only the two captured verified Notes", () => {
    const { project, read, reference } = fixture();
    const snapshot = inspectWorkbookSavedMeshReview(project, reference, read);
    expect(snapshot.entries.map(entry => entry.status)).toEqual(["verified", "verified", "verified"]);
    expect(snapshot.entries.map(entry => entry.values?.difference)).toEqual([0.625, 1.40625, 2.03125]);
    expect(snapshot.entries.map(entry => entry.observations.length)).toEqual([1, 1, 0]);
    expect(snapshot.entries[0]!.observations[0]!.body).toContain("first saved scaling");
    expect(snapshot.entries[0]!.comparisonHash).toBe(reference.pairs[0]!.comparison.comparisonHash);
  });
  it("keeps unavailable rows explicit and withholds values and changed Note text", () => {
    const { project, read, reference } = fixture();
    const tampered = inspectWorkbookSavedMeshReview(project, reference, item => {
      const bytes = read(item); if (!bytes) return null;
      const copy = bytes.slice(); copy[0] ^= 1; return copy;
    });
    expect(tampered.entries.every(entry => entry.status === "unavailable" && entry.values === null)).toBe(true);
    expect(JSON.stringify(tampered)).not.toContain("The first saved scaling");
    const removed = { ...project, savedMeshComparisons: project.savedMeshComparisons!.slice(1) };
    const partial = inspectWorkbookSavedMeshReview(removed, reference, read);
    expect(partial.entries.map(entry => entry.status)).toEqual(["unavailable", "verified", "verified"]);
    const changed = { ...project, notes: project.notes!.map((note, index) => index ? note :
      { ...note, title: "Changed Note", identity: { ...note.identity, structuralHash: structuralHash("changed") } }) } as typeof project;
    const notes = inspectWorkbookSavedMeshReview(changed, reference, read);
    expect(notes.entries[0]!.status).toBe("verified");
    expect(notes.entries[0]!.observations[0]!.status).toBe("unavailable");
    expect(notes.entries[0]!.observations[0]).not.toHaveProperty("body");
  });
  it("includes checked review in HTML/Markdown and portable Workbook import", () => {
    const { project, resources, read, reference, workbook } = fixture();
    const manifest = notebookPublicationManifest([workbook], project, undefined, undefined, read);
    const review = manifest.blocks.find(block => block.savedMeshReview)?.savedMeshReview;
    expect(review?.reference).toEqual(reference);
    expect(review?.entries.map(entry => entry.status)).toEqual(["verified", "verified", "verified"]);
    const html = notebookPublicationManifestHtml(manifest), markdown = notebookPublicationMarkdown(manifest);
    expect(html).toContain("data-saved-mesh-review");
    expect(html).toContain("Review observation 1");
    expect(markdown).toContain(reference.pairs[2]!.comparison.comparisonHash);
    const portable = createPortableNotebookPublication(project, [workbook], resources, undefined, read);
    expect(inspectPortableNotebookPublication(portable).project.identity.id).toBe(project.identity.id);
    const modified = { ...portable, packageJson: portable.packageJson.replace("Review observation 1", "Altered observation") };
    expect(() => inspectPortableNotebookPublication(modified)).toThrow(/checksum mismatch/i);
  });
  it("publishes unavailable rows without leaking stale values or Note text", () => {
    const { project, read, workbook } = fixture();
    const missing = notebookPublicationManifest([workbook], project, undefined, undefined, () => null);
    expect(missing.blocks.find(block => block.savedMeshReview)?.savedMeshReview?.entries.every(entry => entry.values === null)).toBe(true);
    const html = notebookPublicationManifestHtml(missing);
    expect(html).toContain("Values unavailable");
    expect(html).not.toContain("The first saved scaling");
    const corrupt = (item: Parameters<typeof read>[0]) => {
      const bytes = read(item); if (!bytes) return null;
      const copy = bytes.slice(); copy[0] ^= 1; return copy;
    };
    const changed = notebookPublicationManifest([workbook], project, undefined, undefined, corrupt);
    expect(changed.blocks.find(block => block.savedMeshReview)?.savedMeshReview?.entries.every(entry => entry.status === "unavailable")).toBe(true);
  });
});
