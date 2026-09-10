export type AnalysisResultState =
  | "queued"
  | "running"
  | "ready"
  | "cancelled"
  | "deferred"
  | "stale"
  | "error";

export type AnalysisParameterValue =
  | number
  | string
  | boolean
  | null
  | readonly AnalysisParameterValue[]
  | { readonly [key: string]: AnalysisParameterValue };

export type AnalysisParameters = Readonly<Record<string, AnalysisParameterValue>>;

export type AnalysisIdentity = {
  key: string;
  revision: string;
  label: string;
  sourceLabel: string;
};

export type AnalysisResultDependency<TKind extends string = string> = {
  kind: TKind;
  variant?: string;
  state: AnalysisResultState;
  key?: string;
  resultVersion?: number;
};

export type AnalysisResult<
  TPayload = unknown,
  TKind extends string = string,
  TIdentity extends AnalysisIdentity = AnalysisIdentity,
> = {
  kind: TKind;
  variant: string;
  state: AnalysisResultState;
  identity: TIdentity;
  createdAt: number;
  updatedAt: number;
  parameters: AnalysisParameters;
  payload: TPayload | null;
  error: string | null;
  progress: number | null;
  dependencies: AnalysisResultDependency<TKind>[];
  parameterHash: string;
  resultVersion: number;
  computeTimeMs: number | null;
  backend: string;
};

export type AnalysisComputationRecord<
  TKind extends string = string,
  TIdentity extends AnalysisIdentity = AnalysisIdentity,
> = {
  id: string;
  resultKey: string;
  kind: TKind;
  variant: string;
  state: AnalysisResultState;
  identity: TIdentity;
  parameters: AnalysisParameters;
  parameterHash: string;
  dependencies: AnalysisResultDependency<TKind>[];
  backend: string;
  durationMs: number | null;
  timestamp: number;
  resultVersion: number;
  error: string | null;
  payloadSummary: Record<string, string | number | boolean | null>;
};

export type AnalysisResultStore<
  TKind extends string = string,
  TIdentity extends AnalysisIdentity = AnalysisIdentity,
> = {
  version: 2;
  entries: Record<string, AnalysisResult<unknown, TKind, TIdentity>>;
  history: AnalysisComputationRecord<TKind, TIdentity>[];
};

export type AnalysisDomain = "object" | "mesh" | "vertex" | "edge" | "face" | "point" | "path" | "mixed";
export type AnalysisValueType = "scalar" | "vector" | "tensor" | "category" | "geometry";

export type AnalysisFieldMetadata = {
  id: string;
  label: string;
  domain: AnalysisDomain;
  valueType: AnalysisValueType;
  unit?: string;
  components?: readonly string[];
  source?: string;
};

export type AnalysisPaletteRangeMetadata = {
  palette: string;
  inverted: boolean;
  rangeMode: "automatic" | "manual" | "percentile" | "symmetric";
  range: { min: number; max: number } | null;
  percentileRange?: readonly [number, number];
};

export type AnalysisHistogramBin = { min: number; max: number; count: number };
export type AnalysisStatistic = { label: string; value: string };
export type AnalysisProvenanceEntry = { label: string; value: string };

export type AnalysisProbeValue = {
  field: AnalysisFieldMetadata;
  value: number | readonly number[] | string | null;
  valid: boolean;
  warning?: string;
};

export type AnalysisProbe = {
  targetId: string;
  domain: AnalysisDomain;
  position?: readonly [number, number, number];
  normal?: readonly [number, number, number];
  values: AnalysisProbeValue[];
  warnings: string[];
};

export type ScientificAnalysisResultSummary = {
  category: string | null;
  result: string;
  quantity: string;
  state: "Ready" | "Running" | "Deferred" | "Unavailable";
  method: string;
  domain: string;
  statistics: AnalysisStatistic[];
  percentiles: AnalysisStatistic[];
  extrema?: AnalysisStatistic[];
  histogram?: AnalysisHistogramBin[];
  metadata: AnalysisStatistic[];
  provenance: AnalysisProvenanceEntry[];
  warnings: string[];
  field?: AnalysisFieldMetadata;
  display?: AnalysisPaletteRangeMetadata;
  probe?: AnalysisProbe;
};
