import {
  normalizeAnalysisResultEnvelope,
  type AnalysisArtifactHandle,
  type AnalysisResultEnvelope,
} from "./analysisResults";
import {
  immutableCanonicalJsonClone,
  normalizeCommandEnvelope,
  projectCommandTransaction,
  type CommandEnvelope,
} from "./commands";
import {
  canonicalJsonStringify,
  isStructuralHash,
  structuralHash,
  type StructuralHash,
} from "./documentIdentity";
import { matchesScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";
import {
  createTopologyCommandState,
  topologyCommandDefinitions,
  type TopologyCommandState,
} from "./topologyCommands";
import { normalizeTopologyDocument, type TopologyDocument } from "./topologyDocument";
import type { ValidationResult } from "./validation";

export const TOPOLOGY_PERSISTENCE_FORMAT = "math3d.topology-persistence" as const;
export const TOPOLOGY_PERSISTENCE_SCHEMA_VERSION = 1 as const;

export type TopologyReplayTransaction = Readonly<{
  transactionId: string;
  commands: readonly CommandEnvelope[];
  inverseCommands: readonly CommandEnvelope[];
  stateHash: StructuralHash;
}>;

export type TopologyReplayBundle = Readonly<{
  checkpoint: TopologyCommandState;
  checkpointStateHash: StructuralHash;
  transactions: readonly TopologyReplayTransaction[];
  cursor: number;
  finalStateHash: StructuralHash;
}>;

export type TopologyPersistedArtifactReference = Readonly<{
  handle: AnalysisArtifactHandle;
  source: ScientificSourceGeneration;
  state: "unavailable";
  reason: "payload-not-embedded" | "external-artifact-missing";
}>;

export type TopologyPersistenceRecord = Readonly<{
  format: typeof TOPOLOGY_PERSISTENCE_FORMAT;
  schemaVersion: typeof TOPOLOGY_PERSISTENCE_SCHEMA_VERSION;
  document: TopologyDocument;
  replay: TopologyReplayBundle;
  canonicalHash: StructuralHash;
  results: readonly AnalysisResultEnvelope[];
  artifacts: readonly TopologyPersistedArtifactReference[];
}>;

const RECORD_FIELDS = new Set(["format", "schemaVersion", "document", "replay", "canonicalHash", "results", "artifacts"]);
const REPLAY_FIELDS = new Set(["checkpoint", "checkpointStateHash", "transactions", "cursor", "finalStateHash"]);
const CHECKPOINT_FIELDS = new Set(["document", "committedSelection", "canonicalizationRequest", "analysisRequest"]);
const TRANSACTION_FIELDS = new Set(["transactionId", "commands", "inverseCommands", "stateHash"]);
const ARTIFACT_REFERENCE_FIELDS = new Set(["handle", "source", "state", "reason"]);
const HANDLE_FIELDS = new Set(["artifactId", "kind", "role"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const exactFields = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[]
) => {
  const extra = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  if (extra.length > 0) errors.push(`${path} contains unknown fields: ${extra.join(", ")}.`);
};

const sourceFor = (document: TopologyDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation: 1,
});

const normalizeCheckpoint = (value: unknown, errors: string[]): TopologyCommandState | null => {
  if (!isRecord(value)) {
    errors.push("persistence.replay.checkpoint must be an object.");
    return null;
  }
  exactFields(value, CHECKPOINT_FIELDS, "persistence.replay.checkpoint", errors);
  const document = normalizeTopologyDocument(value.document);
  if (!document.ok) {
    errors.push(...document.errors.map((entry) => `persistence.replay.checkpoint.${entry}`));
    return null;
  }
  if (value.committedSelection !== null || value.canonicalizationRequest !== null || value.analysisRequest !== null) {
    errors.push("The persisted replay checkpoint must contain source state only; requests and transient selection must be null.");
  }
  return createTopologyCommandState(document.value);
};

const normalizeTransaction = (
  value: unknown,
  index: number,
  errors: string[]
): TopologyReplayTransaction | null => {
  const path = `persistence.replay.transactions[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  exactFields(value, TRANSACTION_FIELDS, path, errors);
  if (typeof value.transactionId !== "string" || !SAFE_ID.test(value.transactionId)) {
    errors.push(`${path}.transactionId must be an ID-safe string.`);
  }
  if (!Array.isArray(value.commands) || value.commands.length === 0) errors.push(`${path}.commands must be nonempty.`);
  if (!Array.isArray(value.inverseCommands) || value.inverseCommands.length === 0) errors.push(`${path}.inverseCommands must be nonempty.`);
  const commands = Array.isArray(value.commands) ? value.commands.map((entry, commandIndex) => {
    const normalized = normalizeCommandEnvelope(entry);
    if (!normalized.ok) errors.push(...normalized.errors.map((error) => `${path}.commands[${commandIndex}]: ${error}`));
    return normalized.ok ? normalized.value : null;
  }).filter((entry): entry is CommandEnvelope => !!entry) : [];
  const inverseCommands = Array.isArray(value.inverseCommands) ? value.inverseCommands.map((entry, commandIndex) => {
    const normalized = normalizeCommandEnvelope(entry);
    if (!normalized.ok) errors.push(...normalized.errors.map((error) => `${path}.inverseCommands[${commandIndex}]: ${error}`));
    return normalized.ok ? normalized.value : null;
  }).filter((entry): entry is CommandEnvelope => !!entry) : [];
  if (!isStructuralHash(value.stateHash)) errors.push(`${path}.stateHash must be a structural hash.`);
  if (errors.length > 0 && (commands.length === 0 || inverseCommands.length === 0 || !isStructuralHash(value.stateHash))) return null;
  return {
    transactionId: value.transactionId as string,
    commands,
    inverseCommands,
    stateHash: value.stateHash as StructuralHash,
  };
};

export const replayTopologyCommandLog = (
  value: TopologyReplayBundle
): ValidationResult<TopologyCommandState> => {
  let state = immutableCanonicalJsonClone(value.checkpoint) as TopologyCommandState;
  if (structuralHash(state) !== value.checkpointStateHash) {
    return { ok: false, errors: ["Replay checkpoint hash does not match its source state."] };
  }
  if (!Number.isSafeInteger(value.cursor) || value.cursor < 0 || value.cursor > value.transactions.length) {
    return { ok: false, errors: ["Replay cursor is outside the transaction log."] };
  }
  for (let index = 0; index < value.transactions.length; index += 1) {
    const transaction = value.transactions[index]!;
    const projected = projectCommandTransaction(state, transaction.commands, topologyCommandDefinitions, "replay");
    if (!projected.ok) {
      return { ok: false, errors: projected.errors.flatMap((entry) => entry.messages.map((message) => `Replay transaction ${index}: ${message}`)) };
    }
    const inverseProbe = projectCommandTransaction(projected.state, transaction.inverseCommands, topologyCommandDefinitions, "replay");
    if (!inverseProbe.ok || canonicalJsonStringify(inverseProbe.ok ? inverseProbe.state.document.source : {}) !== canonicalJsonStringify(state.document.source)) {
      return { ok: false, errors: [`Replay transaction ${index} has an invalid inverse command sequence.`] };
    }
    state = projected.state;
    if (structuralHash(state) !== transaction.stateHash) {
      return { ok: false, errors: [`Replay transaction ${index} diverged from its recorded state hash.`] };
    }
  }
  for (let index = value.transactions.length - 1; index >= value.cursor; index -= 1) {
    const transaction = value.transactions[index]!;
    const projected = projectCommandTransaction(state, transaction.inverseCommands, topologyCommandDefinitions, "replay");
    if (!projected.ok) {
      return { ok: false, errors: projected.errors.flatMap((entry) => entry.messages.map((message) => `Replay cursor undo ${index}: ${message}`)) };
    }
    state = projected.state;
  }
  if (structuralHash(state) !== value.finalStateHash) {
    return { ok: false, errors: ["Replay final state hash does not match the recorded final hash."] };
  }
  return { ok: true, value: immutableCanonicalJsonClone(state) as TopologyCommandState };
};

const normalizeReplay = (value: unknown, errors: string[]): TopologyReplayBundle | null => {
  if (!isRecord(value)) {
    errors.push("persistence.replay must be an object.");
    return null;
  }
  exactFields(value, REPLAY_FIELDS, "persistence.replay", errors);
  const checkpoint = normalizeCheckpoint(value.checkpoint, errors);
  if (!isStructuralHash(value.checkpointStateHash)) errors.push("persistence.replay.checkpointStateHash must be a structural hash.");
  if (!Array.isArray(value.transactions)) errors.push("persistence.replay.transactions must be an array.");
  if (Array.isArray(value.transactions) && value.transactions.length > 100) errors.push("persistence.replay.transactions exceeds the 100-entry history limit.");
  const transactionIds = new Set<string>();
  const transactions = Array.isArray(value.transactions)
    ? value.transactions.map((entry, index) => {
        const normalized = normalizeTransaction(entry, index, errors);
        if (normalized && transactionIds.has(normalized.transactionId)) errors.push(`Duplicate replay transaction '${normalized.transactionId}'.`);
        if (normalized) transactionIds.add(normalized.transactionId);
        return normalized;
      }).filter((entry): entry is TopologyReplayTransaction => !!entry)
    : [];
  if (!Number.isSafeInteger(value.cursor) || (value.cursor as number) < 0 || (value.cursor as number) > transactions.length) {
    errors.push("persistence.replay.cursor must identify a position within the transaction log.");
  }
  if (!isStructuralHash(value.finalStateHash)) errors.push("persistence.replay.finalStateHash must be a structural hash.");
  if (!checkpoint || !isStructuralHash(value.checkpointStateHash) || !isStructuralHash(value.finalStateHash)) return null;
  const replay: TopologyReplayBundle = {
    checkpoint,
    checkpointStateHash: value.checkpointStateHash,
    transactions,
    cursor: value.cursor as number,
    finalStateHash: value.finalStateHash,
  };
  const replayed = replayTopologyCommandLog(replay);
  if (!replayed.ok) errors.push(...replayed.errors.map((entry) => `persistence.replay: ${entry}`));
  return replay;
};

const normalizeHandle = (value: unknown, path: string, errors: string[]): AnalysisArtifactHandle | null => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an artifact handle.`);
    return null;
  }
  exactFields(value, HANDLE_FIELDS, path, errors);
  if (typeof value.artifactId !== "string" || !SAFE_ID.test(value.artifactId)) errors.push(`${path}.artifactId is invalid.`);
  if (!(["sampled-grid", "sparse-matrix", "mesh", "binary", "table", "image", "other"] as unknown[]).includes(value.kind)) errors.push(`${path}.kind is invalid.`);
  if (typeof value.role !== "string" || value.role.length === 0 || value.role.length > 120) errors.push(`${path}.role is invalid.`);
  return { artifactId: value.artifactId as string, kind: value.kind as AnalysisArtifactHandle["kind"], role: value.role as string };
};

export const normalizeTopologyPersistenceRecord = (value: unknown): ValidationResult<TopologyPersistenceRecord> => {
  if (!isRecord(value)) return { ok: false, errors: ["Topology persistence record must be an object."] };
  try {
    canonicalJsonStringify(value);
  } catch (error) {
    return { ok: false, errors: [`Topology persistence record must be canonical JSON: ${String((error as Error).message ?? error)}`] };
  }
  const errors: string[] = [];
  exactFields(value, RECORD_FIELDS, "persistence", errors);
  if (value.format !== TOPOLOGY_PERSISTENCE_FORMAT) errors.push(`persistence.format must be '${TOPOLOGY_PERSISTENCE_FORMAT}'.`);
  if (value.schemaVersion !== TOPOLOGY_PERSISTENCE_SCHEMA_VERSION) errors.push(`persistence.schemaVersion must be ${TOPOLOGY_PERSISTENCE_SCHEMA_VERSION}.`);
  const document = normalizeTopologyDocument(value.document);
  if (!document.ok) errors.push(...document.errors.map((entry) => `persistence.document: ${entry}`));
  const replay = normalizeReplay(value.replay, errors);
  if (!isStructuralHash(value.canonicalHash)) errors.push("persistence.canonicalHash must be a structural hash.");
  const expectedSource = document.ok ? sourceFor(document.value) : null;
  const resultIds = new Set<string>();
  const results = Array.isArray(value.results) ? value.results.map((entry, index) => {
    const normalized = normalizeAnalysisResultEnvelope(entry);
    if (!normalized.ok) {
      errors.push(...normalized.errors.map((error) => `persistence.results[${index}]: ${error}`));
      return null;
    }
    if (resultIds.has(normalized.value.resultId)) errors.push(`persistence.results[${index}].resultId is duplicated.`);
    resultIds.add(normalized.value.resultId);
    if (expectedSource && !matchesScientificSourceGeneration(normalized.value.provenance.source, expectedSource)) {
      errors.push(`persistence.results[${index}] is stale for the persisted document.`);
    }
    return normalized.value;
  }).filter((entry): entry is AnalysisResultEnvelope => !!entry) : [];
  if (!Array.isArray(value.results)) errors.push("persistence.results must be an array.");
  if (results.length > 64) errors.push("persistence.results exceeds 64 compact records.");
  const artifactIds = new Set<string>();
  const artifacts = Array.isArray(value.artifacts) ? value.artifacts.map((entry, index) => {
    const path = `persistence.artifacts[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return null;
    }
    exactFields(entry, ARTIFACT_REFERENCE_FIELDS, path, errors);
    const handle = normalizeHandle(entry.handle, `${path}.handle`, errors);
    if (handle && artifactIds.has(handle.artifactId)) errors.push(`${path}.handle.artifactId is duplicated.`);
    if (handle) artifactIds.add(handle.artifactId);
    if (entry.state !== "unavailable") errors.push(`${path}.state must be unavailable because artifact payloads are not embedded.`);
    if (!["payload-not-embedded", "external-artifact-missing"].includes(entry.reason as string)) errors.push(`${path}.reason is invalid.`);
    if (!isRecord(entry.source) || !expectedSource || !matchesScientificSourceGeneration(entry.source as unknown as ScientificSourceGeneration, expectedSource)) {
      errors.push(`${path}.source must match the persisted document generation.`);
    }
    return handle ? {
      handle,
      source: entry.source as unknown as ScientificSourceGeneration,
      state: "unavailable" as const,
      reason: entry.reason as TopologyPersistedArtifactReference["reason"],
    } : null;
  }).filter((entry): entry is TopologyPersistedArtifactReference => !!entry) : [];
  if (!Array.isArray(value.artifacts)) errors.push("persistence.artifacts must be an array.");
  for (const result of results) {
    for (const artifact of result.artifacts) {
      if (!artifactIds.has(artifact.artifactId)) errors.push(`Result '${result.resultId}' references unlisted artifact '${artifact.artifactId}'.`);
    }
  }
  if (document.ok) {
    const persistedRefs = new Map(document.value.results.map((entry) => [entry.resultId, entry]));
    for (const result of results) {
      const reference = persistedRefs.get(result.resultId);
      if (!reference || reference.state !== "available" || reference.resultType !== result.provenance.operation.type) {
        errors.push(`Compact result '${result.resultId}' lacks a matching available TopologyDocument reference.`);
      }
    }
    for (const reference of document.value.results.filter((entry) => entry.state === "available")) {
      if (!resultIds.has(reference.resultId)) errors.push(`Available result reference '${reference.resultId}' lacks compact result metadata.`);
    }
  }
  if (replay && document.ok) {
    const replayed = replayTopologyCommandLog(replay);
    if (replayed.ok && (
      replayed.value.document.identity.id !== document.value.identity.id ||
      replayed.value.document.identity.revision !== document.value.identity.revision ||
      replayed.value.document.identity.structuralHash !== document.value.identity.structuralHash ||
      canonicalJsonStringify(replayed.value.document.source) !== canonicalJsonStringify(document.value.source)
    )) errors.push("Replay final source does not match the persisted TopologyDocument authority.");
  }
  if (errors.length > 0 || !document.ok || !replay || !isStructuralHash(value.canonicalHash)) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone({
    format: TOPOLOGY_PERSISTENCE_FORMAT,
    schemaVersion: TOPOLOGY_PERSISTENCE_SCHEMA_VERSION,
    document: document.value,
    replay,
    canonicalHash: value.canonicalHash,
    results,
    artifacts,
  }) as TopologyPersistenceRecord };
};

export const createTopologyReplayBundle = (
  checkpoint: TopologyCommandState,
  transactions: readonly TopologyReplayTransaction[],
  cursor = transactions.length
): TopologyReplayBundle => {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > transactions.length) {
    throw new RangeError("Replay cursor must identify a position within the transaction log.");
  }
  let finalState = immutableCanonicalJsonClone(checkpoint) as TopologyCommandState;
  for (const transaction of transactions) {
    const projected = projectCommandTransaction(finalState, transaction.commands, topologyCommandDefinitions, "replay");
    if (!projected.ok) throw new TypeError("Replay command log cannot be projected from its checkpoint.");
    finalState = projected.state;
  }
  for (let index = transactions.length - 1; index >= cursor; index -= 1) {
    const projected = projectCommandTransaction(finalState, transactions[index]!.inverseCommands, topologyCommandDefinitions, "replay");
    if (!projected.ok) throw new TypeError("Replay cursor cannot be restored from its transaction log.");
    finalState = projected.state;
  }
  const finalStateHash = structuralHash(finalState);
  const replay = {
    checkpoint: immutableCanonicalJsonClone(checkpoint) as TopologyCommandState,
    checkpointStateHash: structuralHash(checkpoint),
    transactions: immutableCanonicalJsonClone(transactions) as readonly TopologyReplayTransaction[],
    cursor,
    finalStateHash,
  };
  const replayed = replayTopologyCommandLog(replay);
  if (!replayed.ok) throw new TypeError(replayed.errors.join(" "));
  return immutableCanonicalJsonClone(replay) as TopologyReplayBundle;
};

export const createTopologyPersistenceRecord = (
  value: Omit<TopologyPersistenceRecord, "format" | "schemaVersion">
): TopologyPersistenceRecord => {
  const normalized = normalizeTopologyPersistenceRecord({
    format: TOPOLOGY_PERSISTENCE_FORMAT,
    schemaVersion: TOPOLOGY_PERSISTENCE_SCHEMA_VERSION,
    ...value,
  });
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const serializeTopologyPersistenceRecord = (value: TopologyPersistenceRecord): string => {
  const normalized = normalizeTopologyPersistenceRecord(value);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return canonicalJsonStringify(normalized.value);
};

export const deserializeTopologyPersistenceRecord = (serialized: string): ValidationResult<TopologyPersistenceRecord> => {
  try {
    return normalizeTopologyPersistenceRecord(JSON.parse(serialized));
  } catch (error) {
    return { ok: false, errors: [`Topology persistence JSON is invalid: ${String((error as Error).message ?? error)}`] };
  }
};
