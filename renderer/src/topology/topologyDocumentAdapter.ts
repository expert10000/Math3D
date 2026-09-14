import {
  canonicalJsonStringify,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument as createSharedTopologyDocument,
  structuralHash,
  type CanonicalJsonValue,
  type ScientificSourceGeneration,
  type TopologyAnalysisResultReference,
  type TopologyDisplayRealizationReference,
  type TopologyDocument as SharedTopologyDocument,
  type TopologyDocumentDiagnostic,
  type TopologyDocumentSource,
} from "@math3d/core";
import {
  isTopologyDocumentV1,
  isTopologyDocumentV2,
  migrateTopologyDocument,
  type TopologyDocumentV1,
  type TopologyDocumentV2,
} from "./documentFormat";

export type TopologyDocumentAdaptationDisposition =
  | "migrated"
  | "needs-canonicalization"
  | "view-only";

export type TopologyDocumentAdaptation = Readonly<{
  disposition: TopologyDocumentAdaptationDisposition;
  document: SharedTopologyDocument | null;
  diagnostics: readonly TopologyDocumentDiagnostic[];
}>;

const VIEW_ONLY_DIAGNOSTIC: TopologyDocumentDiagnostic = {
  code: "topology-document/view-only",
  severity: "error",
  message: "This file is malformed or uses an unsupported topology document version.",
  action: "Open it with a compatible Math3D version or repair and re-export its authoritative source.",
};

const toPersistentJson = (value: unknown, path: string): CanonicalJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") throw new TypeError(`${path} contains non-JSON data.`);
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const normalized = toPersistentJson(entry, `${path}[${index}]`);
      if (normalized === undefined) throw new TypeError(`${path}[${index}] cannot be undefined.`);
      return normalized;
    });
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must contain only plain JSON objects.`);
  }
  const normalized: Record<string, CanonicalJsonValue> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const child = toPersistentJson(entry, `${path}.${key}`);
    if (child !== undefined) normalized[key] = child;
  }
  return normalized;
};

const cloneCanonicalObject = (value: unknown): Readonly<Record<string, CanonicalJsonValue>> => {
  const normalized = toPersistentJson(value, "$source");
  if (!normalized || Array.isArray(normalized) || typeof normalized !== "object") {
    throw new TypeError("The authoritative topology source must be a JSON object.");
  }
  return JSON.parse(canonicalJsonStringify(normalized)) as Record<string, CanonicalJsonValue>;
};

const sourceFor = (
  sourceKind: TopologyDocumentSource["kind"],
  legacySourceId: string,
  model: unknown
): { source: TopologyDocumentSource; identity: ReturnType<typeof createDocumentIdentity> } => {
  const documentId = createStableDocumentId("topology", {
    sourceFormat: "math3d-topology",
    sourceKind,
    legacySourceId,
  });
  const source: TopologyDocumentSource = {
    sourceId: `${documentId}/source`,
    kind: sourceKind,
    model: cloneCanonicalObject(model),
  };
  return { source, identity: createDocumentIdentity(documentId, source) };
};

const generationFor = (
  identity: ReturnType<typeof createDocumentIdentity>
): ScientificSourceGeneration => ({
  documentId: identity.id,
  revision: identity.revision,
  structuralHash: identity.structuralHash,
  generation: 1,
});

const namespacedLegacyResultType = (key: string): string =>
  `topology.${key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9-]/g, "-").toLowerCase()}`;

const displayReferencesFor = (
  value: TopologyDocumentV2,
  source: ScientificSourceGeneration
): TopologyDisplayRealizationReference[] =>
  [...value.payload.realizations]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((realization) => ({
      realizationId: realization.id,
      kind: realization.kind,
      authority: "illustrative",
      source,
      state: "legacy-embedded",
    }));

const resultReferencesFor = (
  value: TopologyDocumentV2,
  source: ScientificSourceGeneration
): TopologyAnalysisResultReference[] =>
  Object.keys(value.payload.cache.analysis)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const resultType = namespacedLegacyResultType(key);
      return {
        resultId: `${source.documentId}/result/${resultType.slice("topology.".length)}`,
        resultType,
        source,
        state: "legacy-limited",
      };
    });

const adaptV1 = (value: TopologyDocumentV1): TopologyDocumentAdaptation => {
  const legacyId = typeof value.payload.diagram.id === "string" ? value.payload.diagram.id : "unknown";
  const { source, identity } = sourceFor("fundamental-diagram", legacyId, value.payload.diagram);
  const diagnostic: TopologyDocumentDiagnostic = {
    code: "topology-document/needs-canonicalization",
    severity: "warning",
    message: "The v1 cache was ignored because it has no source-bound scientific provenance.",
    action: "Canonicalize the authoritative source before requesting formal analysis.",
  };
  return {
    disposition: "needs-canonicalization",
    diagnostics: [diagnostic],
    document: createSharedTopologyDocument({
      identity,
      source,
      canonicalComplex: null,
      results: [],
      displayRealizations: [],
      provenance: {
        origin: "current-format-adapter",
        sourceFormat: value.format,
        sourceVersion: value.version,
        diagnostics: [diagnostic],
      },
    }),
  };
};

const adaptV2 = (value: TopologyDocumentV2): TopologyDocumentAdaptation => {
  const migrated = migrateTopologyDocument(value);
  if (!migrated) throw new TypeError("The current topology document could not be verified.");

  const legacyId = typeof value.payload.source.value.id === "string"
    ? value.payload.source.value.id
    : "unknown";
  const { source, identity } = sourceFor(
    "fundamental-diagram",
    legacyId,
    value.payload.source.value
  );
  const sourceGeneration = generationFor(identity);
  const verified = migrated.audit.migration === "v2-verified";
  const diagnostic: TopologyDocumentDiagnostic = verified
    ? {
      code: "topology-document/legacy-results-limited",
      severity: "warning",
      message: "The v2 source and cache fingerprints were verified, but its pre-F06 results remain legacy-limited.",
      action: "Recompute results under versioned provenance before using them as current scientific evidence.",
    }
    : {
      code: "topology-document/needs-canonicalization",
      severity: "warning",
      message: "The v2 derived snapshots are stale or use different algorithms and were not published as references.",
      action: "Canonicalize the authoritative source and recompute formal results.",
    };

  return {
    disposition: verified ? "migrated" : "needs-canonicalization",
    diagnostics: [diagnostic],
    document: createSharedTopologyDocument({
      identity,
      source,
      canonicalComplex: verified
        ? {
          referenceId: `${identity.id}/canonical`,
          source: sourceGeneration,
          state: "legacy-embedded",
          canonicalHash: structuralHash(value.payload.canonical),
        }
        : null,
      results: verified ? resultReferencesFor(value, sourceGeneration) : [],
      displayRealizations: displayReferencesFor(value, sourceGeneration),
      provenance: {
        origin: "current-format-adapter",
        sourceFormat: value.format,
        sourceVersion: value.version,
        diagnostics: [diagnostic],
      },
    }),
  };
};

/** Adapts released renderer files without changing their save path or trusting stale data. */
export const adaptCurrentTopologyDocument = (value: unknown): TopologyDocumentAdaptation => {
  try {
    if (isTopologyDocumentV1(value)) return adaptV1(value);
    if (isTopologyDocumentV2(value)) return adaptV2(value);
  } catch (error) {
    // A recognized shell with malformed nested source data is view-only, never partly upgraded.
    return {
      disposition: "view-only",
      document: null,
      diagnostics: [{
        ...VIEW_ONLY_DIAGNOSTIC,
        message: `${VIEW_ONLY_DIAGNOSTIC.message} ${error instanceof Error ? error.message : "Adaptation failed."}`,
      }],
    };
  }
  return { disposition: "view-only", document: null, diagnostics: [VIEW_ONLY_DIAGNOSTIC] };
};
