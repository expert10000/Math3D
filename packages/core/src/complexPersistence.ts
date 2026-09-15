import { normalizeAnalysisResultEnvelope, type AnalysisArtifactHandle, type AnalysisResultEnvelope } from "./analysisResults";
import { immutableCanonicalJsonClone, normalizeCommandEnvelope, projectCommandTransaction, type CommandEnvelope } from "./commands";
import { canonicalJsonStringify, isStructuralHash, structuralHash, type StructuralHash } from "./documentIdentity";
import { complexCommandDefinitions, createComplexCommandState, type ComplexCommandState } from "./complexCommands";
import { createComplexAnalysisDocument, normalizeComplexAnalysisDocument, type ComplexAnalysisDocument, type ComplexAnalysisStructuralSource } from "./complexAnalysisDocument";
import { matchesScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const COMPLEX_PERSISTENCE_FORMAT = "math3d.complex-session" as const;
export const COMPLEX_PERSISTENCE_SCHEMA_VERSION = 1 as const;

export type ComplexReplayTransaction = Readonly<{
  transactionId: string;
  commands: readonly CommandEnvelope[];
  inverseCommands: readonly CommandEnvelope[];
  stateHash: StructuralHash;
}>;
export type ComplexReplayBundle = Readonly<{
  checkpoint: ComplexCommandState;
  checkpointStateHash: StructuralHash;
  transactions: readonly ComplexReplayTransaction[];
  cursor: number;
  finalStateHash: StructuralHash;
}>;
export type ComplexPersistedArtifactReference = Readonly<{
  handle: AnalysisArtifactHandle;
  source: ScientificSourceGeneration;
  state: "unavailable";
  reason: "payload-not-embedded" | "external-artifact-missing";
}>;
export type ComplexEngineAvailability = Readonly<{
  name: string;
  version: string;
  state: "available" | "needs-compute";
}>;
export type ComplexPersistenceRecord = Readonly<{
  format: typeof COMPLEX_PERSISTENCE_FORMAT;
  schemaVersion: typeof COMPLEX_PERSISTENCE_SCHEMA_VERSION;
  document: ComplexAnalysisDocument;
  replay: ComplexReplayBundle;
  results: readonly AnalysisResultEnvelope[];
  artifacts: readonly ComplexPersistedArtifactReference[];
  engines: readonly ComplexEngineAvailability[];
}>;

const sourceOf = (document: ComplexAnalysisDocument): ScientificSourceGeneration => ({ documentId: document.identity.id, revision: document.identity.revision, structuralHash: document.identity.structuralHash, generation: document.identity.revision });
const structuralSource = (document: ComplexAnalysisDocument): ComplexAnalysisStructuralSource => ({
  function: document.function, parameters: document.parameters, assumptions: document.assumptions, domain: document.domain,
  sampling: document.sampling, contours: document.contours, branchPolicy: document.branchPolicy, covering: document.covering, mobius: document.mobius,
});
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, fields: readonly string[], path: string, errors: string[]) => {
  const extra = Object.keys(value).filter((field) => !fields.includes(field)).sort();
  const missing = fields.filter((field) => !(field in value));
  if (extra.length) errors.push(`${path} contains unknown fields: ${extra.join(", ")}.`);
  if (missing.length) errors.push(`${path} is missing fields: ${missing.join(", ")}.`);
};

export const replayComplexCommandLog = (bundle: ComplexReplayBundle): ValidationResult<ComplexCommandState> => {
  if (structuralHash(bundle.checkpoint) !== bundle.checkpointStateHash) return { ok: false, errors: ["Complex replay checkpoint hash is invalid."] };
  if (!Number.isSafeInteger(bundle.cursor) || bundle.cursor < 0 || bundle.cursor > bundle.transactions.length) return { ok: false, errors: ["Complex replay cursor is invalid."] };
  let state = immutableCanonicalJsonClone(bundle.checkpoint) as ComplexCommandState;
  for (let index = 0; index < bundle.transactions.length; index += 1) {
    const transaction = bundle.transactions[index]!;
    const projected = projectCommandTransaction(state, transaction.commands, complexCommandDefinitions, "replay");
    if (!projected.ok) return { ok: false, errors: [`Complex replay transaction ${index} failed.`] };
    const inverse = projectCommandTransaction(projected.state, transaction.inverseCommands, complexCommandDefinitions, "replay");
    if (!inverse.ok || canonicalJsonStringify(structuralSource(inverse.state.document)) !== canonicalJsonStringify(structuralSource(state.document))) return { ok: false, errors: [`Complex replay transaction ${index} has an invalid inverse.`] };
    state = projected.state;
    if (structuralHash(state) !== transaction.stateHash) return { ok: false, errors: [`Complex replay transaction ${index} diverged.`] };
  }
  for (let index = bundle.transactions.length - 1; index >= bundle.cursor; index -= 1) {
    const projected = projectCommandTransaction(state, bundle.transactions[index]!.inverseCommands, complexCommandDefinitions, "replay");
    if (!projected.ok) return { ok: false, errors: [`Complex replay cursor undo ${index} failed.`] };
    state = projected.state;
  }
  if (structuralHash(state) !== bundle.finalStateHash) return { ok: false, errors: ["Complex replay final state hash is invalid."] };
  return { ok: true, value: immutableCanonicalJsonClone(state) as ComplexCommandState };
};

export const createComplexReplayBundle = (checkpoint: ComplexCommandState, transactions: readonly ComplexReplayTransaction[], cursor = transactions.length): ComplexReplayBundle => {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > transactions.length) throw new RangeError("Complex replay cursor is invalid.");
  let state = immutableCanonicalJsonClone(checkpoint) as ComplexCommandState;
  for (const transaction of transactions) {
    const projected = projectCommandTransaction(state, transaction.commands, complexCommandDefinitions, "replay");
    if (!projected.ok) throw new TypeError("Complex replay transaction cannot be projected.");
    state = projected.state;
  }
  for (let index = transactions.length - 1; index >= cursor; index -= 1) {
    const projected = projectCommandTransaction(state, transactions[index]!.inverseCommands, complexCommandDefinitions, "replay");
    if (!projected.ok) throw new TypeError("Complex replay cursor cannot be restored.");
    state = projected.state;
  }
  const bundle = { checkpoint, checkpointStateHash: structuralHash(checkpoint), transactions, cursor, finalStateHash: structuralHash(state) };
  const replayed = replayComplexCommandLog(bundle);
  if (!replayed.ok) throw new TypeError(replayed.errors.join(" "));
  return immutableCanonicalJsonClone(bundle) as ComplexReplayBundle;
};

const normalizeReplay = (value: unknown, errors: string[]): ComplexReplayBundle | null => {
  if (!isRecord(value)) { errors.push("session.replay must be an object."); return null; }
  exact(value, ["checkpoint", "checkpointStateHash", "transactions", "cursor", "finalStateHash"], "session.replay", errors);
  if (!isRecord(value.checkpoint)) { errors.push("session.replay.checkpoint must be an object."); return null; }
  exact(value.checkpoint, ["document", "committedSelection", "analysisRequest", "valueSurfaceRequest"], "session.replay.checkpoint", errors);
  const document = normalizeComplexAnalysisDocument(value.checkpoint.document);
  if (!document.ok) { errors.push(...document.errors.map((entry) => `session.replay.checkpoint: ${entry}`)); return null; }
  if (value.checkpoint.committedSelection !== null || value.checkpoint.analysisRequest !== null || value.checkpoint.valueSurfaceRequest !== null) errors.push("Replay checkpoint must contain source state only.");
  const checkpoint = createComplexCommandState(document.value);
  const transactions: ComplexReplayTransaction[] = [];
  if (!Array.isArray(value.transactions) || value.transactions.length > 100) errors.push("session.replay.transactions must be an array of at most 100 entries.");
  else value.transactions.forEach((entry, index) => {
    if (!isRecord(entry)) { errors.push(`session.replay.transactions[${index}] must be an object.`); return; }
    exact(entry, ["transactionId", "commands", "inverseCommands", "stateHash"], `session.replay.transactions[${index}]`, errors);
    const commands = Array.isArray(entry.commands) ? entry.commands.map(normalizeCommandEnvelope).filter((item): item is { ok: true; value: CommandEnvelope } => item.ok).map((item) => item.value) : [];
    const inverseCommands = Array.isArray(entry.inverseCommands) ? entry.inverseCommands.map(normalizeCommandEnvelope).filter((item): item is { ok: true; value: CommandEnvelope } => item.ok).map((item) => item.value) : [];
    if (typeof entry.transactionId !== "string" || !entry.transactionId || !commands.length || !inverseCommands.length || !isStructuralHash(entry.stateHash)) errors.push(`session.replay.transactions[${index}] is invalid.`);
    else transactions.push({ transactionId: entry.transactionId, commands, inverseCommands, stateHash: entry.stateHash });
  });
  if (!isStructuralHash(value.checkpointStateHash) || !isStructuralHash(value.finalStateHash) || !Number.isSafeInteger(value.cursor)) { errors.push("session.replay hashes/cursor are invalid."); return null; }
  const replay = { checkpoint, checkpointStateHash: value.checkpointStateHash, transactions, cursor: value.cursor as number, finalStateHash: value.finalStateHash };
  const verified = replayComplexCommandLog(replay);
  if (!verified.ok) errors.push(...verified.errors);
  return replay;
};

export const normalizeComplexPersistenceRecord = (value: unknown): ValidationResult<ComplexPersistenceRecord> => {
  if (!isRecord(value)) return { ok: false, errors: ["Complex session must be an object."] };
  const errors: string[] = [];
  exact(value, ["format", "schemaVersion", "document", "replay", "results", "artifacts", "engines"], "session", errors);
  if (value.format !== COMPLEX_PERSISTENCE_FORMAT || value.schemaVersion !== COMPLEX_PERSISTENCE_SCHEMA_VERSION) errors.push("Unsupported Complex session format/version.");
  const document = normalizeComplexAnalysisDocument(value.document);
  if (!document.ok) errors.push(...document.errors.map((entry) => `session.document: ${entry}`));
  const replay = normalizeReplay(value.replay, errors);
  const source = document.ok ? sourceOf(document.value) : null;
  const results: AnalysisResultEnvelope[] = [];
  if (!Array.isArray(value.results) || value.results.length > 64) errors.push("session.results must be an array of at most 64 entries.");
  else value.results.forEach((entry, index) => {
    const normalized = normalizeAnalysisResultEnvelope(entry);
    if (!normalized.ok) errors.push(...normalized.errors.map((error) => `session.results[${index}]: ${error}`));
    else if (source && !matchesScientificSourceGeneration(normalized.value.provenance.source, source)) errors.push(`session.results[${index}] is stale.`);
    else results.push(normalized.value);
  });
  const artifacts: ComplexPersistedArtifactReference[] = [];
  if (!Array.isArray(value.artifacts)) errors.push("session.artifacts must be an array.");
  else value.artifacts.forEach((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.handle) || entry.state !== "unavailable" || !["payload-not-embedded", "external-artifact-missing"].includes(String(entry.reason)) || !source || !isRecord(entry.source) || !matchesScientificSourceGeneration(entry.source as unknown as ScientificSourceGeneration, source)) errors.push(`session.artifacts[${index}] is invalid or fabricates availability.`);
    else artifacts.push(entry as unknown as ComplexPersistedArtifactReference);
  });
  const engines: ComplexEngineAvailability[] = [];
  if (!Array.isArray(value.engines)) errors.push("session.engines must be an array.");
  else value.engines.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.name !== "string" || typeof entry.version !== "string" || !["available", "needs-compute"].includes(String(entry.state))) errors.push(`session.engines[${index}] is invalid.`);
    else engines.push(entry as unknown as ComplexEngineAvailability);
  });
  if (replay && document.ok) {
    const restored = replayComplexCommandLog(replay);
    if (!restored.ok || restored.value.document.identity.structuralHash !== document.value.identity.structuralHash || restored.value.document.identity.revision !== document.value.identity.revision) errors.push("Replay source does not match the persisted Complex document.");
  }
  if (errors.length || !document.ok || !replay) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone({ format: COMPLEX_PERSISTENCE_FORMAT, schemaVersion: COMPLEX_PERSISTENCE_SCHEMA_VERSION, document: document.value, replay, results, artifacts, engines }) as ComplexPersistenceRecord };
};

export const createComplexPersistenceRecord = (args: { document: ComplexAnalysisDocument; replay: ComplexReplayBundle; results?: readonly AnalysisResultEnvelope[] }): ComplexPersistenceRecord => {
  const results = args.results ?? [];
  const refs = results.map((result) => ({ resultId: result.resultId, resultType: result.provenance.operation.type, sourceRevision: args.document.identity.revision, sourceHash: args.document.identity.structuralHash, state: "available" as const }));
  const document = createComplexAnalysisDocument(structuralSource(args.document), { id: args.document.identity.id, revision: args.document.identity.revision, results: refs, provenance: args.document.provenance });
  const source = sourceOf(document);
  const handles = new Map<string, AnalysisArtifactHandle>();
  results.flatMap((result) => result.artifacts).forEach((handle) => handles.set(handle.artifactId, handle));
  const engines = [...new Map(results.map((result) => [`${result.provenance.engine.name}@${result.provenance.engine.version}`, result.provenance.engine])).values()].map((engine) => ({ ...engine, state: engine.name === "SageMath" ? "needs-compute" as const : "available" as const }));
  const candidate = { format: COMPLEX_PERSISTENCE_FORMAT, schemaVersion: COMPLEX_PERSISTENCE_SCHEMA_VERSION, document, replay: args.replay, results, artifacts: [...handles.values()].map((handle) => ({ handle, source, state: "unavailable" as const, reason: "payload-not-embedded" as const })), engines };
  const normalized = normalizeComplexPersistenceRecord(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const serializeComplexPersistenceRecord = (record: ComplexPersistenceRecord): string => canonicalJsonStringify(normalizeComplexPersistenceRecord(record).ok ? record : (() => { throw new TypeError("Invalid Complex persistence record."); })());
export const deserializeComplexPersistenceRecord = (text: string): ValidationResult<ComplexPersistenceRecord> => {
  try { return normalizeComplexPersistenceRecord(JSON.parse(text)); }
  catch (error) { return { ok: false, errors: [`Complex session JSON is invalid: ${String((error as Error).message ?? error)}`] }; }
};

/** Upgrades a pre-C09 document snapshot without fabricating result/artifact availability. */
export const migrateComplexPersistence = (value: unknown): ValidationResult<ComplexPersistenceRecord> => {
  const current = normalizeComplexPersistenceRecord(value);
  if (current.ok) return current;
  const legacy = normalizeComplexAnalysisDocument(value);
  if (!legacy.ok) return { ok: false, errors: [...current.errors, ...legacy.errors.map((error) => `legacy: ${error}`)] };
  const document = createComplexAnalysisDocument(structuralSource(legacy.value), {
    id: legacy.value.identity.id,
    revision: legacy.value.identity.revision,
    results: legacy.value.results.map((reference) => ({ ...reference, state: "unavailable" as const })),
    provenance: {
      ...legacy.value.provenance,
      diagnostics: [...legacy.value.provenance.diagnostics, { code: "complex.persistence-migrated", severity: "warning", message: "Legacy document loaded without replayable results or artifacts.", action: "Recompute analysis to publish current provenance." }],
    },
  });
  const replay = createComplexReplayBundle(createComplexCommandState(document), []);
  return normalizeComplexPersistenceRecord({ format: COMPLEX_PERSISTENCE_FORMAT, schemaVersion: COMPLEX_PERSISTENCE_SCHEMA_VERSION, document, replay, results: [], artifacts: [], engines: [] });
};

export type ComplexStructuredNotebookExport = Readonly<{
  format: "math3d.complex-structured-notebook";
  schemaVersion: 1;
  source: ScientificSourceGeneration;
  ast: ComplexAnalysisDocument["function"]["normalizedAst"];
  requests: readonly Readonly<{ operation: "derivative" | "poles" | "residue" | "series"; point: { re: number; im: number } | null; order: number | null }>[];
}>;
export const createComplexStructuredNotebookExport = (document: ComplexAnalysisDocument): ComplexStructuredNotebookExport => immutableCanonicalJsonClone({
  format: "math3d.complex-structured-notebook", schemaVersion: 1, source: sourceOf(document), ast: document.function.normalizedAst,
  requests: [
    { operation: "derivative", point: null, order: null }, { operation: "poles", point: null, order: null },
    { operation: "residue", point: { re: 0, im: 0 }, order: null }, { operation: "series", point: { re: 0, im: 0 }, order: 6 },
  ],
});
