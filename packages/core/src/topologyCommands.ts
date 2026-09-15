import {
  advanceDocumentIdentity,
  type CanonicalJsonValue,
  type StructuralHash,
} from "./documentIdentity";
import {
  createTopologyDocument,
  normalizeTopologyDocument,
  topologyDocumentSourceHash,
  type TopologyDocument,
  type TopologyDocumentSource,
} from "./topologyDocument";
import type { CommandDefinition, DeepReadonly } from "./commands";
import type { ValidationResult } from "./validation";

export const TOPOLOGY_COMMAND_TYPES = {
  replaceSource: "topology.source.replace",
  setPairing: "topology.pairing.set",
  requestCanonicalization: "topology.canonicalize.request",
  commitSelection: "topology.selection.commit",
  requestAnalysis: "topology.analysis.request",
} as const;

export type TopologyCommittedSelection = Readonly<{
  dimension: 0 | 1 | 2;
  cellIds: readonly string[];
}>;

export type TopologySourceBoundRequest = Readonly<{
  requestId: string;
  sourceRevision: number;
  sourceHash: StructuralHash;
}>;

export type TopologyAnalysisRequest = TopologySourceBoundRequest & Readonly<{
  analysisType: string;
}>;

/** JSON-only state owned by the topology document kernel. */
export type TopologyCommandState = Readonly<{
  document: TopologyDocument;
  committedSelection: TopologyCommittedSelection | null;
  canonicalizationRequest: TopologySourceBoundRequest | null;
  analysisRequest: TopologyAnalysisRequest | null;
}>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const NAMESPACED_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

const isRecord = (value: unknown): value is Record<string, CanonicalJsonValue> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const exactFields = (record: Record<string, CanonicalJsonValue>, fields: readonly string[]): boolean => {
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
};

const cloneJson = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

const validateSource = (value: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => {
  if (!isRecord(value) || !exactFields(value, ["sourceId", "kind", "model"])) {
    return { ok: false, errors: ["topology.source.replace requires exactly sourceId, kind, and model."] };
  }
  if (typeof value.sourceId !== "string" || !SAFE_ID.test(value.sourceId)) {
    return { ok: false, errors: ["topology sourceId must be an ID-safe string."] };
  }
  if (![
    "fundamental-diagram", "cw-complex", "simplicial-complex", "mesh-snapshot", "geometry-snapshot",
  ].includes(String(value.kind))) {
    return { ok: false, errors: ["topology source kind is unsupported."] };
  }
  if (!isRecord(value.model)) {
    return { ok: false, errors: ["topology source model must be a canonical JSON object."] };
  }
  return { ok: true, value: cloneJson(value) };
};

const sourceFromPayload = (payload: CanonicalJsonValue): TopologyDocumentSource =>
  cloneJson(payload) as unknown as TopologyDocumentSource;

const replaceSource = (
  state: DeepReadonly<TopologyCommandState>,
  source: TopologyDocumentSource
): TopologyCommandState => {
  const current = state.document as TopologyDocument;
  if (topologyDocumentSourceHash(source) === current.identity.structuralHash) {
    return cloneJson(state) as TopologyCommandState;
  }
  const identity = advanceDocumentIdentity(current.identity, source);
  return {
    document: createTopologyDocument({
      identity,
      source,
      canonicalComplex: null,
      results: [],
      displayRealizations: [],
      provenance: cloneJson(current.provenance),
    }),
    committedSelection: null,
    canonicalizationRequest: null,
    analysisRequest: null,
  };
};

const validatePairing = (payload: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => {
  if (!isRecord(payload) || !exactFields(payload, ["edgeId", "pairedEdgeIds"])) {
    return { ok: false, errors: ["topology.pairing.set requires exactly edgeId and pairedEdgeIds."] };
  }
  if (typeof payload.edgeId !== "string" || !SAFE_ID.test(payload.edgeId)) {
    return { ok: false, errors: ["pairing edgeId must be an ID-safe string."] };
  }
  if (
    !Array.isArray(payload.pairedEdgeIds) ||
    payload.pairedEdgeIds.some((entry) => typeof entry !== "string" || !SAFE_ID.test(entry)) ||
    new Set(payload.pairedEdgeIds).size !== payload.pairedEdgeIds.length
  ) {
    return { ok: false, errors: ["pairedEdgeIds must be a duplicate-free array of ID-safe strings."] };
  }
  return { ok: true, value: { edgeId: payload.edgeId, pairedEdgeIds: [...payload.pairedEdgeIds] } };
};

const validateRequest = (payload: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => {
  if (!isRecord(payload) || !exactFields(payload, ["requestId"]) ||
      typeof payload.requestId !== "string" || !SAFE_ID.test(payload.requestId)) {
    return { ok: false, errors: ["requestId must be the only field and must be ID-safe."] };
  }
  return { ok: true, value: { requestId: payload.requestId } };
};

const validateSelection = (payload: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => {
  if (!isRecord(payload) || !exactFields(payload, ["dimension", "cellIds"]) ||
      ![0, 1, 2].includes(payload.dimension as number) || !Array.isArray(payload.cellIds) ||
      payload.cellIds.some((entry) => typeof entry !== "string" || !SAFE_ID.test(entry)) ||
      new Set(payload.cellIds).size !== payload.cellIds.length) {
    return { ok: false, errors: ["Committed selection requires dimension 0, 1, or 2 and unique ID-safe cellIds."] };
  }
  return { ok: true, value: { dimension: payload.dimension, cellIds: [...payload.cellIds] } };
};

const validateAnalysisRequest = (payload: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => {
  if (!isRecord(payload) || !exactFields(payload, ["requestId", "analysisType"]) ||
      typeof payload.requestId !== "string" || !SAFE_ID.test(payload.requestId) ||
      typeof payload.analysisType !== "string" || !NAMESPACED_TYPE.test(payload.analysisType)) {
    return { ok: false, errors: ["Analysis request requires an ID-safe requestId and namespaced analysisType."] };
  }
  return { ok: true, value: { requestId: payload.requestId, analysisType: payload.analysisType } };
};

const boundRequest = (
  state: DeepReadonly<TopologyCommandState>,
  requestId: string
): TopologySourceBoundRequest => ({
  requestId,
  sourceRevision: state.document.identity.revision,
  sourceHash: state.document.identity.structuralHash,
});

export const topologyCommandDefinitions: readonly CommandDefinition<TopologyCommandState>[] = [
  {
    type: TOPOLOGY_COMMAND_TYPES.replaceSource,
    validate: validateSource,
    project: (state, payload) => replaceSource(state, sourceFromPayload(payload)),
  },
  {
    type: TOPOLOGY_COMMAND_TYPES.setPairing,
    validate: validatePairing,
    project: (state, payload) => {
      if (state.document.source.kind !== "fundamental-diagram") {
        throw new Error("Pairing edits require a fundamental-diagram source.");
      }
      const record = payload as Record<string, CanonicalJsonValue>;
      const model = cloneJson(state.document.source.model) as Record<string, CanonicalJsonValue>;
      const pairings: Record<string, CanonicalJsonValue> = isRecord(model.edgePairings)
        ? { ...cloneJson(model.edgePairings) }
        : {};
      pairings[record.edgeId as string] = [...record.pairedEdgeIds as string[]];
      model.edgePairings = pairings;
      return replaceSource(state, {
        sourceId: state.document.source.sourceId,
        kind: state.document.source.kind,
        model,
      });
    },
  },
  {
    type: TOPOLOGY_COMMAND_TYPES.requestCanonicalization,
    validate: validateRequest,
    project: (state, payload) => ({
      ...cloneJson(state),
      canonicalizationRequest: boundRequest(state, (payload as Record<string, CanonicalJsonValue>).requestId as string),
    }),
  },
  {
    type: TOPOLOGY_COMMAND_TYPES.commitSelection,
    validate: validateSelection,
    project: (state, payload) => ({
      ...cloneJson(state),
      committedSelection: cloneJson(payload) as unknown as TopologyCommittedSelection,
    }),
  },
  {
    type: TOPOLOGY_COMMAND_TYPES.requestAnalysis,
    validate: validateAnalysisRequest,
    project: (state, payload) => {
      const record = payload as Record<string, CanonicalJsonValue>;
      return {
        ...cloneJson(state),
        analysisRequest: {
          ...boundRequest(state, record.requestId as string),
          analysisType: record.analysisType as string,
        },
      };
    },
  },
];

export const createTopologyCommandState = (document: TopologyDocument): TopologyCommandState => {
  const normalized = normalizeTopologyDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return {
    document: normalized.value,
    committedSelection: null,
    canonicalizationRequest: null,
    analysisRequest: null,
  };
};
