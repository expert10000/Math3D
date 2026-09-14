import type { TopologyAnimationPlan } from "./animationPlan";
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

export type TopologyDocument = TopologyDocumentV1 | TopologyDocumentV2;

export type TopologyDocumentLoadAudit = {
  loadedVersion: 1 | 2;
  migration: "v1-recomputed" | "v2-verified" | "v2-stale-recomputed";
  cacheStatus: "current" | "recomputed";
  warnings: string[];
};

export type LoadedTopologyDocument = {
  document: TopologyDocumentV2;
  diagram: FundamentalDiagram;
  buildResult: QuotientBuildResult;
  audit: TopologyDocumentLoadAudit;
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

export const isTopologyDocument = (value: unknown): value is TopologyDocument =>
  isTopologyDocumentV1(value) || isTopologyDocumentV2(value);

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

export const migrateTopologyDocument = (value: unknown): LoadedTopologyDocument | null => {
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
