/** Typed, revision-pinned algebra object output for a Workbook cell. */
import { canonicalJsonStringify, inspectProjectAlgebraFreshness, isStableDocumentId, isStructuralHash,
  parseAlgebraObjectRecord, structuralHash, type AlgebraObjectRecord, type AlgebraObjectRef,
  type Math3DProject, type StableDocumentId, type StructuralHash } from "@math3d/core";

export type WorkbookAlgebraObjectSource = Readonly<{ projectId: StableDocumentId;
  objectId: StableDocumentId; revision: number; contentHash: StructuralHash }>;
export type WorkbookAlgebraObjectOutput = Readonly<{ type: "algebra-object"; objectKind: AlgebraObjectRecord["definition"]["kind"];
  ref: AlgebraObjectRef; record: AlgebraObjectRecord }>;
export type WorkbookAlgebraObjectRun = Readonly<{ savedAt: number; source: WorkbookAlgebraObjectSource;
  output: WorkbookAlgebraObjectOutput; outputHash: StructuralHash }>;
export type WorkbookAlgebraObjectCell = Readonly<{ schemaVersion: 1; kind: "algebra-object-cell/v1";
  source: WorkbookAlgebraObjectSource; runs: readonly WorkbookAlgebraObjectRun[] }>;
export type WorkbookAlgebraObjectInspection = Readonly<{ status: "current" | "stale" | "missing" | "different-project" | "archived";
  reason: string; latestRevision: number | null }>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).sort().join("|") === keys.sort().join("|");
const same = (a: WorkbookAlgebraObjectSource, b: WorkbookAlgebraObjectSource) =>
  a.projectId === b.projectId && a.objectId === b.objectId && a.revision === b.revision && a.contentHash === b.contentHash;
const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;

export const parseWorkbookAlgebraObjectCell = (input: unknown): WorkbookAlgebraObjectCell => {
  if (!record(input) || !exact(input, ["schemaVersion", "kind", "source", "runs"]) ||
    input.schemaVersion !== 1 || input.kind !== "algebra-object-cell/v1" || !record(input.source) ||
    !exact(input.source, ["projectId", "objectId", "revision", "contentHash"]) ||
    !isStableDocumentId(input.source.projectId) || !isStableDocumentId(input.source.objectId) ||
    !Number.isSafeInteger(input.source.revision) || (input.source.revision as number) < 1 ||
    !isStructuralHash(input.source.contentHash) || !Array.isArray(input.runs) ||
    input.runs.length < 1 || input.runs.length > 8)
    throw new TypeError("Invalid typed Workbook algebra object cell.");
  const source = input.source as WorkbookAlgebraObjectSource;
  let previousTime = -1;
  const runs = input.runs.map((item: unknown) => {
    if (!record(item) || !exact(item, ["savedAt", "source", "output", "outputHash"]) ||
      !Number.isSafeInteger(item.savedAt) || (item.savedAt as number) < previousTime ||
      !record(item.source) || !exact(item.source, ["projectId", "objectId", "revision", "contentHash"]) ||
      !isStableDocumentId(item.source.projectId) || !isStableDocumentId(item.source.objectId) ||
      !Number.isSafeInteger(item.source.revision) || (item.source.revision as number) < 1 ||
      !isStructuralHash(item.source.contentHash) || !record(item.output) ||
      !exact(item.output, ["type", "objectKind", "ref", "record"]) || item.output.type !== "algebra-object" ||
      !record(item.output.ref) || !exact(item.output.ref, ["objectId", "revision"]) ||
      !isStructuralHash(item.outputHash)) throw new TypeError("Invalid typed Workbook algebra object run.");
    const object = parseAlgebraObjectRecord(item.output.record);
    const runSource = item.source as WorkbookAlgebraObjectSource;
    const output: WorkbookAlgebraObjectOutput = { type: "algebra-object", objectKind: object.definition.kind,
      ref: { objectId: object.id, revision: object.revision }, record: object };
    if (runSource.objectId !== object.id || runSource.revision !== object.revision ||
      runSource.contentHash !== object.contentHash || runSource.projectId !== source.projectId ||
      canonicalJsonStringify(item.output) !== canonicalJsonStringify(output) ||
      item.outputHash !== structuralHash(output))
      throw new TypeError("Workbook algebra object output differs from its pinned exact record.");
    previousTime = item.savedAt as number;
    return { savedAt: previousTime, source: runSource, output, outputHash: item.outputHash as StructuralHash };
  });
  if (!same(source, runs[runs.length - 1].source))
    throw new TypeError("Workbook algebra cell source must match its latest saved run.");
  return clone({ schemaVersion: 1 as const, kind: "algebra-object-cell/v1" as const, source, runs });
};

const latestRecord = (project: Math3DProject, objectId: StableDocumentId): AlgebraObjectRecord => {
  const entry = project.algebraObjects?.find((item) => item.id === objectId);
  const latest = entry?.revisions.at(-1);
  if (!entry || !latest || entry.archived ||
    inspectProjectAlgebraFreshness(project).find((item) => item.objectId === objectId)?.status !== "fresh")
    throw new TypeError("Choose a current, fresh Project algebra object before computing this cell.");
  return latest;
};
const runFor = (projectId: StableDocumentId, object: AlgebraObjectRecord, savedAt: number): WorkbookAlgebraObjectRun => {
  if (!Number.isSafeInteger(savedAt) || savedAt < 0) throw new TypeError("Invalid Workbook algebra run time.");
  const source: WorkbookAlgebraObjectSource = { projectId, objectId: object.id,
    revision: object.revision, contentHash: object.contentHash };
  const output: WorkbookAlgebraObjectOutput = { type: "algebra-object", objectKind: object.definition.kind,
    ref: { objectId: object.id, revision: object.revision }, record: object };
  return { savedAt, source, output, outputHash: structuralHash(output) };
};
export const createWorkbookAlgebraObjectCell = (project: Math3DProject, objectId: StableDocumentId,
  savedAt = Date.now()): WorkbookAlgebraObjectCell => {
  const run = runFor(project.identity.id, latestRecord(project, objectId), savedAt);
  return parseWorkbookAlgebraObjectCell({ schemaVersion: 1, kind: "algebra-object-cell/v1",
    source: run.source, runs: [run] });
};
export const recomputeWorkbookAlgebraObjectCell = (project: Math3DProject, input: WorkbookAlgebraObjectCell,
  savedAt = Date.now()): WorkbookAlgebraObjectCell => {
  const cell = parseWorkbookAlgebraObjectCell(input);
  if (cell.source.projectId !== project.identity.id) throw new TypeError("Open the cell's linked Project before recomputing.");
  const object = latestRecord(project, cell.source.objectId);
  const run = runFor(project.identity.id, object, savedAt);
  if (run.source.revision === cell.source.revision && run.source.contentHash === cell.source.contentHash)
    return cell;
  return parseWorkbookAlgebraObjectCell({ ...cell, source: run.source,
    runs: [...cell.runs, run].slice(-8) });
};
export const inspectWorkbookAlgebraObjectCell = (project: Math3DProject | null,
  input: WorkbookAlgebraObjectCell): WorkbookAlgebraObjectInspection => {
  const cell = parseWorkbookAlgebraObjectCell(input);
  if (!project) return { status: "missing", reason: "Open the linked Project to inspect this algebra object.", latestRevision: null };
  if (project.identity.id !== cell.source.projectId)
    return { status: "different-project", reason: "This cell belongs to another Project.", latestRevision: null };
  const entry = project.algebraObjects?.find((item) => item.id === cell.source.objectId);
  if (!entry) return { status: "missing", reason: "The pinned algebra object is absent from this Project.", latestRevision: null };
  const latest = entry.revisions.at(-1)!;
  if (entry.archived) return { status: "archived", reason: "The algebra object was archived.", latestRevision: latest.revision };
  const pinned = entry.revisions[cell.source.revision - 1];
  if (!pinned || pinned.contentHash !== cell.source.contentHash)
    return { status: "missing", reason: "The pinned algebra object revision or hash is missing.", latestRevision: latest.revision };
  if (latest.revision !== cell.source.revision)
    return { status: "stale", reason: `A newer algebra object revision ${latest.revision} is saved; recompute this cell.`, latestRevision: latest.revision };
  if (inspectProjectAlgebraFreshness(project).find((item) => item.objectId === entry.id)?.status !== "fresh")
    return { status: "stale", reason: "A parent algebra definition advanced; update the object before recomputing.", latestRevision: latest.revision };
  return { status: "current", reason: "Saved object revision and parent definitions match.", latestRevision: latest.revision };
};
