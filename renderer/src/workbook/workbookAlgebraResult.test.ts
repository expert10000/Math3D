import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraEvidence, createProjectAlgebraObjectId,
  upsertMath3DProjectAlgebraObject, upsertMath3DProjectWorkbook } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookAlgebraResult, inspectWorkbookAlgebraResult,
  normalizeWorkbookAlgebraResult, resolveWorkbookFreshness, validateWorkbookDependencies,
  workbookNeedsProjectInspection, recomputeWorkbookAlgebraResult } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { captureProjectResources, exportProjectPackage, parseProjectPackage,
  projectResourceInventory } from "../projects/projectResources";

describe("F04 typed algebra Workbook result", () => {
  it("retains an exact request and result after Project reopen, then marks an edited source stale", async () => {
    let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
      results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
      { stableKey: "f04", title: "Algebra workbook" });
    const id = createProjectAlgebraObjectId(project.identity.id, "ZZ");
    const first = createAlgebraObjectRecord({ id, revision: 1, label: "Integers",
      definition: { kind: "integer-ring" } });
    project = upsertMath3DProjectAlgebraObject(project, first);
    const request = buildAlgebraOperationRequest(project, { objectId: id, revision: 1 },
      "sage.numberTheory.gcd", "docker", { values: ["84", "30"] });
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { value: "6" }, { engine: "sagemath", version: "10.10", backend: "docker", jobId: "f04-gcd",
        elapsedMs: 15, warnings: [] });
    project = addMath3DProjectAlgebraEvidence(project, evidence);
    const cell = createWorkbookAlgebraResult(project, evidence);
    let sequence = 0;
    const workbook = createDefaultWorkbook(() => `f04-block-${++sequence}`);
    const block = workbook.stages[0]!.blocks[0]!;
    block.type = "reference"; block.algebraResult = cell;
    validateWorkbookDependencies(workbook);
    expect(workbookNeedsProjectInspection(workbook)).toBe(true);
    expect(resolveWorkbookFreshness(workbook, project).get(block.id)?.status).toBe("current");
    const saved = prepareProjectWorkbook(project, workbook, "f04");
    const bound = upsertMath3DProjectWorkbook(project, saved.reference);
    const packageBytes = exportProjectPackage(bound, captureProjectResources(bound,
      item => item.kind === "workbook-payload" ? saved.bytes : null, true));
    const restored = parseProjectPackage(packageBytes);
    const payload = projectResourceInventory(restored.project).find(item => item.kind === "workbook-payload")!;
    const reopened = readProjectWorkbook(restored.resources.bytes(payload)!, saved.reference);
    const reopenedCell = reopened.stages[0]!.blocks[0]!.algebraResult!;
    expect(reopenedCell.evidence.request).toEqual(request);
    expect(reopenedCell.evidence.result).toEqual({ value: "6" });
    expect(inspectWorkbookAlgebraResult(restored.project, reopenedCell).status).toBe("current");
    const recomputed = await recomputeWorkbookAlgebraResult(restored.project, reopenedCell, async (sameRequest) => {
      expect(sameRequest).toEqual(request);
      return { result: { value: "6" }, runtime: { engine: "sagemath", version: "10.10",
        backend: "docker", jobId: "f04-gcd-reopened", elapsedMs: 22, warnings: [] } };
    });
    expect(recomputed.evidence.result).toEqual({ value: "6" });
    expect(recomputed.evidence.runtime.jobId).toBe("f04-gcd-reopened");
    await expect(recomputeWorkbookAlgebraResult(restored.project, reopenedCell, async () => ({
      result: { value: "bad" }, runtime: { engine: "sagemath", version: "10.10",
        backend: "docker", jobId: "f04-bad", elapsedMs: 1, warnings: [] },
    }))).rejects.toThrow();
    const changed = upsertMath3DProjectAlgebraObject(restored.project, createAlgebraObjectRecord({ id,
      revision: 2, label: "Integer ring revised", definition: { kind: "integer-ring" } }));
    expect(inspectWorkbookAlgebraResult(changed, reopenedCell).status).toBe("stale");
    expect(resolveWorkbookFreshness(reopened, changed).get(block.id)?.status).toBe("stale");
    expect(inspectWorkbookAlgebraResult(null, reopenedCell).status).toBe("missing");
    expect(() => normalizeWorkbookAlgebraResult({ ...cell, evidence: { ...evidence,
      result: { value: "7" } } })).toThrow(/result hash/);
  });
});
