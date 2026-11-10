import type { ProjectResultCard } from "./projectResultCard";
import type { ProjectResultSourceLink } from "./projectResultSourceLink";
import type { ProjectResultVerification } from "./projectResultVerification";

export type ProjectResultActionPolicy = Readonly<{
  summary: "recorded" | "withheld";
  openCurrentSource: boolean;
  openExactSavedMesh: boolean;
  createVerifiedReport: boolean;
  exportVerifiedReport: boolean;
  exportEvidence: true;
  reason: string;
}>;

/** Current-value and derivation actions share one gate; evidence export preserves omissions. */
export function projectResultActionPolicy(input: Readonly<{
  card: ProjectResultCard;
  verification: ProjectResultVerification;
  sourceLink: ProjectResultSourceLink;
  savedMeshChecked?: boolean;
  canCreateReport?: boolean;
  canExportReport?: boolean;
}>): ProjectResultActionPolicy {
  const completed = input.card.execution.label === "Completed";
  const sourceQualified = input.card.integrity.label === "Source verified" ||
    input.card.integrity.label === "Snapshot current";
  const summary = completed && sourceQualified ? "recorded" : "withheld";
  const verifiedReport = completed && input.card.integrity.label === "Source verified" &&
    input.verification.scope === "source-only";
  return {
    summary,
    openCurrentSource: input.sourceLink.status === "current",
    openExactSavedMesh: Boolean(input.savedMeshChecked),
    createVerifiedReport: verifiedReport && Boolean(input.canCreateReport),
    exportVerifiedReport: verifiedReport && Boolean(input.canExportReport),
    exportEvidence: true,
    reason: summary === "recorded" ? "Saved values may be shown as recorded evidence; mathematical correctness is not inferred." :
      !completed ? input.card.execution.detail : input.card.integrity.detail,
  };
}
