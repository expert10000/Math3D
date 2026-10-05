import { describe, expect, it } from "vitest";
import { createProjectNote, instantiateMath3DProjectTemplate, updateProjectNote, upsertMath3DProjectNote } from "@math3d/core";
import { addWorkbookDependency, createBlockDependencySource, createDefaultWorkbook, createNoteDependencySource,
  createNotebookReference, refreshWorkbookDependency, resolveWorkbookFreshness, workbookDependencyInputSignature,
  workbookNeedsProjectInspection, type WorkbookDependency } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";

const fixture = () => {
  let n = 0;
  const workbook = createDefaultWorkbook(() => `block-${++n}`);
  const [a, b] = workbook.stages[0]!.blocks;
  const c = workbook.stages[2]!.blocks[0]!;
  return { workbook, a: a!, b: b!, c };
};

describe("WB02 dependency freshness", () => {
  it("shows the affected path after a block edit and clears after an explicit refresh", () => {
    const { workbook, a, b, c } = fixture();
    const ab: WorkbookDependency = { id: "ab", targetBlockId: b.id, source: createBlockDependencySource(workbook, a.id) };
    const first = addWorkbookDependency(workbook, ab);
    const linked = addWorkbookDependency(first, { id: "bc", targetBlockId: c.id, source: createBlockDependencySource(first, b.id) });
    expect(resolveWorkbookFreshness(linked, null).get(c.id)?.status).toBe("current");
    const before = JSON.stringify(workbookDependencyInputSignature(linked, b.id));
    a.text = "Changed source";
    expect(JSON.stringify(workbookDependencyInputSignature(linked, b.id))).not.toBe(before);
    const affected = resolveWorkbookFreshness(linked, null);
    expect(affected.get(b.id)).toMatchObject({ status: "stale", path: [a.id, b.id], blockedBySource: false });
    expect(affected.get(c.id)).toMatchObject({ status: "stale", path: [a.id, b.id, c.id], blockedBySource: true });
    const refreshed = refreshWorkbookDependency(linked, "ab", null);
    expect(resolveWorkbookFreshness(refreshed, null).get(c.id)?.status).toBe("current");
  });

  it("propagates exact Note edits, missing sources and upstream failures", () => {
    let project = instantiateMath3DProjectTemplate("catenary-study", "wb02-study");
    const note = createProjectNote({ projectId: project.identity.id, stableKey: "observation", kind: "text",
      title: "Observation", body: "First", anchor: null, createdAt: 100 });
    project = upsertMath3DProjectNote(project, note);
    const { workbook, a, b, c } = fixture();
    const fromNote = addWorkbookDependency(workbook, { id: "note", targetBlockId: a.id,
      source: createNoteDependencySource(project, note.identity.id) }, project);
    const ab = addWorkbookDependency(fromNote, { id: "ab", targetBlockId: b.id, source: createBlockDependencySource(fromNote, a.id) });
    const linked = addWorkbookDependency(ab, { id: "bc", targetBlockId: c.id, source: createBlockDependencySource(ab, b.id) });
    expect(resolveWorkbookFreshness(linked, project).get(c.id)?.status).toBe("current");
    const originalSignature = JSON.stringify(workbookDependencyInputSignature(linked, a.id));
    const changed = upsertMath3DProjectNote(project, updateProjectNote(note, { body: "Revised" }, 101));
    expect(resolveWorkbookFreshness(linked, changed).get(c.id)).toMatchObject({ status: "stale", path: [a.id, b.id, c.id], blockedBySource: true });
    expect(resolveWorkbookFreshness(linked, null).get(c.id)?.status).toBe("missing");
    const failure = resolveWorkbookFreshness(linked, project, { [a.id]: "failed" });
    expect(failure.get(c.id)).toMatchObject({ status: "failed", path: [a.id, b.id, c.id] });
    const refreshed = refreshWorkbookDependency(linked, "note", changed);
    expect(resolveWorkbookFreshness(refreshed, changed).get(c.id)?.status).toBe("current");
    expect(JSON.stringify(workbookDependencyInputSignature(refreshed, a.id))).not.toBe(originalSignature);
  });

  it("treats old links without a fingerprint as stale until refreshed", () => {
    const { workbook, a, b } = fixture();
    const legacy = addWorkbookDependency(workbook, { id: "legacy", targetBlockId: b.id, source: { kind: "block", blockId: a.id } });
    expect(resolveWorkbookFreshness(legacy, null).get(b.id)?.status).toBe("stale");
    expect(resolveWorkbookFreshness(refreshWorkbookDependency(legacy, "legacy", null), null).get(b.id)?.status).toBe("current");
  });

  it("propagates the existing Project reference cell state through block links", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "wb02-reference");
    const { workbook, a, b } = fixture();
    a.type = "reference";
    a.notebookReference = createNotebookReference(project, "document", project.workspace.entries[0]!.expected.id);
    const linked = addWorkbookDependency(workbook, { id: "from-reference", targetBlockId: b.id,
      source: createBlockDependencySource(workbook, a.id) });
    expect(workbookNeedsProjectInspection(linked)).toBe(true);
    expect(resolveWorkbookFreshness(linked, project).get(b.id)?.status).toBe("current");
    expect(resolveWorkbookFreshness(linked, null).get(b.id)).toMatchObject({ status: "missing", blockedBySource: true });
  });

  it("preserves the exact dependency snapshot in a saved run across Project round trip", () => {
    const { workbook, a, b } = fixture();
    const linked = addWorkbookDependency(workbook, { id: "source", targetBlockId: b.id,
      source: createBlockDependencySource(workbook, a.id) });
    linked.stages[1]!.blocks.push({ id: "calculation", type: "compute", title: "Calculation",
      compute: { runHistory: [{ id: "run", savedAt: 100, operatorId: "example", datasetRef: "dataset",
        viewerKind: "mesh", inputHash: "input", inputRefs: [], dependencyRefs: linked.dependencies,
        params: {}, viewSnapshot: null, status: "ok" }] } });
    const project = instantiateMath3DProjectTemplate("catenary-study", "wb02-saved-run");
    const adopted = prepareProjectWorkbook(project, linked, "adoption");
    const reopened = readProjectWorkbook(adopted.bytes, adopted.reference);
    expect(reopened.stages[1]!.blocks[0]!.compute?.runHistory?.[0]?.dependencyRefs).toEqual(linked.dependencies);
  });
});
