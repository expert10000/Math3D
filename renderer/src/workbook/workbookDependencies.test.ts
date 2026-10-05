import { describe, expect, it } from "vitest";
import { createProjectNote, createStableDocumentId, instantiateMath3DProjectTemplate, structuralHash,
  updateProjectNote, upsertMath3DProjectNote } from "@math3d/core";
import { addWorkbookDependency, createDefaultWorkbook, createNoteDependencySource, createProjectDependencySource,
  inspectWorkbookDependency, validateWorkbookDependencies, type Workbook, type WorkbookDependency } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";

const fixture = () => {
  let n = 0;
  const workbook = createDefaultWorkbook(() => `wb-${++n}`);
  const [a, b] = workbook.stages[0]!.blocks;
  const c = workbook.stages[2]!.blocks[0]!;
  return { workbook, a: a!, b: b!, c };
};
const edge = (id: string, from: string, to: string): WorkbookDependency => ({ id, targetBlockId: to, source: { kind: "block", blockId: from } });

describe("WB01 Workbook dependencies", () => {
  it("accepts typed block links and rejects cycles, duplicates and incompatible ports", () => {
    const { workbook, a, b, c } = fixture();
    const first = addWorkbookDependency(workbook, edge("one", a.id, b.id));
    const second = addWorkbookDependency(first, edge("two", b.id, c.id));
    expect(second.dependencies).toHaveLength(2);
    expect(() => addWorkbookDependency(second, edge("three", c.id, a.id))).toThrow(/cycle/);
    expect(() => addWorkbookDependency(first, edge("one", a.id, c.id))).toThrow(/identity/);
    expect(() => addWorkbookDependency(first, edge("other", a.id, b.id))).toThrow(/Duplicate/);
    const badPort: WorkbookDependency = { id: "bad", targetBlockId: c.id,
      source: { kind: "block", blockId: a.id, outputPortId: "text", inputPortId: "dataset" } };
    expect(() => addWorkbookDependency(workbook, badPort)).toThrow(/ports/);
  });

  it("keeps exact Project document, result and Note generations and detects Note edits", () => {
    let project = instantiateMath3DProjectTemplate("catenary-study", "wb01-study");
    const note = createProjectNote({ projectId: project.identity.id, stableKey: "observation", kind: "text", title: "Observation",
      body: "Initial", anchor: null, createdAt: 100 });
    project = upsertMath3DProjectNote(project, note);
    const { workbook, a, b, c } = fixture();
    const document = project.workspace.entries[0]!;
    const result = project.workspace.results[0]!;
    const links: WorkbookDependency[] = [
      { id: "document", targetBlockId: a.id, source: createProjectDependencySource(project, "document", document.expected.id) },
      { id: "result", targetBlockId: b.id, source: createProjectDependencySource(project, "result", result.resultId) },
      { id: "note", targetBlockId: c.id, source: createNoteDependencySource(project, note.identity.id) },
    ];
    const linked = links.reduce((value, link) => addWorkbookDependency(value, link, project), workbook);
    for (const link of links) expect(inspectWorkbookDependency(link, linked, project).status).toBe("current");
    const changed = upsertMath3DProjectNote(project, updateProjectNote(note, { body: "Revised" }, 101));
    expect(inspectWorkbookDependency(links[2]!, linked, changed).status).toBe("stale");
    expect(inspectWorkbookDependency(links[2]!, linked, null).status).toBe("missing");
    expect(JSON.stringify(links[2])).not.toContain("Initial");
  });

  it("loads legacy Workbooks and round trips links without losing blocks or saved runs", () => {
    const { workbook, a, b } = fixture();
    const legacy = JSON.parse(JSON.stringify(workbook)) as Workbook;
    expect(legacy.dependencies).toBeUndefined();
    validateWorkbookDependencies(legacy);
    workbook.stages[1]!.blocks.push({ id: "compute-saved", type: "compute", title: "Saved computation",
      compute: { runHistory: [{ id: "saved", savedAt: 100, operatorId: "example", datasetRef: "dataset", viewerKind: "mesh",
        inputHash: "hash", inputRefs: [], params: {}, viewSnapshot: null, status: "ok" }] } });
    const linked = addWorkbookDependency(workbook, edge("first", a.id, b.id));
    const project = instantiateMath3DProjectTemplate("catenary-study", "wb01-round-trip");
    const adopted = prepareProjectWorkbook(project, linked, "first");
    const reopened = readProjectWorkbook(adopted.bytes, adopted.reference);
    expect(reopened.dependencies).toEqual(linked.dependencies);
    expect(reopened.stages).toEqual(linked.stages);
  });

  it("rejects a block path that would feed a Note back into its anchor block", () => {
    const { workbook, a, b } = fixture();
    workbook.id = createStableDocumentId("workbook", "anchored-study");
    let project = instantiateMath3DProjectTemplate("catenary-study", "wb01-cycle");
    const note = createProjectNote({ projectId: project.identity.id, stableKey: "anchored", kind: "text", title: "Anchor",
      body: "Observation", createdAt: 100, anchor: { kind: "workbook-block", workbookId: workbook.id as `math3d:workbook:${string}`,
        workbookRevision: 1, blockId: a.id, blockHash: structuralHash(a) } });
    project = upsertMath3DProjectNote(project, note);
    const fromNote = addWorkbookDependency(workbook, { id: "from-note", targetBlockId: b.id,
      source: createNoteDependencySource(project, note.identity.id) }, project);
    expect(() => addWorkbookDependency(fromNote, edge("back-to-anchor", b.id, a.id), project)).toThrow(/cycle/);
  });
});
