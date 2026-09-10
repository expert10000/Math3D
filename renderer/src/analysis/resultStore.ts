import type {
  AnalysisComputationRecord,
  AnalysisIdentity,
  AnalysisParameters,
  AnalysisResult,
  AnalysisResultDependency,
  AnalysisResultState,
  AnalysisResultStore,
} from "./contracts";

export type UpsertAnalysisResultOptions<TPayload, TKind extends string, TIdentity extends AnalysisIdentity> = {
  kind: TKind;
  identity: TIdentity;
  variant?: string;
  state?: AnalysisResultState;
  parameters?: AnalysisParameters;
  payload?: TPayload | null;
  error?: string | null;
  progress?: number | null;
  dependencies?: AnalysisResultDependency<TKind>[];
  computeTimeMs?: number | null;
  backend?: string;
  now?: number;
};

export type AnalysisStorePolicy<TIdentity extends AnalysisIdentity> = {
  lineageKey?: (identity: TIdentity) => string;
  maxResults?: number;
  maxHistory?: number;
  defaultBackend?: string;
};

export const cleanAnalysisKeyPart = (value: unknown): string =>
  String(value ?? "").trim().replace(/[^a-zA-Z0-9._:-]+/g, "_").slice(0, 96);

const stableParameterValue = (value: unknown): unknown => {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { $number: "NaN" };
    if (value === Number.POSITIVE_INFINITY) return { $number: "+Infinity" };
    if (value === Number.NEGATIVE_INFINITY) return { $number: "-Infinity" };
    if (Object.is(value, -0)) return { $number: "-0" };
  }
  if (Array.isArray(value)) return value.map(stableParameterValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableParameterValue(entry)]));
  }
  return value;
};

export const analysisParameterHash = (parameters: AnalysisParameters): string =>
  JSON.stringify(stableParameterValue(parameters));

export const createAnalysisResultStore = <TKind extends string, TIdentity extends AnalysisIdentity>(): AnalysisResultStore<TKind, TIdentity> =>
  ({ version: 2, entries: {}, history: [] });

export const analysisResultKey = (identity: AnalysisIdentity, kind: string, variant = "default"): string =>
  `${identity.key}:${kind}:${cleanAnalysisKeyPart(variant) || "default"}`;

const dependencyKey = <TKind extends string>(
  identity: AnalysisIdentity,
  dependency: Pick<AnalysisResultDependency<TKind>, "kind" | "variant">
): string => analysisResultKey(identity, dependency.kind, dependency.variant ?? "default");

export const getAnalysisResult = <TPayload = unknown, TKind extends string = string, TIdentity extends AnalysisIdentity = AnalysisIdentity>(
  store: AnalysisResultStore<TKind, TIdentity>,
  identity: TIdentity | null | undefined,
  kind: TKind,
  variant = "default"
): AnalysisResult<TPayload, TKind, TIdentity> | null => {
  if (!identity) return null;
  return (store.entries[analysisResultKey(identity, kind, variant)] as AnalysisResult<TPayload, TKind, TIdentity> | undefined) ?? null;
};

export const isAnalysisResultCurrent = <TKind extends string, TIdentity extends AnalysisIdentity>(
  store: AnalysisResultStore<TKind, TIdentity>,
  result: AnalysisResult<unknown, TKind, TIdentity> | null | undefined
): boolean => !!result && result.state === "ready" && result.dependencies.every((dependency) => {
  const key = dependency.key ?? dependencyKey(result.identity, dependency);
  const current = store.entries[key];
  return !!current && current.state === "ready" &&
    (dependency.resultVersion == null || current.resultVersion === dependency.resultVersion);
});

export const getAnalysisResultForParameters = <TPayload = unknown, TKind extends string = string, TIdentity extends AnalysisIdentity = AnalysisIdentity>(
  store: AnalysisResultStore<TKind, TIdentity>,
  identity: TIdentity | null | undefined,
  kind: TKind,
  parameters: AnalysisParameters,
  variant = "default"
): AnalysisResult<TPayload, TKind, TIdentity> | null => {
  const result = getAnalysisResult<TPayload, TKind, TIdentity>(store, identity, kind, variant);
  return result && result.parameterHash === analysisParameterHash(parameters) && isAnalysisResultCurrent(store, result)
    ? result
    : null;
};

const summarizePayload = (payload: unknown): Record<string, string | number | boolean | null> => {
  if (!payload || typeof payload !== "object") return {};
  const output: Record<string, string | number | boolean | null> = {};
  const add = (value: unknown, prefix = "") => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (Object.keys(output).length >= 16) return;
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) output[`${prefix}${key}`] = entry;
    }
  };
  add((payload as { summary?: unknown }).summary, "summary.");
  add(payload);
  return output;
};

const invalidateDependents = <TKind extends string, TIdentity extends AnalysisIdentity>(
  entries: Record<string, AnalysisResult<unknown, TKind, TIdentity>>,
  changedKey: string,
  now: number
): void => {
  const pending = [changedKey];
  const visited = new Set<string>();
  while (pending.length) {
    const prerequisiteKey = pending.shift()!;
    if (visited.has(prerequisiteKey)) continue;
    visited.add(prerequisiteKey);
    for (const [candidateKey, candidate] of Object.entries(entries)) {
      if (candidateKey === changedKey) continue;
      if (!candidate.dependencies.some((dependency) => (dependency.key ?? dependencyKey(candidate.identity, dependency)) === prerequisiteKey)) continue;
      if (candidate.state !== "stale") {
        entries[candidateKey] = {
          ...candidate,
          state: "stale",
          updatedAt: now,
          progress: null,
          dependencies: candidate.dependencies.map((dependency) =>
            (dependency.key ?? dependencyKey(candidate.identity, dependency)) === prerequisiteKey
              ? { ...dependency, state: "stale" }
              : dependency),
        };
      }
      pending.push(candidateKey);
    }
  }
};

const syncHistory = <TKind extends string, TIdentity extends AnalysisIdentity>(
  history: AnalysisComputationRecord<TKind, TIdentity>[],
  entries: Record<string, AnalysisResult<unknown, TKind, TIdentity>>
): AnalysisComputationRecord<TKind, TIdentity>[] => history.map((record) => {
  const current = entries[record.resultKey];
  return !current || current.resultVersion !== record.resultVersion || current.state === record.state
    ? record
    : { ...record, state: current.state, timestamp: current.updatedAt, error: current.error };
});

export const invalidateAnalysisResult = <TKind extends string, TIdentity extends AnalysisIdentity>(
  store: AnalysisResultStore<TKind, TIdentity>,
  identity: TIdentity,
  kind: TKind,
  variant = "default",
  now = Date.now()
): AnalysisResultStore<TKind, TIdentity> => {
  const key = analysisResultKey(identity, kind, variant);
  const current = store.entries[key];
  if (!current) return store;
  const entries = { ...store.entries, [key]: { ...current, state: "stale" as const, updatedAt: now, progress: null } };
  invalidateDependents(entries, key, now);
  return { version: 2, entries, history: syncHistory(store.history, entries) };
};

export const upsertAnalysisResult = <TPayload, TKind extends string, TIdentity extends AnalysisIdentity>(
  store: AnalysisResultStore<TKind, TIdentity>,
  options: UpsertAnalysisResultOptions<TPayload, TKind, TIdentity>,
  policy: AnalysisStorePolicy<TIdentity> = {}
): AnalysisResultStore<TKind, TIdentity> => {
  const variant = options.variant ?? "default";
  const key = analysisResultKey(options.identity, options.kind, variant);
  const previous = store.entries[key] as AnalysisResult<TPayload, TKind, TIdentity> | undefined;
  const now = options.now ?? Date.now();
  const parameters = options.parameters ?? previous?.parameters ?? {};
  const parameterHash = analysisParameterHash(parameters);
  const dependencies = (options.dependencies ?? previous?.dependencies ?? []).map((dependency) => {
    const key = dependency.key ?? dependencyKey(options.identity, dependency);
    const current = store.entries[key];
    return { ...dependency, variant: dependency.variant ?? "default", key, state: current?.state ?? dependency.state, resultVersion: current?.resultVersion ?? dependency.resultVersion };
  });
  const nextEntry: AnalysisResult<TPayload, TKind, TIdentity> = {
    kind: options.kind,
    variant,
    state: options.state ?? "ready",
    identity: options.identity,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    parameters,
    payload: options.payload !== undefined ? options.payload : previous?.payload ?? null,
    error: options.error !== undefined ? options.error : previous?.error ?? null,
    progress: options.progress !== undefined
      ? options.progress == null ? null : Math.min(1, Math.max(0, options.progress))
      : previous?.progress ?? (options.state === "ready" || options.state == null ? 1 : null),
    dependencies,
    parameterHash,
    resultVersion: (previous?.resultVersion ?? 0) + 1,
    computeTimeMs: options.computeTimeMs !== undefined ? options.computeTimeMs : previous?.computeTimeMs ?? null,
    backend: options.backend ?? previous?.backend ?? policy.defaultBackend ?? "Application",
  };
  const entries = { ...store.entries, [key]: nextEntry as AnalysisResult<unknown, TKind, TIdentity> };
  const lineageKey = policy.lineageKey;
  if (lineageKey) {
    for (const [entryKey, entry] of Object.entries(entries)) {
      if (entryKey === key || lineageKey(entry.identity) !== lineageKey(options.identity) || entry.identity.revision === options.identity.revision) continue;
      if (entry.state !== "stale") entries[entryKey] = { ...entry, state: "stale", updatedAt: now, progress: null };
    }
  }
  invalidateDependents(entries, key, now);
  entries[key] = nextEntry as AnalysisResult<unknown, TKind, TIdentity>;
  const orderedKeys = Object.entries(entries).sort(([, left], [, right]) => right.updatedAt - left.updatedAt).map(([entryKey]) => entryKey);
  for (const staleKey of orderedKeys.slice(policy.maxResults ?? 24)) delete entries[staleKey];

  let history = syncHistory(store.history, entries);
  const activeIndex = history.findIndex((record) => record.resultKey === key && record.parameterHash === parameterHash && (record.state === "queued" || record.state === "running"));
  if (activeIndex < 0 && (nextEntry.state === "queued" || nextEntry.state === "running")) {
    history = history.map((record) => record.resultKey === key && record.state === "ready" ? { ...record, state: "stale" as const } : record);
  }
  const record: AnalysisComputationRecord<TKind, TIdentity> = {
    id: activeIndex >= 0 ? history[activeIndex].id : `${key}:run:${now}:${nextEntry.resultVersion}`,
    resultKey: key,
    kind: nextEntry.kind,
    variant,
    state: nextEntry.state,
    identity: nextEntry.identity,
    parameters,
    parameterHash,
    dependencies,
    backend: nextEntry.backend,
    durationMs: nextEntry.computeTimeMs,
    timestamp: now,
    resultVersion: nextEntry.resultVersion,
    error: nextEntry.error,
    payloadSummary: summarizePayload(nextEntry.payload),
  };
  if (activeIndex >= 0) history[activeIndex] = record;
  else history.unshift(record);
  return { version: 2, entries, history: history.slice(0, policy.maxHistory ?? 96) };
};

export const analysisResultKindsForIdentity = <TKind extends string, TIdentity extends AnalysisIdentity>(
  store: AnalysisResultStore<TKind, TIdentity>,
  identity: TIdentity | null | undefined
): TKind[] => {
  if (!identity) return [];
  const kinds = new Set<TKind>();
  for (const entry of Object.values(store.entries)) {
    if (entry.identity.key === identity.key && isAnalysisResultCurrent(store, entry)) kinds.add(entry.kind);
  }
  return [...kinds].sort();
};
