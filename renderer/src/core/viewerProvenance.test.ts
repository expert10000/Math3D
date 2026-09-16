import { describe, expect, it } from "vitest";
import {
  createAnalysisResultEnvelope, createDocumentIdentity, createDocumentRelation,
  createStableDocumentId, createViewerProvenanceEvidence, normalizeViewerCommittedSelection,
  traceViewerLineage, viewerLineageIndex, viewerSourceFromDocument,
  type ScientificSourceGeneration,
} from "@math3d/core";

const generation = (label: string, revision = 1): ScientificSourceGeneration => {
  const identity = createDocumentIdentity(createStableDocumentId("volume", label), { label, revision }, revision);
  return viewerSourceFromDocument({ identity });
};

describe("GK16 shared Viewer/Inspector provenance", () => {
  it("keeps authority, availability, source staleness and snapshot lineage distinct", () => {
    const source = generation("source");
    const result = createAnalysisResultEnvelope({
      resultId: "volume-result:1", status: "numerical",
      provenance: { source, operation: { type: "volume.extract.isosurface", algorithm: "marching-cubes", algorithmVersion: "1", parameters: { isoValue: 0 } },
        numericContext: { tolerance: { absolute: 1e-6 }, precision: { decimalDigits: 6 } }, engine: { name: "worker", version: "1" }, elapsedMs: 10 },
      summary: {}, warnings: [], diagnostics: [], artifacts: [{ artifactId: "surface:1", kind: "mesh", role: "boundary" }],
    });
    const relation = createDocumentRelation({ kind: "analysis-of", sources: [source], sourceOrder: "ordered",
      target: { type: "result", resultId: result.resultId, resultType: "volume-isosurface" }, operation: "volume.extract.isosurface", parameters: {} });
    const selection = { state: "committed" as const, source, entityIds: ["vertex:4"] };
    const current = createViewerProvenanceEvidence({ source, current: source, relations: [relation], result,
      artifactAvailable: () => true, selection });
    expect(current).toMatchObject({ status: "current", authority: "numerical", operation: "volume.extract.isosurface",
      method: "marching-cubes", engine: "worker 1", precision: 6, absoluteTolerance: 1e-6, selectedEntityIds: ["vertex:4"] });
    expect(createViewerProvenanceEvidence({ source, current: source, result, artifactAvailable: () => false }).status).toBe("unavailable");
    expect(createViewerProvenanceEvidence({ source, current: generation("source", 2), relations: [relation], result,
      artifactAvailable: () => true }).status).toBe("stale");
    expect(createViewerProvenanceEvidence({ source: generation("source", 2), current: generation("source", 2), result,
      artifactAvailable: () => true }).status).toBe("stale");
    expect(createViewerProvenanceEvidence({ source, current: generation("source", 2), relations: [relation], result,
      artifactAvailable: () => false, snapshot: true })).toMatchObject({ status: "snapshot", lineageStatus: "stale" });
  });

  it("never promotes hover/preview or another generation into committed selection", () => {
    const source = generation("selection");
    expect(normalizeViewerCommittedSelection({ state: "hover", source, entityIds: ["vertex:1"] })).toBeNull();
    expect(normalizeViewerCommittedSelection({ state: "preview", source, entityIds: ["vertex:1"] })).toBeNull();
    expect(createViewerProvenanceEvidence({ source, current: source, selection: {
      state: "committed", source: generation("selection", 2), entityIds: ["vertex:1"],
    } }).selectedEntityIds).toEqual([]);
  });

  it("traverses multi-module lineage through exact relations without a UI-owned graph", () => {
    const volume = generation("volume");
    const surface = generation("surface");
    const mesh = generation("mesh");
    const relations = [
      createDocumentRelation({ kind: "derived-from", sources: [volume], sourceOrder: "ordered", target: { type: "document", generation: surface }, operation: "volume.extract.isosurface", parameters: {} }),
      createDocumentRelation({ kind: "derived-from", sources: [surface], sourceOrder: "ordered", target: { type: "document", generation: mesh }, operation: "surface.mesh.realize", parameters: {} }),
    ];
    const resolved = new Map([volume, surface, mesh].map((source) => [source.documentId, source]));
    const paths = traceViewerLineage(viewerLineageIndex(relations), { type: "document", generation: mesh }, (id) => resolved.get(id) ?? null);
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.map((step) => step.operation)).toEqual(["surface.mesh.realize", "volume.extract.isosurface"]);
    expect(paths[0].root).toEqual(volume);
  });
});
