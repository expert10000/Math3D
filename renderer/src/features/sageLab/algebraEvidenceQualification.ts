import { inspectProjectAlgebraFreshness, parseProjectAlgebraEvidence,
  type Math3DProject, type ProjectAlgebraEvidence } from "@math3d/core";

export type AlgebraEvidenceQualification = Readonly<{
  status: "current" | "historical" | "stale" | "archived" | "invalid";
  reason: string;
  resultId: string;
  objectId: string;
  revision: number;
  definitionHash: string;
  canUseResult: boolean;
  canDerive: boolean;
}>;

/** Integrity, pinned definition and current registry lineage are separate questions. */
export function qualifyAlgebraEvidence(project: Math3DProject,
  evidence: ProjectAlgebraEvidence): AlgebraEvidenceQualification {
  const base = { resultId: evidence.id, objectId: evidence.request.target.objectId,
    revision: evidence.request.target.revision, definitionHash: evidence.targetHash };
  try {
    parseProjectAlgebraEvidence(evidence, project.identity.id, project.algebraObjects ?? []);
  } catch (error) {
    return { ...base, status: "invalid", reason: error instanceof Error ? error.message :
      "Saved evidence failed integrity checks.", canUseResult: false, canDerive: false };
  }
  const entry = project.algebraObjects?.find(item => item.id === base.objectId);
  const pinned = entry?.revisions[base.revision - 1];
  if (!pinned || pinned.contentHash !== base.definitionHash)
    return { ...base, status: "invalid", reason: "Pinned definition is missing or changed.",
      canUseResult: false, canDerive: false };
  if (entry?.archived)
    return { ...base, status: "archived", reason: "The source object is archived.",
      canUseResult: true, canDerive: false };
  if (entry?.revisions.at(-1)?.revision !== base.revision)
    return { ...base, status: "historical", reason: "A newer object revision is current.",
      canUseResult: true, canDerive: false };
  if (inspectProjectAlgebraFreshness(project).find(item => item.objectId === base.objectId)?.status !== "fresh")
    return { ...base, status: "stale", reason: "A parent definition has changed.",
      canUseResult: true, canDerive: false };
  return { ...base, status: "current", reason: "Pinned definition and parent revisions match the current registry.",
    canUseResult: true, canDerive: true };
}
