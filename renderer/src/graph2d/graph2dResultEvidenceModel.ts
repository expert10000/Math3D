import type { ScientificSourceGeneration } from "@math3d/core";

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
  return {
    schema: "math3d.graph2d-result-evidence/v1" as const,
    resultId: input.resultId,
    source: input.source,
    claim: input.claim,
    method: input.method,
    units: input.units,
    assessment: { status, mathematicalCheck: "No independent mathematical check is recorded.",
      limitation: input.limitation,
      omissions: status === "current" ? [] : ["summary values"] },
    summary: status === "current" ? input.summary ?? {} : null,
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
  ];
  const cell = (value: unknown) => {
    const raw = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return ["field,value", ...rows.map(([field, value]) => `${cell(field)},${cell(value)}`)].join("\r\n") + "\r\n";
}
