import type { ProjectResultCard } from "./projectResultCard";
import type { ProjectResultSourceLink } from "./projectResultSourceLink";
import type { ProjectResultVerification } from "./projectResultVerification";
import type { SavedRegionSourceStatus } from "../vectorfield3d/checkSavedRegionResultSources";

export type ProjectResultActionPolicy = Readonly<{
  summary: "recorded" | "partial" | "withheld";
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
  regionStatus?: SavedRegionSourceStatus;
}>): ProjectResultActionPolicy {
  const completed = input.card.execution.label === "Completed";
  const sourceQualified = input.card.integrity.label === "Source verified" ||
    input.card.integrity.label === "Snapshot current";
  const components = input.regionStatus && typeof input.regionStatus === "object" ?
    Object.entries(input.regionStatus).filter(([key, value]) => key !== "kind" && value !== undefined)
      .map(([, value]) => value) : [];
  const partial = completed && !sourceQualified &&
    (input.card.integrity.label === "Changed source" ||
      input.card.integrity.label === "Missing source" ||
      input.card.integrity.label === "Checking sources" ||
      input.card.integrity.label === "Verification failed") &&
    components.includes("source-current") && components.some(value => value !== "source-current");
  const summary = completed && sourceQualified ? "recorded" : partial ? "partial" : "withheld";
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
      summary === "partial" ? "Only individually reverified components are shown; aggregate evidence export omits summary values." :
      !completed ? input.card.execution.detail : input.card.integrity.detail,
  };
}
