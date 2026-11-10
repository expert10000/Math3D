import type { AnalysisParameterValue, AnalysisParameters } from "../analysis/contracts";
import type { GeometryAnalysisOutputKind } from "./analysisPipeline";
import type { GeometryAnalysisDomain, GeometryAnalysisResultState } from "./analysisInfrastructure";

export type GeometryInspectorLifecycleState =
  | "running"
  | "preview"
  | "complete"
  | "saved"
  | "failed"
  | "cancelled"
  | "stale"
  | "superseded";

export type GeometryAnalysisInspectorRecord = {
  id: string;
  resultKey: string;
  name: string;
  kind: string;
  sourceObjectId: string;
  sourceObjectName: string;
  sourceRevision: number;
  resultVersion: number;
  lifecycle: GeometryInspectorLifecycleState;
  domain: GeometryAnalysisDomain;
  quantity: string;
  method: string;
  units: string;
  precision: string;
  sampling: string;
  parameters: AnalysisParameters;
  requestedOutputs: readonly GeometryAnalysisOutputKind[];
  statistics: Readonly<Record<string, string | number | boolean | null>>;
  warnings: readonly string[];
  engine: string;
  computeTimeMs: number | null;
  createdAt: number;
  updatedAt: number;
  savedAt: number | null;
  payload: unknown;
};

export type GeometryAnalysisComparisonRow = {
  key: string;
  left: string;
  right: string;
  equal: boolean;
};

const displayValue = (value: unknown): string => {
  if (value == null) return "n/a";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "n/a";
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

export const geometryInspectorLifecycleState = (
  state: GeometryAnalysisResultState,
  options: { saved?: boolean; preview?: boolean; superseded?: boolean } = {}
): GeometryInspectorLifecycleState => {
  if (options.superseded) return "superseded";
  if (state === "stale") return "stale";
  if (state === "cancelled") return "cancelled";
  if (state === "error") return "failed";
  if (options.saved) return "saved";
  if (options.preview || state === "deferred") return "preview";
  if (state === "queued" || state === "running") return "running";
  return "complete";
};

export const canGeometryResultDriveViewport = (
  record: Pick<GeometryAnalysisInspectorRecord, "lifecycle" | "sourceRevision">,
  currentSourceRevision: number | null
): boolean =>
  (record.lifecycle === "complete" || record.lifecycle === "saved") &&
  currentSourceRevision !== null && record.sourceRevision === currentSourceRevision;

export type GeometryResultQualification = Readonly<{
  status: "current" | "historical" | "unavailable" | "incomplete";
  reason: string;
  valuesAvailable: boolean;
}>;

/** A matching revision only qualifies a result when the source still exists and execution completed. */
export const qualifyGeometryAnalysisRecord = (
  record: Pick<GeometryAnalysisInspectorRecord, "lifecycle" | "sourceRevision">,
  currentSourceRevision: number | null
): GeometryResultQualification => {
  if (currentSourceRevision === null) return { status: "unavailable", valuesAvailable: false,
    reason: "The recorded source object is missing." };
  if (record.sourceRevision !== currentSourceRevision ||
      record.lifecycle === "stale" || record.lifecycle === "superseded")
    return { status: "historical", valuesAvailable: false,
      reason: `The result belongs to source revision ${record.sourceRevision}; the current revision is ${currentSourceRevision}.` };
  if (record.lifecycle !== "complete" && record.lifecycle !== "saved")
    return { status: "incomplete", valuesAvailable: false,
      reason: `The recorded ${record.lifecycle} run has no completed result values.` };
  return { status: "current", valuesAvailable: true,
    reason: "The source object and recorded revision match; mathematical correctness was not independently checked." };
};

export const saveGeometryAnalysisRecord = (
  record: GeometryAnalysisInspectorRecord,
  now = Date.now()
): GeometryAnalysisInspectorRecord => ({
  ...record,
  lifecycle: "saved",
  savedAt: now,
  updatedAt: now,
});

export const renameGeometryAnalysisRecord = (
  record: GeometryAnalysisInspectorRecord,
  name: string,
  now = Date.now()
): GeometryAnalysisInspectorRecord => ({
  ...record,
  name: name.trim() || record.name,
  updatedAt: now,
});

export const markGeometryAnalysisRecordStale = (
  record: GeometryAnalysisInspectorRecord,
  currentSourceRevision: number | null,
  now = Date.now()
): GeometryAnalysisInspectorRecord =>
  currentSourceRevision !== null && record.sourceRevision === currentSourceRevision
    ? record
    : { ...record, lifecycle: "stale", updatedAt: now };

export const duplicateGeometryAnalysisSettings = (
  record: Pick<GeometryAnalysisInspectorRecord, "kind" | "domain" | "parameters" | "requestedOutputs">
): {
  kind: string;
  domain: GeometryAnalysisDomain;
  parameters: AnalysisParameters;
  requestedOutputs: readonly GeometryAnalysisOutputKind[];
} => ({
  kind: record.kind,
  domain: record.domain,
  parameters: structuredClone(record.parameters),
  requestedOutputs: [...record.requestedOutputs],
});

export const compareGeometryAnalysisRecords = (
  left: GeometryAnalysisInspectorRecord,
  right: GeometryAnalysisInspectorRecord
): GeometryAnalysisComparisonRow[] => {
  const values: Array<[string, AnalysisParameterValue | number | string | null, AnalysisParameterValue | number | string | null]> = [
    ["quantity", left.quantity, right.quantity],
    ["method", left.method, right.method],
    ["domain", left.domain, right.domain],
    ["units", left.units, right.units],
    ["source revision", left.sourceRevision, right.sourceRevision],
    ["result version", left.resultVersion, right.resultVersion],
    ["sampling", left.sampling, right.sampling],
    ["precision", left.precision, right.precision],
    ["engine", left.engine, right.engine],
    ["parameters", left.parameters, right.parameters],
    ["statistics", left.statistics, right.statistics],
  ];
  return values.map(([key, leftValue, rightValue]) => {
    const leftText = displayValue(leftValue);
    const rightText = displayValue(rightValue);
    return { key, left: leftText, right: rightText, equal: leftText === rightText };
  });
};

export const serializeGeometryAnalysisRecords = (
  records: readonly GeometryAnalysisInspectorRecord[]
): string => JSON.stringify(records);

export const parseGeometryAnalysisRecords = (value: string | null): GeometryAnalysisInspectorRecord[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is GeometryAnalysisInspectorRecord => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry as Partial<GeometryAnalysisInspectorRecord>;
      return typeof record.id === "string" && typeof record.resultKey === "string" &&
        typeof record.name === "string" && typeof record.sourceObjectId === "string" &&
        typeof record.sourceRevision === "number" && typeof record.lifecycle === "string";
    }).slice(0, 40);
  } catch {
    return [];
  }
};
