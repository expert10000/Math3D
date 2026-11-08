import type { AnalysisResultEnvelope } from "@math3d/core";
import type { ProjectDependencyInspection } from "./projectDependencies";
import type { SavedRegionSourceStatus, SingleRegionSourceStatus } from "../vectorfield3d/checkSavedRegionResultSources";

type Tone = "current" | "stale" | "unavailable" | "broken";
type Axis = Readonly<{ label: string; detail: string; tone: Tone }>;
export type ProjectResultCard = Readonly<{ execution: Axis; integrity: Axis; mathematics: Axis }>;
type Dependency = ProjectDependencyInspection["results"][number];

const sourceState = (status: SavedRegionSourceStatus | undefined): SingleRegionSourceStatus => {
  if (!status) return "checking";
  if (typeof status === "string") return status;
  const values = Object.entries(status).filter(([key]) => key !== "kind")
    .map(([, value]) => value as SingleRegionSourceStatus);
  if (values.includes("changed")) return "changed";
  if (values.includes("missing")) return "missing";
  if (values.includes("error")) return "error";
  if (values.includes("checking")) return "checking";
  return "source-current";
};

/** Keep execution, source integrity and mathematical authority independent. */
export function presentProjectResultCard(result: AnalysisResultEnvelope, dependency: Dependency | undefined,
  regionStatus?: SavedRegionSourceStatus, requiresExternalSourceCheck = false): ProjectResultCard {
  const execution: Axis = result.status === "failed" ?
    { label: "Failed", detail: "The recorded operation failed.", tone: "broken" } :
    result.status === "cancelled" ?
      { label: "Cancelled", detail: "The recorded operation was cancelled.", tone: "unavailable" } :
      result.status === "unsupported" ?
        { label: "Unsupported", detail: "The operation could not run for this input.", tone: "unavailable" } :
        { label: "Completed", detail: "The producer recorded a result; this does not verify its sources or mathematics.", tone: "current" };
  const mathematics: Axis = ({
    exact: { label: "Recorded exact", detail: "The producer declared an exact result.", tone: "current" },
    certified: { label: "Recorded certified", detail: "The producer declared a certified result.", tone: "current" },
    numerical: { label: "Recorded numerical", detail: "Numerical output has no independent certificate here.", tone: "current" },
    recognized: { label: "Recorded recognized", detail: "The producer recognized a form; independent proof is not recorded here.", tone: "current" },
    heuristic: { label: "Recorded heuristic", detail: "The producer used a heuristic method.", tone: "stale" },
    unsupported: { label: "No result", detail: "The producer did not supply a supported result.", tone: "unavailable" },
    failed: { label: "No result", detail: "The operation failed before supplying a result.", tone: "broken" },
    cancelled: { label: "No result", detail: "The operation was cancelled.", tone: "unavailable" },
  } satisfies Record<AnalysisResultEnvelope["status"], Axis>)[result.status];
  let integrity: Axis;
  if (!dependency || dependency.sourceFreshness === "unavailable" || dependency.freshness === "unavailable")
    integrity = { label: "Source unavailable", detail: "A source generation or artifact is unavailable.", tone: "unavailable" };
  else if (dependency.freshness === "broken")
    integrity = { label: "Broken dependency", detail: "The recorded dependency chain is broken.", tone: "broken" };
  else if (dependency.sourceFreshness === "stale")
    integrity = { label: "Historical source", detail: "This result belongs to an older source generation.", tone: "stale" };
  else if (requiresExternalSourceCheck) {
    const state = sourceState(regionStatus);
    integrity = state === "source-current" ?
      { label: "Source verified", detail: "External source bytes passed the result-specific recheck.", tone: "current" } :
      state === "changed" ?
        { label: "Changed source", detail: "External source bytes differ from the recorded result.", tone: "stale" } :
        state === "missing" ?
          { label: "Missing source", detail: "A required external source is missing.", tone: "unavailable" } :
          state === "error" ?
            { label: "Verification failed", detail: "The external source check could not complete.", tone: "unavailable" } :
            { label: "Checking sources", detail: "External source bytes have not been verified yet.", tone: "unavailable" };
  } else integrity = { label: "Snapshot current",
    detail: "Recorded generations match this Project snapshot; external bytes and mathematics were not independently checked here.", tone: "current" };
  return { execution, integrity, mathematics };
}
