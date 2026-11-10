import type { ScientificSourceGeneration } from "@math3d/core";
import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";

export type Graph2DResultEvidenceInput = Readonly<{
  current: boolean;
  preview?: boolean;
  resultId: string;
  source: ScientificSourceGeneration;
  claim: string;
  method: string;
  limitation: string;
  units: string;
  summary?: Readonly<Record<string, string | number | boolean | null>>;
}>;

/** Shared bounded Inspector record; rows and sampled series stay in their specialized exports. */
export function createGraph2DResultEvidence(input: Graph2DResultEvidenceInput) {
  const status = input.preview ? "preview" as const : input.current ? "current" as const :
    "historical" as const;
  const publication = createResultPublication({ module: "graph2d", resultId: input.resultId,
    source: { id: input.source.documentId, revision: input.source.revision,
      generation: input.source.generation, hash: input.source.structuralHash },
    sourceStatus: status,
    status: status === "current" ? "recorded" : status === "preview" ? "preview" : "withheld",
    reason: status === "current" ? "The exact Graph source and analysis options qualify this result." :
      status === "preview" ? "Transient viewport or parameter preview; no committed result values are published." :
        "The Graph source, selection or analysis options changed.",
    recordedClaim: input.claim,
    independentCheck: `No independent mathematical check is recorded. ${input.limitation}`,
    summary: input.summary ?? {} });
  return {
    schema: "math3d.graph2d-result-evidence/v1" as const,
    resultId: input.resultId,
    publication,
    source: input.source,
    claim: input.claim,
    method: input.method,
    units: input.units,
    assessment: { status, mathematicalCheck: "No independent mathematical check is recorded.",
      limitation: input.limitation,
      omissions: publication.assessment.omissions },
    summary: publication.summary,
  };
}

export type Graph2DResultEvidenceRecord = ReturnType<typeof createGraph2DResultEvidence>;

export const graph2DResultEvidenceJson = (evidence: Graph2DResultEvidenceRecord) =>
  JSON.stringify(evidence, null, 2) + "\n";

export function graph2DResultEvidenceCsv(evidence: Graph2DResultEvidenceRecord): string {
  const rows: ReadonlyArray<readonly [string, unknown]> = [
    ["schema", evidence.schema], ["resultId", evidence.resultId],
    ["source.documentId", evidence.source.documentId],
    ["source.revision", evidence.source.revision],
    ["source.generation", evidence.source.generation],
    ["source.structuralHash", evidence.source.structuralHash],
    ["claim", evidence.claim], ["method", evidence.method], ["units", evidence.units],
    ["assessment.status", evidence.assessment.status],
    ["assessment.mathematicalCheck", evidence.assessment.mathematicalCheck],
    ["assessment.limitation", evidence.assessment.limitation],
    ["assessment.omissions", evidence.assessment.omissions], ["summary", evidence.summary],
    ["publication.schema", evidence.publication.schema],
    ["publication.status", evidence.publication.assessment.status],
    ["publication.sourceStatus", evidence.publication.assessment.sourceStatus],
    ["publication.recordedClaim", evidence.publication.assessment.recordedClaim],
    ["publication.independentCheck", evidence.publication.assessment.independentCheck],
  ];
  return resultEvidenceRowsCsv(rows);
}
