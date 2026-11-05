import { canonicalJsonByteLength, createProjectAlgebraEvidence, isStableDocumentId, isStructuralHash,
  parseAlgebraOperationResult,
  parseProjectAlgebraEvidence, structuralHash, type Math3DProject,
  type AlgebraOperationRequest, type ProjectAlgebraEvidence, type StableDocumentId, type StructuralHash } from "@math3d/core";

/** Immutable, typed Sage result pinned to a Project object revision. */
export type WorkbookAlgebraResult = Readonly<{
  schemaVersion: 1;
  projectId: StableDocumentId;
  objectId: StableDocumentId;
  revision: number;
  objectHash: StructuralHash;
  evidence: ProjectAlgebraEvidence;
}>;

export const createWorkbookAlgebraResult = (project: Math3DProject,
  evidence: ProjectAlgebraEvidence): WorkbookAlgebraResult => {
  const target = project.algebraObjects?.find((item) => item.id === evidence.request.target.objectId)
    ?.revisions[evidence.request.target.revision - 1];
  if (!target || project.identity.id !== evidence.projectId) throw new TypeError("Algebra result source is missing.");
  const checked = parseProjectAlgebraEvidence(evidence, project.identity.id, project.algebraObjects ?? []);
  return { schemaVersion: 1, projectId: project.identity.id, objectId: target.id,
    revision: target.revision, objectHash: target.contentHash, evidence: checked };
};

export const normalizeWorkbookAlgebraResult = (value: unknown): WorkbookAlgebraResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid algebra result cell.");
  const cell = value as Record<string, unknown>;
  if (Object.keys(cell).sort().join("|") !== "evidence|objectHash|objectId|projectId|revision|schemaVersion" ||
    cell.schemaVersion !== 1 || !isStableDocumentId(cell.projectId) ||
    !String(cell.projectId).startsWith("math3d:project:") ||
    !isStableDocumentId(cell.objectId) || !String(cell.objectId).startsWith("math3d:algebra:") ||
    !Number.isSafeInteger(cell.revision) || (cell.revision as number) < 1 ||
    !isStructuralHash(cell.objectHash) || !cell.evidence || typeof cell.evidence !== "object" ||
    canonicalJsonByteLength(cell) > 256 * 1024) throw new TypeError("Invalid or oversized algebra result cell.");
  const evidence = cell.evidence as ProjectAlgebraEvidence;
  if (evidence.projectId !== cell.projectId || evidence.targetHash !== cell.objectHash ||
    evidence.request?.target?.objectId !== cell.objectId || evidence.request.target.revision !== cell.revision ||
    structuralHash(evidence.result) !== evidence.resultHash)
    throw new TypeError("Algebra cell evidence does not match its pinned source or result hash.");
  parseAlgebraOperationResult(evidence.request, evidence.result);
  return cell as WorkbookAlgebraResult;
};

export const inspectWorkbookAlgebraResult = (project: Math3DProject | null, value: unknown):
  Readonly<{ status: "current" | "stale" | "missing"; reason: string }> => {
  let cell: WorkbookAlgebraResult;
  try { cell = normalizeWorkbookAlgebraResult(value); }
  catch { return { status: "missing", reason: "Invalid algebra cell evidence." }; }
  if (!project) return { status: "missing", reason: "Open the linked Project to inspect the algebra source." };
  if (project.identity.id !== cell.projectId) return { status: "missing", reason: "This algebra cell belongs to a different Project." };
  const entry = project.algebraObjects?.find((item) => item.id === cell.objectId);
  const pinned = entry?.revisions[cell.revision - 1];
  if (!pinned || pinned.contentHash !== cell.objectHash)
    return { status: "missing", reason: "The pinned algebra object revision is unavailable." };
  try { parseProjectAlgebraEvidence(cell.evidence, project.identity.id, project.algebraObjects ?? []); }
  catch { return { status: "missing", reason: "Saved algebra evidence failed Project validation." }; }
  const latest = entry!.revisions[entry!.revisions.length - 1];
  if (entry!.archived || latest.revision !== cell.revision || latest.contentHash !== cell.objectHash)
    return { status: "stale", reason: `Object changed after revision ${cell.revision}; result remains pinned to its original source.` };
  return { status: "current", reason: "Exact object revision and result hash match." };
};

/** Replays only a previously validated, pinned request; the caller supplies the bounded job runner. */
export const recomputeWorkbookAlgebraResult = async (project: Math3DProject, value: WorkbookAlgebraResult,
  run: (request: AlgebraOperationRequest) => Promise<{
    result: unknown; runtime: ProjectAlgebraEvidence["runtime"]
  }>): Promise<WorkbookAlgebraResult> => {
  const check = inspectWorkbookAlgebraResult(project, value);
  if (check.status === "missing") throw new TypeError(check.reason);
  const request = value.evidence.request;
  const output = await run(request);
  const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects ?? [],
    request, output.result, output.runtime);
  return createWorkbookAlgebraResult(project, evidence);
};
