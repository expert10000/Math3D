export type WorkbookSageEvidence = {
  schemaVersion: 1;
  kind: "sage-result/v1";
  savedAt: number;
  source: {
    module: "surface" | "geometry" | "graphs" | "cas" | "number_theory" | "workbook";
    id: string;
    revision: number;
    expression: string;
    fingerprint: string;
  };
  request: {
    operation: string;
    params: Record<string, unknown>;
    backend: "local" | "docker" | "private";
    jobId?: string;
  };
  engine: { name: "SageMath"; backend: "local" | "docker" | "private"; version: string };
  response: {
    engine: string;
    operation: string;
    success: boolean;
    latex: string;
    result: Record<string, unknown>;
    warnings: string[];
    elapsedMs?: number;
    error?: string;
    errorCode?: string;
    engineVersion?: string;
  };
  diagnostics: string[];
};

export type WorkbookSageFreshness = "current" | "stale" | "source-unavailable";

/** A saved result is never silently treated as current when its source is absent. */
export function resolveWorkbookSageFreshness(
  saved: WorkbookSageEvidence["source"],
  current: WorkbookSageEvidence["source"] | null,
): WorkbookSageFreshness {
  if (!current || current.module !== saved.module || current.id !== saved.id) return "source-unavailable";
  return current.revision === saved.revision && current.expression === saved.expression &&
    current.fingerprint === saved.fingerprint ? "current" : "stale";
}
