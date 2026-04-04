import type { FundamentalDiagram, QuotientBuildResult } from "./types";

export type TopologyDocumentView = "diagram" | "quotient" | "realization" | "animation";

export type TopologyDocumentCache = {
  buildResult: QuotientBuildResult;
  activeView: TopologyDocumentView;
  activeRealizationId: string | null;
  realizationChoiceIds: string[];
};

export type TopologyDocument = {
  format: "math3d-topology";
  version: 1;
  extension: ".math3d-topology";
  savedAt: string;
  payload: {
    diagram: FundamentalDiagram;
    cache?: TopologyDocumentCache;
  };
};

export const TOPOLOGY_DOCUMENT_EXTENSION = ".math3d-topology";

export const isTopologyDocument = (value: unknown): value is TopologyDocument => {
  if (!value || typeof value !== "object") return false;
  const doc = value as TopologyDocument;
  return (
    doc.format === "math3d-topology" &&
    doc.version === 1 &&
    doc.extension === TOPOLOGY_DOCUMENT_EXTENSION &&
    !!doc.payload?.diagram
  );
};

export const createTopologyDocument = (
  diagram: FundamentalDiagram,
  cache?: {
    buildResult: QuotientBuildResult;
    activeView: TopologyDocumentView;
    activeRealizationId: string | null;
  }
): TopologyDocument => ({
  format: "math3d-topology",
  version: 1,
  extension: TOPOLOGY_DOCUMENT_EXTENSION,
  savedAt: new Date().toISOString(),
  payload: {
    diagram,
    cache: cache
      ? {
          buildResult: cache.buildResult,
          activeView: cache.activeView,
          activeRealizationId: cache.activeRealizationId,
          realizationChoiceIds: cache.buildResult.realizations.map((entry) => entry.id),
        }
      : undefined,
  },
});
