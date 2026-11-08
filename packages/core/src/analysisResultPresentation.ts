import type { AnalysisResultStatus } from "./analysisResults";

export type AnalysisResultClaim = Readonly<{
  label: string;
  meaning: string;
  outcome: "result" | "limited" | "none";
}>;

/** Describes the producer's recorded mathematical claim, independently of source freshness. */
const CLAIMS: Readonly<Record<AnalysisResultStatus, AnalysisResultClaim>> = {
  exact: { label: "Recorded exact result", meaning: "The producer recorded exact mathematics; Project source and evidence checks are separate.", outcome: "result" },
  certified: { label: "Recorded certified result", meaning: "The producer recorded a certificate; this view does not independently verify it.", outcome: "result" },
  numerical: { label: "Recorded numerical result", meaning: "Values are numerical approximations under the recorded method and precision.", outcome: "result" },
  recognized: { label: "Recorded recognition", meaning: "The producer recognized a pattern without an exact proof in this result.", outcome: "limited" },
  heuristic: { label: "Recorded heuristic", meaning: "The producer recorded a heuristic estimate without a proof guarantee.", outcome: "limited" },
  unsupported: { label: "Unsupported operation", meaning: "The requested operation has no supported result on this route.", outcome: "none" },
  failed: { label: "Failed operation", meaning: "The operation did not complete successfully.", outcome: "none" },
  cancelled: { label: "Cancelled operation", meaning: "The operation was cancelled before a result completed.", outcome: "none" },
};

export const presentAnalysisResultClaim = (status: AnalysisResultStatus): AnalysisResultClaim => CLAIMS[status];
