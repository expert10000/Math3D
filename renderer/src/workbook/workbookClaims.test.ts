import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, instantiateMath3DProjectTemplate, replaceMath3DProjectWorkspace, structuralHash } from "@math3d/core";
import { assessWorkbookClaim, createDefaultWorkbook, createNotebookReference, normalizeWorkbookClaim, resolveWorkbookFreshness, workbookClaimSnapshot, type WorkbookClaim } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";
const fixture = () => {
  let n = 0; const book = createDefaultWorkbook(() => `claim-${++n}`), base = instantiateMath3DProjectTemplate("catenary-study", "claim");
  const project = replaceMath3DProjectWorkspace(base, createMixedWorkspaceDocument({ ...base.workspace, results: base.workspace.results.map(result => ({ ...result, summary: { length: 12.5 } })) }));
  const result = project.workspace.results[0]!, reference = createNotebookReference(project, "result", result.resultId);
  if (reference.kind !== "result") throw new Error("Expected result");
  const claim: WorkbookClaim = { schemaVersion: 1, text: "Length lies in the declared interval.", evidence: [{ kind: "result", reference }] };
  return { book, project, claim, result };
};
describe("WB05 bounded evidence claims", () => {
  it("leaves prose and citations unverified until an explicit checker is saved", () => {
    const { book, project, claim } = fixture();
    expect(assessWorkbookClaim(claim, book, project).status).toBe("unverified");
    expect(() => normalizeWorkbookClaim({ ...claim, status: "verified" })).toThrow();
  });
  it("derives support and contradiction for finite inclusive intervals and retains authority qualifiers", () => {
    const { book, project, claim, result } = fixture(); const length = Number(result.summary.length);
    expect(Number.isFinite(length)).toBe(true);
    const checked: WorkbookClaim = { ...claim, checker: { kind: "scalar-range", evidenceIndex: 0, field: "length", min: length, max: length } };
    expect(assessWorkbookClaim(checked, book, project)).toMatchObject({ status: "supported", value: length });
    expect(assessWorkbookClaim(checked, book, project).reason).toContain(`Authority: ${result.status}`);
    const contradicted: WorkbookClaim = { ...checked, checker: { ...checked.checker!, min: length + 1, max: length + 2 } };
    expect(assessWorkbookClaim(contradicted, book, project).status).toBe("contradicted");
    const assert = book.stages[3]!.blocks.find(item => item.type === "assert")!; assert.claim = contradicted;
    expect(resolveWorkbookFreshness(book, project).get(assert.id)?.status).toBe("failed");
    assert.enabled = false;
    expect(resolveWorkbookFreshness(book, project).get(assert.id)?.status).toBe("missing");
  });
  it("does not invent absent scalars, infer authority or accept arbitrary fields", () => {
    const { book, project, claim, result } = fixture();
    const check: WorkbookClaim = { ...claim, checker: { kind: "scalar-range", evidenceIndex: 0, field: "mean.avg", min: -1, max: 1 } };
    expect(assessWorkbookClaim(check, book, project).status).toBe("unverified");
    expect(() => normalizeWorkbookClaim({ ...check, checker: { ...check.checker, field: "__proto__" } })).toThrow();
    const heuristic = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, results: [{ ...result, status: "heuristic" }] }));
    const ref = createNotebookReference(heuristic, "result", result.resultId);
    expect(assessWorkbookClaim({ ...check, evidence: [{ kind: "result", reference: ref as any }], checker: { ...check.checker!, field: "length" } }, book, heuristic).status).toBe("unverified");
  });
  it("qualifies absent or replaced result generations as stale without reassigning their citations", () => {
    const { book, project, claim } = fixture();
    expect(assessWorkbookClaim(claim, book, null).status).toBe("stale");
    const replaced = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, results: project.workspace.results.map(item => ({ ...item, summary: { length: 42 } })) }));
    expect(assessWorkbookClaim(claim, book, replaced).status).toBe("stale");
  });
  it("treats snapshots as context and detects replacement even with the same block ID", () => {
    const { book } = fixture(), block = book.stages[2]!.blocks[0]!;
    block.visualize = { snapshotA: { datasetRef: "source", viewerKind: "param", capturedAt: 1 } };
    const snapshot = workbookClaimSnapshot(book, block.id, "A")!;
    const claim: WorkbookClaim = { schemaVersion: 1, text: "A visual observation", evidence: [{ kind: "snapshot", blockId: block.id, slot: "A", hash: structuralHash(snapshot) }] };
    expect(assessWorkbookClaim(claim, book, null).status).toBe("unverified");
    block.visualize.snapshotA = { ...snapshot, capturedAt: 2 };
    expect(assessWorkbookClaim(claim, book, null).status).toBe("stale");
  });
  it("retains checker and exact citations through a checksummed Project Workbook resource", () => {
    const { book, project, claim } = fixture(); const block = book.stages[3]!.blocks.find(item => item.type === "assert")!;
    block.claim = { ...claim, checker: { kind: "scalar-range", evidenceIndex: 0, field: "length", min: 0, max: 100 } };
    const adopted = prepareProjectWorkbook(project, book, "claim"), reopened = readProjectWorkbook(adopted.bytes, adopted.reference);
    expect(reopened.stages[3]!.blocks.find(item => item.id === block.id)?.claim).toEqual(block.claim);
  });
});
