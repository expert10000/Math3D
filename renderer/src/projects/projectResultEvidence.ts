import type { AnalysisResultEnvelope } from "@math3d/core";
import type { ProjectDependencyInspection } from "./projectDependencies";
import type { ProjectResultCard } from "./projectResultCard";
import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";

type Dependency = ProjectDependencyInspection["results"][number];

/** Export a qualified record, not a fresh computation or an invented certificate. */
export function createProjectResultEvidence(result: AnalysisResultEnvelope, card: ProjectResultCard,
  dependency: Dependency | undefined) {
  const ready = card.execution.label === "Completed";
  const status = !ready ? "withheld" as const :
    card.integrity.label === "Source verified" || card.integrity.label === "Snapshot current" ?
      "recorded-only" as const : "withheld" as const;
  const publication = createResultPublication({ module: "project", resultId: result.resultId,
    source: { id: result.provenance.source.documentId, revision: result.provenance.source.revision,
      generation: result.provenance.source.generation,
      hash: result.provenance.source.structuralHash },
    sourceStatus: card.integrity.label, status: status === "recorded-only" ? "recorded" : "withheld",
    reason: ready ? card.integrity.detail : card.execution.detail,
    recordedClaim: card.mathematics.label,
    independentCheck: "Project export does not independently verify mathematical correctness.",
    summary: result.summary });
  return {
    schema: "math3d.project-result-evidence/v1" as const,
    resultId: result.resultId,
    source: result.provenance.source,
    operation: result.provenance.operation,
    engine: result.provenance.engine,
    authority: result.status,
    publication,
    assessment: { status, execution: card.execution.label,
      integrity: card.integrity.label, mathematics: card.mathematics.label,
      explanation: card.integrity.label === "Source verified" ?
        "External bytes passed the last result-specific check; this export did not reopen them." :
        card.integrity.detail,
      omissions: publication.assessment.omissions },
    summary: publication.summary,
    artifactHandles: result.artifacts,
    missingArtifactIds: dependency?.missingArtifactIds ?? result.artifacts.map(item => item.artifactId),
    warnings: result.warnings,
    diagnostics: result.diagnostics,
  };
}

/** Two-column, spreadsheet-safe view of the same qualified evidence as the JSON export. */
export function createProjectResultEvidenceCsv(evidence: ReturnType<typeof createProjectResultEvidence>): string {
  const fields: ReadonlyArray<readonly [string, unknown]> = [
    ["schema", evidence.schema], ["resultId", evidence.resultId],
    ["source.documentId", evidence.source.documentId],
    ["source.revision", evidence.source.revision],
    ["source.generation", evidence.source.generation],
    ["source.structuralHash", evidence.source.structuralHash],
    ["operation.type", evidence.operation.type],
    ["operation.algorithm", evidence.operation.algorithm],
    ["operation.algorithmVersion", evidence.operation.algorithmVersion],
    ["operation.parameters", evidence.operation.parameters],
    ["engine.name", evidence.engine.name], ["engine.version", evidence.engine.version],
    ["authority", evidence.authority],
    ["assessment.status", evidence.assessment.status],
    ["assessment.execution", evidence.assessment.execution],
    ["assessment.integrity", evidence.assessment.integrity],
    ["assessment.mathematics", evidence.assessment.mathematics],
    ["assessment.explanation", evidence.assessment.explanation],
    ["assessment.omissions", evidence.assessment.omissions],
    ["summary", evidence.summary],
    ["artifactHandles", evidence.artifactHandles],
    ["missingArtifactIds", evidence.missingArtifactIds],
    ["warnings", evidence.warnings], ["diagnostics", evidence.diagnostics],
  ];
  return resultEvidenceRowsCsv([...fields,
    ["publication.schema", evidence.publication.schema],
    ["publication.status", evidence.publication.assessment.status],
    ["publication.sourceStatus", evidence.publication.assessment.sourceStatus],
    ["publication.recordedClaim", evidence.publication.assessment.recordedClaim],
    ["publication.independentCheck", evidence.publication.assessment.independentCheck],
  ]);
}
