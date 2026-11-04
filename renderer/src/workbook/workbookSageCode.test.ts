import { describe, expect, it } from "vitest";
import {
  createBlockDependencySource, createDefaultWorkbook, resolveWorkbookFreshness,
  resolveWorkbookSageFreshness, workbookSageCodeDependencies, workbookSageCodeEvidence,
  workbookSageCodeRunStatus, workbookSageCodeSourceHash,
  workbookSageCodeOutputText,
  type Workbook, type WorkbookBlock, type WorkbookSageCodeRun,
} from "@math3d/workbook";

let nextId = 0;
const fixture = () => {
  const workbook = createDefaultWorkbook(() => `sage-test-${++nextId}`);
  const source = workbook.stages[0].blocks[1];
  const block: WorkbookBlock = { id: `sage-test-${++nextId}`, type: "sage-code", title: "Sage study",
    sageCode: { code: "2^10", runs: [] } };
  workbook.stages[1].blocks.push(block);
  workbook.dependencies = [{ id: `sage-test-${++nextId}`, targetBlockId: block.id,
    source: createBlockDependencySource(workbook, source.id) }];
  return { workbook, block, source };
};

describe("Workbook Sage code provenance", () => {
  it("saves the exact input and dependency generation and marks changes stale", () => {
    const { workbook, block, source } = fixture();
    const run: WorkbookSageCodeRun = { id: "job-1", savedAt: 1,
      sourceHash: workbookSageCodeSourceHash(workbook, block), code: block.sageCode!.code,
      dependencies: structuredClone(workbookSageCodeDependencies(workbook, block.id)), status: "succeeded",
      output: { jobId: "job-1", success: true, backendId: "sage-local-wsl", engineVersion: "9.5",
        stdout: "", result: "1024", warnings: [], inputHash: "a".repeat(64), elapsedMs: 5 } };
    block.sageCode!.runs.push(run);
    const savedEvidence = workbookSageCodeEvidence({ blockId: block.id, jobId: run.id,
      savedAt: run.savedAt, sourceHash: run.sourceHash, code: run.code, scope: "test-scope", output: run.output });
    expect(savedEvidence.request).toMatchObject({ operation: "sage.console.execute", backend: "local",
      jobId: "job-1", params: { code: "2^10", scope: "test-scope" } });
    expect(savedEvidence.engine.version).toBe("9.5");
    expect(savedEvidence.response.result).toMatchObject({ result: "1024", inputHash: "a".repeat(64) });
    expect(resolveWorkbookSageFreshness(savedEvidence.source, { ...savedEvidence.source,
      fingerprint: workbookSageCodeSourceHash(workbook, block) })).toBe("current");
    expect(workbookSageCodeOutputText(run)).toBe("1024");
    expect(workbookSageCodeOutputText({ ...run, status: "failed", output: { ...run.output!,
      success: false, stdout: "before error", result: "", error: "Traceback: bad input" } })).toContain("Traceback: bad input");
    expect(workbookSageCodeRunStatus(workbook, block)).toBe("current");
    expect(resolveWorkbookFreshness(workbook, null).get(block.id)?.status).toBe("current");

    const reopened = structuredClone(workbook) as Workbook;
    const reopenedBlock = reopened.stages[1].blocks[0];
    expect(reopenedBlock.sageCode?.runs[0].output?.result).toBe("1024");
    expect(workbookSageCodeRunStatus(reopened, reopenedBlock)).toBe("current");
    reopenedBlock.sageCode!.code = "2^11";
    expect(workbookSageCodeRunStatus(reopened, reopenedBlock)).toBe("stale");
    expect(resolveWorkbookSageFreshness(savedEvidence.source, { ...savedEvidence.source,
      expression: reopenedBlock.sageCode!.code, fingerprint: workbookSageCodeSourceHash(reopened, reopenedBlock) })).toBe("stale");
    expect(resolveWorkbookFreshness(reopened, null).get(reopenedBlock.id)?.status).toBe("stale");
    reopenedBlock.sageCode!.code = "2^10";
    reopened.stages[0].blocks[1].formula = "changed";
    expect(resolveWorkbookFreshness(reopened, null).get(reopenedBlock.id)?.status).toBe("stale");
    expect(reopened.dependencies?.[0].source.kind).toBe("block");
    expect(source.formula).not.toBe(reopened.stages[0].blocks[1].formula);
  });
});
