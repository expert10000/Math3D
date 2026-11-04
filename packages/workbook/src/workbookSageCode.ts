import { structuralHash, type CanonicalJsonValue, type StructuralHash } from "@math3d/core";
import type { Workbook, WorkbookBlock } from "./workbookModel";
import type { WorkbookDependency } from "./workbookDependencies";
import type { WorkbookSageEvidence } from "./workbookSageEvidence";

export type WorkbookSageCodeOutput = Readonly<{
  jobId: string;
  success: boolean;
  backendId: "sage-local-wsl";
  engineVersion?: string;
  stdout: string;
  result: string;
  error?: string;
  warnings: string[];
  inputHash: string;
  elapsedMs: number;
}>;

export type WorkbookSageCodeRun = Readonly<{
  id: string;
  savedAt: number;
  sourceHash: StructuralHash;
  code: string;
  dependencies: readonly WorkbookDependency[];
  status: "succeeded" | "failed" | "cancelled";
  output: WorkbookSageCodeOutput | null;
  evidence?: WorkbookSageEvidence;
  error?: string;
}>;

export function workbookSageCodeEvidence(input: {
  blockId: string; jobId: string; savedAt: number; sourceHash: StructuralHash; code: string;
  scope: string; output: WorkbookSageCodeOutput | null; error?: string;
}): WorkbookSageEvidence {
  const { output } = input;
  const error = input.error ?? output?.error;
  return {
    schemaVersion: 1, kind: "sage-result/v1", savedAt: input.savedAt,
    source: { module: "workbook", id: `workbook:${input.blockId}`, revision: 1,
      expression: input.code, fingerprint: input.sourceHash },
    request: { operation: "sage.console.execute", params: { code: input.code, scope: input.scope },
      backend: "local", jobId: input.jobId },
    engine: { name: "SageMath", backend: "local", version: output?.engineVersion ?? "unreported" },
    response: { engine: "sagemath", operation: "sage.console.execute", success: output?.success ?? false,
      latex: "", result: output ? { ...output } : {}, warnings: output?.warnings ?? [],
      ...(output ? { elapsedMs: output.elapsedMs } : {}), ...(error ? { error } : {}),
      ...(output?.engineVersion ? { engineVersion: output.engineVersion } : {}) },
    diagnostics: [...(output?.warnings ?? []), ...(error ? [error] : []),
      ...(output?.engineVersion ? [] : ["SageMath version was not reported by this worker."])],
  };
}

export const workbookSageCodeDependencies = (workbook: Workbook, blockId: string): readonly WorkbookDependency[] =>
  (workbook.dependencies ?? []).filter((edge) => edge.targetBlockId === blockId)
    .sort((left, right) => left.id.localeCompare(right.id));

export function workbookSageCodeSourceHash(workbook: Workbook, block: WorkbookBlock): StructuralHash {
  const data = { code: block.sageCode?.code ?? "", dependencies: workbookSageCodeDependencies(workbook, block.id) };
  return structuralHash(JSON.parse(JSON.stringify(data)) as CanonicalJsonValue);
}

export function workbookSageCodeRunStatus(workbook: Workbook, block: WorkbookBlock): "pending" | "current" | "stale" | "failed" {
  const run = block.sageCode?.runs?.at(-1);
  if (!run) return "pending";
  if (run.sourceHash !== workbookSageCodeSourceHash(workbook, block)) return "stale";
  return run.status === "succeeded" ? "current" : run.status === "failed" ? "failed" : "stale";
}

export function workbookSageCodeOutputText(run: WorkbookSageCodeRun): string {
  const parts = [run.output?.stdout, run.output?.result, run.output?.error ?? run.error].filter((part): part is string => !!part);
  return parts.join("\n").trim() || "No output";
}
