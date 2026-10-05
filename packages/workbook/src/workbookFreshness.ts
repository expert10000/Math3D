import type { Math3DProject } from "@math3d/core";
import { inspectWorkbookDependency } from "./workbookDependencies";
import { inspectNotebookReference } from "./notebookReferences";
import type { Workbook, WorkbookBlock } from "./workbookModel";

export type WorkbookFreshnessStatus = "current" | "stale" | "missing" | "failed";
export type WorkbookBlockFreshness = Readonly<{
  status: WorkbookFreshnessStatus;
  reason: string;
  /** Stable block IDs from the first affected source to this block. */
  path: readonly string[];
  edgeId?: string;
  /** A source must be refreshed or repaired before this block can run against it. */
  blockedBySource: boolean;
}>;

type IntrinsicStatus = "ok" | "stale" | "failed" | "disabled";
const priority: Record<WorkbookFreshnessStatus, number> = { current: 0, stale: 1, missing: 2, failed: 3 };

export function workbookNeedsProjectInspection(workbook: Workbook): boolean {
  return !!workbook.dependencies?.some((edge) => edge.source.kind !== "block") ||
    workbook.stages.some((stage) => stage.blocks.some((block) => block.type === "reference" && !!block.notebookReference));
}

/** Derives affected blocks without changing runs or scheduling work. */
export function resolveWorkbookFreshness(
  workbook: Workbook,
  project: Math3DProject | null,
  intrinsicComputeStatus: Readonly<Record<string, IntrinsicStatus>> = {},
): ReadonlyMap<string, WorkbookBlockFreshness> {
  const blocks = new Map<string, WorkbookBlock>(workbook.stages.flatMap((stage) => stage.blocks.map((block) => [block.id, block] as const)));
  const incoming = new Map<string, NonNullable<Workbook["dependencies"]>>();
  for (const edge of workbook.dependencies ?? []) incoming.set(edge.targetBlockId, [...incoming.get(edge.targetBlockId) ?? [], edge]);
  const resolved = new Map<string, WorkbookBlockFreshness>();
  const visiting = new Set<string>();
  const visit = (id: string): WorkbookBlockFreshness => {
    const cached = resolved.get(id);
    if (cached) return cached;
    if (visiting.has(id)) return { status: "failed", reason: "Workbook dependency cycle.", path: [id], blockedBySource: true };
    const block = blocks.get(id);
    if (!block) return { status: "missing", reason: "Workbook block is missing.", path: [id], blockedBySource: true };
    visiting.add(id);
    const reference = block.type === "reference" && block.notebookReference
      ? project ? inspectNotebookReference(project, block.notebookReference)
        : { status: "missing" as const, reason: "Open the linked Project to inspect this reference." }
      : null;
    const base = block.enabled === false || intrinsicComputeStatus[id] === "disabled"
      ? { status: "missing" as const, reason: "Block is disabled.", path: [id], blockedBySource: false }
      : intrinsicComputeStatus[id] === "failed" || block.type === "assert" && block.assert?.status === "fail"
        ? { status: "failed" as const, reason: "Block failed.", path: [id], blockedBySource: false }
        : reference && reference.status !== "current"
          ? { status: reference.status === "different-project" ? "missing" as const : reference.status,
            reason: reference.reason, path: [id], blockedBySource: true }
        : intrinsicComputeStatus[id] === "stale"
          ? { status: "stale" as const, reason: "Compute inputs or parameters changed.", path: [id], blockedBySource: false }
          : { status: "current" as const, reason: "Sources match.", path: [id], blockedBySource: false };
    let state: WorkbookBlockFreshness = base;
    for (const edge of incoming.get(id) ?? []) {
      const check = inspectWorkbookDependency(edge, workbook, project);
      const sourceState = edge.source.kind === "block" ? visit(edge.source.blockId) : null;
      const direct: WorkbookFreshnessStatus = check.status === "invalid" || check.status === "different-project"
        ? "missing" : check.status;
      const candidate: WorkbookBlockFreshness = sourceState && sourceState.status !== "current" && priority[sourceState.status] >= priority[direct]
        ? { status: sourceState.status, reason: `Upstream block: ${sourceState.reason}`,
          path: [...sourceState.path, id], edgeId: edge.id, blockedBySource: true }
        : { status: direct, reason: check.reason,
          path: edge.source.kind === "block" ? [edge.source.blockId, id] : [id], edgeId: edge.id,
          blockedBySource: edge.source.kind === "block" ? !!sourceState && sourceState.status !== "current"
            : direct !== "current" };
      const blockedBySource = state.blockedBySource || candidate.blockedBySource;
      if (priority[candidate.status] > priority[state.status]) state = { ...candidate, blockedBySource };
      else state = { ...state, blockedBySource };
    }
    visiting.delete(id);
    resolved.set(id, state);
    return state;
  };
  for (const id of blocks.keys()) visit(id);
  return resolved;
}
