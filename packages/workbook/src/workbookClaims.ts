import { PROJECT_NOTE_RESULT_VALUE_FIELDS, isStructuralHash, structuralHash, type Math3DProject, type StructuralHash } from "@math3d/core";
import { inspectNotebookReference, normalizeNotebookReference, type NotebookReference } from "./notebookReferences";
import type { Workbook, WorkbookViewSnapshot } from "./workbookModel";

export type WorkbookClaimEvidence =
  | Readonly<{ kind: "result"; reference: Extract<NotebookReference, { kind: "result" }> }>
  | Readonly<{ kind: "snapshot"; blockId: string; slot: "A" | "B"; hash: StructuralHash }>;
export type WorkbookClaim = Readonly<{ schemaVersion: 1; text: string; evidence: readonly WorkbookClaimEvidence[];
  checker?: Readonly<{ kind: "scalar-range"; evidenceIndex: number; field: typeof PROJECT_NOTE_RESULT_VALUE_FIELDS[number]; min: number; max: number }> }>;
export const workbookClaimSnapshot = (workbook: Workbook, blockId: string, slot: "A" | "B"): WorkbookViewSnapshot | null => {
  const block = workbook.stages.flatMap(stage => stage.blocks).find(item => item.id === blockId && item.type === "visualize");
  return (slot === "A" ? block?.visualize?.snapshotA ?? block?.visualize?.snapshot : block?.visualize?.snapshotB) ?? null;
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
export function normalizeWorkbookClaim(value: unknown): WorkbookClaim {
  if (!record(value) || !keys(value, ["schemaVersion", "text", "evidence", "checker"]) || value.schemaVersion !== 1 || typeof value.text !== "string" || value.text.length > 4096 ||
    !Array.isArray(value.evidence) || value.evidence.length > 8) throw new TypeError("Claims require bounded text and up to eight exact citations.");
  for (const item of value.evidence) {
    if (!record(item) || (item.kind === "result" ? !keys(item, ["kind", "reference"]) || !normalizeNotebookReference(item.reference) || (item.reference as NotebookReference).kind !== "result" :
      item.kind !== "snapshot" || !keys(item, ["kind", "blockId", "slot", "hash"]) || typeof item.blockId !== "string" || !item.blockId || item.blockId.length > 256 || !["A", "B"].includes(item.slot as string) || !isStructuralHash(item.hash)))
      throw new TypeError("Invalid claim evidence citation.");
  }
  if (value.checker !== undefined) {
    const check = value.checker;
    if (!record(check) || Object.keys(check).sort().join("|") !== "evidenceIndex|field|kind|max|min" || check.kind !== "scalar-range" ||
      !Number.isInteger(check.evidenceIndex) || (check.evidenceIndex as number) < 0 || (check.evidenceIndex as number) >= value.evidence.length || value.evidence[check.evidenceIndex as number].kind !== "result" ||
      !PROJECT_NOTE_RESULT_VALUE_FIELDS.includes(check.field as typeof PROJECT_NOTE_RESULT_VALUE_FIELDS[number]) || typeof check.min !== "number" || typeof check.max !== "number" ||
      !Number.isFinite(check.min) || !Number.isFinite(check.max) || check.min > check.max) throw new TypeError("Choose a cited result, supported scalar field and finite inclusive bounds.");
  }
  return JSON.parse(JSON.stringify(value));
}

/** Checks only the declared scalar interval in reported units. It never proves arbitrary prose. */
export function assessWorkbookClaim(claim: WorkbookClaim, workbook: Workbook, project: Math3DProject | null): { status: "unverified" | "supported" | "contradicted" | "stale"; reason: string; value?: number } {
  normalizeWorkbookClaim(claim);
  const inspections = claim.evidence.map(item => item.kind === "result" ? project ? inspectNotebookReference(project, item.reference) : null : null);
  for (const [index, item] of claim.evidence.entries()) {
    if (item.kind === "result" && inspections[index]?.status !== "current") return { status: "stale", reason: inspections[index]?.reason ?? "Open the cited Project to resolve this evidence." };
    if (item.kind === "snapshot") {
      const snapshot = workbookClaimSnapshot(workbook, item.blockId, item.slot);
      if (!snapshot || structuralHash(snapshot) !== item.hash) return { status: "stale", reason: "Cited snapshot changed or is unavailable; its citation has not been rebound." };
    }
  }
  if (!claim.text.trim() || !claim.checker) return { status: "unverified", reason: "Citations provide context. An explicit bounded checker is required for support or contradiction." };
  const check = claim.checker, result = inspections[check.evidenceIndex]?.result;
  if (!result || !["exact", "certified", "numerical"].includes(result.status)) return { status: "unverified", reason: `Authority ${result?.status ?? "unavailable"} cannot establish this scalar check.` };
  let scalar: unknown = result.summary;
  for (const key of check.field.split(".")) scalar = record(scalar) && Object.hasOwn(scalar, key) ? scalar[key] : undefined;
  if (typeof scalar !== "number" || !Number.isFinite(scalar)) return { status: "unverified", reason: "The saved summary does not report this finite scalar; no value was inferred." };
  return { status: scalar >= check.min && scalar <= check.max ? "supported" : "contradicted", value: scalar,
    reason: `Bounded scalar check: ${check.field} = ${scalar}, inclusive [${check.min}, ${check.max}] in reported units. Authority: ${result.status}; method: ${result.provenance.operation.algorithm}. This checks the interval, not a proof of the claim text.` };
}
