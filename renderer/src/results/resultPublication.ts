export type ResultPublicationStatus = "recorded" | "withheld" | "preview";

export type ResultPublicationSource = Readonly<{
  id: string;
  revision: number | null;
  generation: number | null;
  hash: string | null;
}>;

export type ResultPublicationInput<T> = Readonly<{
  module: "project" | "geometry" | "graph2d" | "vector3d" | "cas" | "quantum" | "mesh" | "surface" | "curve" | "workbook" | "study" | "comparison";
  resultId: string;
  source: ResultPublicationSource;
  sourceStatus: string;
  status: ResultPublicationStatus;
  reason: string;
  recordedClaim: string;
  independentCheck: string;
  summary: T;
}>;

/** Module-independent receipt. Producer claims and source checks remain separate. */
export function createResultPublication<T>(input: ResultPublicationInput<T>) {
  const recorded = input.status === "recorded";
  return {
    schema: "math3d.result-publication/v1" as const,
    module: input.module,
    resultId: input.resultId,
    source: input.source,
    assessment: {
      status: input.status,
      sourceStatus: input.sourceStatus,
      reason: input.reason,
      recordedClaim: input.recordedClaim,
      independentCheck: input.independentCheck,
      omissions: recorded ? [] : ["summary values"],
    },
    summary: recorded ? input.summary : null,
  };
}

export type ResultPublication<T> = ReturnType<typeof createResultPublication<T>>;

/** Stable standalone receipt for consumers that do not parse module-specific reports. */
export function resultPublicationJson(publication: ResultPublication<unknown>): string {
  return JSON.stringify(publication, null, 2) + "\n";
}

/** Shared two-column evidence CSV: stable row order, CRLF and spreadsheet-safe cells. */
export function resultEvidenceRowsCsv(rows: ReadonlyArray<readonly [string, unknown]>): string {
  const cell = (value: unknown): string => {
    const raw = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return ["field,value", ...rows.map(([key, value]) => `${cell(key)},${cell(value)}`)].join("\r\n") + "\r\n";
}
