import type { TopologyAnimationPlan } from "./animationPlan";
import {
  createTopologyDocument as createSharedTopologyDocument,
  createTopologyPersistenceRecord,
  normalizeTopologyPersistenceRecord,
  type AnalysisResultEnvelope,
  type ScientificSourceGeneration,
  type TopologyDocument as SharedTopologyDocument,
  type TopologyPersistedArtifactReference,
  type TopologyPersistenceRecord,
  type TopologyReplayBundle,
} from "@math3d/core";
import type {
  CanonicalTopologyComplex,
  TopologyAnalysisResult,
  TopologyProvenance,
  TopologySource,
} from "./core";
import { hashTopologyValue } from "./core";
import { buildQuotientPipeline, cloneFundamentalDiagram } from "./quotientBuilder";
import type { FundamentalDiagram, QuotientBuildResult, Realization3D } from "./types";

export type TopologyDocumentView = "diagram" | "complex" | "algebra" | "quotient" | "realization" | "animation";

export const TOPOLOGY_DOCUMENT_EXTENSION = ".math3d-topology";

/** Read-only compatibility shape. V1 caches are never authoritative on load. */
export type TopologyDocumentV1 = {
  format: "math3d-topology";
  version: 1;
  extension: typeof TOPOLOGY_DOCUMENT_EXTENSION;
  savedAt: string;
  payload: {
    diagram: FundamentalDiagram;
    cache?: {
      buildResult: QuotientBuildResult;
      activeView: TopologyDocumentView;
      activeRealizationId: string | null;
      realizationChoiceIds: string[];
      animationPlan?: TopologyAnimationPlan;
    };
  };
};

export type TopologyDocumentCacheV2 = {
  sourceHash: string;
  canonicalHash: string;
  coefficientDomains: Array<"Z" | "Z/2Z">;
  algorithmVersions: Record<string, string>;
  analysis: TopologyAnalysisResult;
};

export type TopologyDocumentV2 = {
  format: "math3d-topology";
  version: 2;
  extension: typeof TOPOLOGY_DOCUMENT_EXTENSION;
  savedAt: string;
  payload: {
    /** Authoritative editable object. Serialized canonical/results are derived snapshots. */
    source: TopologySource;
    canonical: CanonicalTopologyComplex;
    provenance: TopologyProvenance;
    cache: TopologyDocumentCacheV2;
    realizations: Realization3D[];
    viewState: {
      activeView: TopologyDocumentView;
      activeRealizationId: string | null;
      animationPlan?: TopologyAnimationPlan;
    };
    history: {
      undo: FundamentalDiagram[];
      redo: FundamentalDiagram[];
    };
  };
};

export type TopologyDocumentV3 = {
  format: "math3d-topology";
  version: 3;
  extension: typeof TOPOLOGY_DOCUMENT_EXTENSION;
  savedAt: string;
  payload: {
    persistence: TopologyPersistenceRecord;
    viewState: {
      activeView: TopologyDocumentView;
      activeRealizationId: string | null;
      animationPlan?: TopologyAnimationPlan;
    };
  };
};

export type TopologyDocument = TopologyDocumentV1 | TopologyDocumentV2 | TopologyDocumentV3;

export type TopologyDocumentLoadAudit = {
  loadedVersion: 1 | 2 | 3;
  migration: "v1-recomputed" | "v2-verified" | "v2-stale-recomputed" | "v3-replayed";
  cacheStatus: "current" | "recomputed" | "replayed";
  warnings: string[];
};

export type LoadedTopologyDocument = {
  document: TopologyDocumentV2;
  diagram: FundamentalDiagram;
  buildResult: QuotientBuildResult;
  audit: TopologyDocumentLoadAudit;
  persistence?: TopologyPersistenceRecord;
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";

export const isTopologyDocumentV1 = (value: unknown): value is TopologyDocumentV1 => {
  if (!isRecord(value)) return false;
  const payload = isRecord(value.payload) ? value.payload : null;
  return (
    value.format === "math3d-topology" &&
    value.version === 1 &&
    value.extension === TOPOLOGY_DOCUMENT_EXTENSION &&
    !!payload &&
    isRecord(payload.diagram)
  );
};

export const isTopologyDocumentV2 = (value: unknown): value is TopologyDocumentV2 => {
  if (!isRecord(value)) return false;
  const payload = isRecord(value.payload) ? value.payload : null;
  const source = payload && isRecord(payload.source) ? payload.source : null;
  const cache = payload && isRecord(payload.cache) ? payload.cache : null;
  const history = payload && isRecord(payload.history) ? payload.history : null;
  return (
    value.format === "math3d-topology" &&
    value.version === 2 &&
    value.extension === TOPOLOGY_DOCUMENT_EXTENSION &&
    !!payload &&
    !!source &&
    source.kind === "fundamental-diagram" &&
    isRecord(source.value) &&
    isRecord(payload.canonical) &&
    isRecord(payload.provenance) &&
    !!cache &&
    typeof cache.sourceHash === "string" &&
    typeof cache.canonicalHash === "string" &&
    isRecord(cache.algorithmVersions) &&
    Array.isArray(cache.coefficientDomains) &&
    Array.isArray(payload.realizations) &&
    isRecord(payload.viewState) &&
    !!history &&
    Array.isArray(history.undo) &&
    Array.isArray(history.redo)
  );
};

export const isTopologyDocumentV3 = (value: unknown): value is TopologyDocumentV3 => {
  if (!isRecord(value)) return false;
  const payload = isRecord(value.payload) ? value.payload : null;
  const viewState = payload && isRecord(payload.viewState) ? payload.viewState : null;
  return (
    value.format === "math3d-topology" &&
    value.version === 3 &&
    value.extension === TOPOLOGY_DOCUMENT_EXTENSION &&
    typeof value.savedAt === "string" &&
    !!payload &&
    normalizeTopologyPersistenceRecord(payload.persistence).ok &&
    !!viewState &&
    typeof viewState.activeView === "string" &&
    (viewState.activeRealizationId === null || typeof viewState.activeRealizationId === "string")
  );
};

export const isTopologyDocument = (value: unknown): value is TopologyDocument =>
  isTopologyDocumentV1(value) || isTopologyDocumentV2(value) || isTopologyDocumentV3(value);

const algorithmVersionsFor = (buildResult: QuotientBuildResult): Record<string, string> => ({
  canonicalization: buildResult.topologyObject.provenance.canonicalization.algorithmVersion,
  structuralValidation: buildResult.structuralValidation.algorithmVersion,
  cellularBoundaryOperators: buildResult.cellularBoundaryOperators.algorithmVersion,
  homology: buildResult.homology.algorithmVersion,
  algebraicConsistency: buildResult.algebraicConsistency.algorithmVersion,
  fundamentalGroup: buildResult.fundamentalGroup.algorithmVersion,
  surfaceClassification: buildResult.surfaceClassification.algorithmVersion,
});

const sameStringRecord = (left: Record<string, string>, right: Record<string, string>): boolean => {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort((a, b) => a.localeCompare(b));
  return keys.every((key) => left[key] === right[key]);
};

export const createTopologyDocument = (
  diagram: FundamentalDiagram,
  cache?: {
    buildResult: QuotientBuildResult;
    activeView: TopologyDocumentView;
    activeRealizationId: string | null;
    animationPlan?: TopologyAnimationPlan;
    undoHistory?: FundamentalDiagram[];
    redoHistory?: FundamentalDiagram[];
  }
): TopologyDocumentV2 => {
  const candidate = cache?.buildResult;
  const expectedSourceHash = hashTopologyValue({ kind: "fundamental-diagram", value: diagram });
  const candidateIsCurrent =
    candidate?.topologyObject.provenance.source.hash === expectedSourceHash &&
    hashTopologyValue(candidate.topologyObject.canonical) === candidate.topologyObject.provenance.canonicalization.hash;
  const built = candidate && candidateIsCurrent ? candidate : buildQuotientPipeline(diagram);
  const object = built.topologyObject;
  return {
    format: "math3d-topology",
    version: 2,
    extension: TOPOLOGY_DOCUMENT_EXTENSION,
    savedAt: new Date().toISOString(),
    payload: {
      source: object.source,
      canonical: object.canonical,
      provenance: object.provenance,
      cache: {
        sourceHash: object.provenance.source.hash,
        canonicalHash: object.provenance.canonicalization.hash,
        coefficientDomains: ["Z", "Z/2Z"],
        algorithmVersions: algorithmVersionsFor(built),
        analysis: object.analysis ?? {},
      },
      realizations: built.realizations,
      viewState: {
        activeView: cache?.activeView ?? "diagram",
        activeRealizationId: cache?.activeRealizationId ?? built.realizations[0]?.id ?? null,
        animationPlan: cache?.animationPlan,
      },
      history: {
        undo: (cache?.undoHistory ?? []).map(cloneFundamentalDiagram),
        redo: (cache?.redoHistory ?? []).map(cloneFundamentalDiagram),
      },
    },
  };
};

const sourceGenerationForDocument = (document: SharedTopologyDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation: 1,
});

export const createReplayableTopologyDocument = (args: {
  document: SharedTopologyDocument;
  replay: TopologyReplayBundle;
  canonicalHash: TopologyPersistenceRecord["canonicalHash"];
  results: readonly AnalysisResultEnvelope[];
  artifactHandles: readonly AnalysisResultEnvelope["artifacts"][number][];
  activeView: TopologyDocumentView;
  activeRealizationId: string | null;
  animationPlan?: TopologyAnimationPlan;
}): TopologyDocumentV3 => {
  const source = sourceGenerationForDocument(args.document);
  const results = [...new Map(args.results.map((result) => [result.resultId, result])).values()];
  const document = createSharedTopologyDocument({
    identity: args.document.identity,
    source: args.document.source,
    canonicalComplex: null,
    results: results.map((result) => ({
      resultId: result.resultId,
      resultType: result.provenance.operation.type,
      source,
      state: "available",
    })),
    displayRealizations: args.document.displayRealizations,
    provenance: {
      origin: "native",
      sourceFormat: "math3d-topology",
      sourceVersion: 3,
      diagnostics: [],
    },
  });
  const artifactHandles = [...new Map([
    ...args.artifactHandles,
    ...results.flatMap((result) => result.artifacts),
  ].map((handle) => [handle.artifactId, handle])).values()];
  const artifacts: TopologyPersistedArtifactReference[] = artifactHandles.map((handle) => ({
    handle,
    source,
    state: "unavailable",
    reason: "payload-not-embedded",
  }));
  const persistence = createTopologyPersistenceRecord({
    document,
    replay: args.replay,
    canonicalHash: args.canonicalHash,
    results,
    artifacts,
  });
  return {
    format: "math3d-topology",
    version: 3,
    extension: TOPOLOGY_DOCUMENT_EXTENSION,
    savedAt: new Date().toISOString(),
    payload: {
      persistence,
      viewState: {
        activeView: args.activeView,
        activeRealizationId: args.activeRealizationId,
        ...(args.animationPlan ? { animationPlan: args.animationPlan } : {}),
      },
    },
  };
};

export const migrateTopologyDocument = (value: unknown): LoadedTopologyDocument | null => {
  if (isTopologyDocumentV3(value)) {
    const normalized = normalizeTopologyPersistenceRecord(value.payload.persistence);
    if (!normalized.ok || normalized.value.document.source.kind !== "fundamental-diagram") return null;
    const persistence = normalized.value;
    const diagram = cloneFundamentalDiagram(persistence.document.source.model as unknown as FundamentalDiagram);
    const buildResult = buildQuotientPipeline(diagram);
    const compatibilityDocument = createTopologyDocument(diagram, {
      buildResult,
      activeView: value.payload.viewState.activeView,
      activeRealizationId: value.payload.viewState.activeRealizationId,
      animationPlan: value.payload.viewState.animationPlan,
      undoHistory: Array.from({ length: persistence.replay.cursor }, () => cloneFundamentalDiagram(diagram)),
      redoHistory: Array.from({ length: persistence.replay.transactions.length - persistence.replay.cursor }, () => cloneFundamentalDiagram(diagram)),
    });
    return {
      document: compatibilityDocument,
      diagram,
      buildResult,
      persistence,
      audit: {
        loadedVersion: 3,
        migration: "v3-replayed",
        cacheStatus: "replayed",
        warnings: persistence.artifacts.map((artifact) =>
          `Artifact '${artifact.handle.artifactId}' is unavailable after reopen; recompute ${artifact.handle.role}.`
        ),
      },
    };
  }
  if (isTopologyDocumentV1(value)) {
    const diagram = cloneFundamentalDiagram(value.payload.diagram);
    const buildResult = buildQuotientPipeline(diagram);
    const legacyCache = value.payload.cache;
    const document = createTopologyDocument(diagram, {
      buildResult,
      activeView: legacyCache?.activeView ?? "diagram",
      activeRealizationId: legacyCache?.activeRealizationId ?? buildResult.realizations[0]?.id ?? null,
      animationPlan: legacyCache?.animationPlan,
    });
    return {
      document,
      diagram,
      buildResult,
      audit: {
        loadedVersion: 1,
        migration: "v1-recomputed",
        cacheStatus: "recomputed",
        warnings: ["Legacy v1 cache was ignored; canonical data and analysis were deterministically recomputed from the source diagram."],
      },
    };
  }
  if (!isTopologyDocumentV2(value) || value.payload.source.kind !== "fundamental-diagram") return null;

  const diagram = cloneFundamentalDiagram(value.payload.source.value);
  const buildResult = buildQuotientPipeline(diagram);
  const provenance = buildResult.topologyObject.provenance;
  const fingerprintsMatch =
    hashTopologyValue(value.payload.canonical) === provenance.canonicalization.hash &&
    value.payload.provenance.source.hash === provenance.source.hash &&
    value.payload.provenance.canonicalization.hash === provenance.canonicalization.hash &&
    value.payload.cache.sourceHash === provenance.source.hash &&
    value.payload.cache.canonicalHash === provenance.canonicalization.hash;
  const versionsMatch = sameStringRecord(value.payload.cache.algorithmVersions, algorithmVersionsFor(buildResult));
  const current = fingerprintsMatch && versionsMatch;
  const document = createTopologyDocument(diagram, {
    buildResult,
    activeView: value.payload.viewState.activeView,
    activeRealizationId: value.payload.viewState.activeRealizationId,
    animationPlan: value.payload.viewState.animationPlan,
    undoHistory: value.payload.history.undo,
    redoHistory: value.payload.history.redo,
  });
  return {
    document,
    diagram,
    buildResult,
    audit: {
      loadedVersion: 2,
      migration: current ? "v2-verified" : "v2-stale-recomputed",
      cacheStatus: current ? "current" : "recomputed",
      warnings: current
        ? []
        : ["Serialized derived data was stale or built by different algorithms and was recomputed from the authoritative source."],
    },
  };
};
