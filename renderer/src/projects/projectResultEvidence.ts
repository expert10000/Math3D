import type { AnalysisResultEnvelope } from "@math3d/core";
import type { ProjectDependencyInspection } from "./projectDependencies";
import type { ProjectResultCard } from "./projectResultCard";

type Dependency = ProjectDependencyInspection["results"][number];

/** Export a qualified record, not a fresh computation or an invented certificate. */
export function createProjectResultEvidence(result: AnalysisResultEnvelope, card: ProjectResultCard,
  dependency: Dependency | undefined) {
  const ready = card.execution.label === "Completed";
  const status = !ready ? "withheld" as const :
    card.integrity.label === "Source verified" || card.integrity.label === "Snapshot current" ?
      "recorded-only" as const : "withheld" as const;
  return {
    schema: "math3d.project-result-evidence/v1" as const,
    resultId: result.resultId,
    source: result.provenance.source,
    operation: result.provenance.operation,
    engine: result.provenance.engine,
    authority: result.status,
    assessment: { status, execution: card.execution.label,
      integrity: card.integrity.label, mathematics: card.mathematics.label,
      explanation: card.integrity.label === "Source verified" ?
        "External bytes passed the last result-specific check; this export did not reopen them." :
        card.integrity.detail,
      omissions: status === "withheld" ? ["summary values"] : [] },
    summary: status === "withheld" ? null : result.summary,
    artifactHandles: result.artifacts,
    missingArtifactIds: dependency?.missingArtifactIds ?? result.artifacts.map(item => item.artifactId),
    warnings: result.warnings,
    diagnostics: result.diagnostics,
  };
}
