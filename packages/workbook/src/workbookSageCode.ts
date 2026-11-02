import { structuralHash, type CanonicalJsonValue, type StructuralHash } from "@math3d/core";
import type { Workbook, WorkbookBlock } from "./workbookModel";
import type { WorkbookDependency } from "./workbookDependencies";

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
  error?: string;
}>;

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
