import { describe, expect, it } from "vitest";
import { structuralHash } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookSavedMeshReviewReference,
  inspectWorkbookSavedMeshReviewReference, normalizeWorkbookSavedMeshReviewReference,
  validateWorkbookDependencies } from "@math3d/workbook";
import { instantiateMeshComparisonStarter } from "./meshComparisonStarter";
import { prepareProjectWorkbook, readProjectWorkbook } from "./projectWorkbookBinding";

describe("PC23 exact Workbook review reference", () => {
  it("retains selected saved pairs and Notes through a Workbook resource", () => {
    const { project } = instantiateMeshComparisonStarter("pc23-reference", "mesh-comparison-review");
    const ids = project.savedMeshComparisons!.slice(0, 2).map(pair => pair.id);
    const ref = createWorkbookSavedMeshReviewReference(project, ids);
    expect(ref.pairs.map(item => item.comparison.comparisonId)).toEqual(ids);
    expect(ref.pairs.map(item => item.notes.length)).toEqual([1, 1]);
    expect(inspectWorkbookSavedMeshReviewReference(project, ref)).toBe("current");
    const workbook = createDefaultWorkbook(() => crypto.randomUUID());
    workbook.stages[2]!.blocks[0]!.visualize = { live: false, savedMeshReview: ref };
    validateWorkbookDependencies(workbook);
    const bound = prepareProjectWorkbook(project, workbook, "pc23");
    expect(readProjectWorkbook(bound.bytes, bound.reference).stages[2]!.blocks[0]!.visualize?.savedMeshReview).toEqual(ref);
  });
  it("rejects duplicate, foreign and changed references", () => {
    const { project } = instantiateMeshComparisonStarter("pc23-refusal", "mesh-comparison-review");
    const ref = createWorkbookSavedMeshReviewReference(project, project.savedMeshComparisons!.map(pair => pair.id));
    expect(() => normalizeWorkbookSavedMeshReviewReference({ ...ref, pairs: [ref.pairs[0], ref.pairs[0]] })).toThrow();
    expect(() => createWorkbookSavedMeshReviewReference(project, ["missing-pair"])).toThrow();
    expect(inspectWorkbookSavedMeshReviewReference({ ...project, savedMeshComparisons: [] }, ref)).toBe("missing");
    expect(inspectWorkbookSavedMeshReviewReference({ ...project, savedMeshComparisons: project.savedMeshComparisons!.map((pair, index) =>
      index ? pair : { ...pair, title: "Changed pair" }) }, ref)).toBe("stale");
    expect(inspectWorkbookSavedMeshReviewReference({ ...project, notes: project.notes!.map((note, index) => index ? note :
      { ...note, identity: { ...note.identity, structuralHash: structuralHash("changed") } }) } as typeof project, ref)).toBe("stale");
  });
});
