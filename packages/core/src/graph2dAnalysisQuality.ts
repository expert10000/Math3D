/** Quality describes the evidence for a result, independently of its numerical value. */
export const GRAPH2D_ANALYSIS_QUALITIES = ["approximate", "refined", "certified", "symbolic", "incomplete"] as const;
export type Graph2DAnalysisQuality = (typeof GRAPH2D_ANALYSIS_QUALITIES)[number];
export type Graph2DNumericalCandidateQuality = Extract<Graph2DAnalysisQuality, "approximate" | "refined">;

export const GRAPH2D_ANALYSIS_QUALITY_MEANINGS: Readonly<Record<Graph2DAnalysisQuality, string>> = {
  approximate: "Candidate found by sampling; a small residual alone does not establish a root or completeness.",
  refined: "A numerical bracket solver met the stated residual tolerance; uniqueness and completeness are not proven.",
  certified: "A method establishes its stated guarantee under explicit assumptions and a verified bound.",
  symbolic: "A result is derived exactly within supported symbolic rules.",
  incomplete: "The search ended early or unresolved regions leave completeness unknown.",
};

/** These bounded Graph solvers currently supply no certification or exact symbolic root proof. */
export const graph2DQualityForNumericalCandidate = (candidate: Readonly<{
  method: "sample" | "bracket-bisection" | "minimum-absolute-residual";
  confidence: "numerical" | "heuristic";
  residual: number;
}>, residualTolerance: number): Graph2DNumericalCandidateQuality =>
  candidate.method === "bracket-bisection" && candidate.confidence === "numerical" &&
  Number.isFinite(candidate.residual) && candidate.residual >= 0 &&
  Number.isFinite(residualTolerance) && residualTolerance > 0 &&
  candidate.residual <= residualTolerance ? "refined" : "approximate";

/** Finishing a bounded scan does not certify exhaustive enumeration. */
export const graph2DQualityForScan = (status: "complete" | "incomplete" | "unavailable"):
  "approximate" | "incomplete" | null =>
  status === "unavailable" ? null : status === "incomplete" ? "incomplete" : "approximate";
