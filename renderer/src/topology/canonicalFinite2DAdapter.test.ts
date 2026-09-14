import { describe, expect, it } from "vitest";
import corpusJson from "../../../tests/fixtures/topology-v1/canonical-regression-corpus.json";
import {
  canonicalizeFinite2DTopologyDocument,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument as createSharedTopologyDocument,
  locateCanonicalCellSourceReferences,
  type CanonicalJsonValue,
  type TopologyDocument,
  type TopologyDocumentSource,
} from "@math3d/core";
import { canonicalizeFundamentalDiagramTopologyDocument } from "./canonicalFinite2DAdapter";
import { createTopologyDocument as createCurrentTopologyDocument } from "./documentFormat";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline, deriveFundamentalDiagramQuotient } from "./quotientBuilder";
import { adaptCurrentTopologyDocument } from "./topologyDocumentAdapter";

type CorpusEntry = {
  id: string;
  source:
    | { kind: "preset"; presetId: string }
    | { kind: "cw-complex"; value: Record<string, CanonicalJsonValue> };
  expected: { canonicalCellCounts: [number, number, number] };
  sourceToView: {
    sourceCell: { dimension: 0 | 1 | 2; cellId: string };
    canonicalCellId: string;
  };
};

const corpus = corpusJson as unknown as { entries: CorpusEntry[] };

const sharedDocument = (
  kind: TopologyDocumentSource["kind"],
  model: Record<string, CanonicalJsonValue>,
  key: string
): TopologyDocument => {
  const id = createStableDocumentId("topology", { corpusId: key });
  const source: TopologyDocumentSource = { sourceId: `${id}/source`, kind, model };
  return createSharedTopologyDocument({
    identity: createDocumentIdentity(id, source),
    source,
    canonicalComplex: null,
    results: [],
    displayRealizations: [],
    provenance: {
      origin: "native",
      sourceFormat: "topology-v1-canonical-regression",
      sourceVersion: 1,
      diagnostics: [],
    },
  });
};

describe("fundamental-diagram canonical finite 2D adapter", () => {
  it("canonicalizes every T01 source deterministically with its reviewed source mapping", () => {
    for (const entry of corpus.entries) {
      let document: TopologyDocument;
      let outcome;
      if (entry.source.kind === "cw-complex") {
        document = sharedDocument("cw-complex", entry.source.value, entry.id);
        outcome = canonicalizeFinite2DTopologyDocument(document, 3);
      } else {
        const diagram = TOPOLOGY_PRESET_BY_ID.get(entry.source.presetId)!.buildDiagram();
        const adapted = adaptCurrentTopologyDocument(createCurrentTopologyDocument(diagram));
        expect(adapted.document).toBeTruthy();
        document = adapted.document!;
        outcome = canonicalizeFundamentalDiagramTopologyDocument(document, 3);
      }
      const replay = entry.source.kind === "cw-complex"
        ? canonicalizeFinite2DTopologyDocument(document, 3)
        : canonicalizeFundamentalDiagramTopologyDocument(document, 3);

      expect(outcome.status, entry.id).toBe("canonicalized");
      expect(replay).toEqual(outcome);
      if (outcome.status !== "canonicalized") continue;
      expect([
        outcome.complex.vertices.length,
        outcome.complex.edges.length,
        outcome.complex.faces.length,
      ], entry.id).toEqual(entry.expected.canonicalCellCounts);
      expect(locateCanonicalCellSourceReferences(outcome.complex, {
        dimension: entry.sourceToView.sourceCell.dimension,
        cellId: entry.sourceToView.canonicalCellId,
      }), entry.id).toEqual(expect.arrayContaining([
        expect.objectContaining({
          stage: "source",
          dimension: entry.sourceToView.sourceCell.dimension,
          cellId: entry.sourceToView.sourceCell.cellId,
        }),
      ]));
    }
  });

  it("matches released quotient cells while excluding realizations and analysis", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const legacy = buildQuotientPipeline(diagram).topologyObject.canonical;
    const shared = adaptCurrentTopologyDocument(createCurrentTopologyDocument(diagram)).document!;
    const outcome = canonicalizeFundamentalDiagramTopologyDocument(shared);

    expect(outcome.status).toBe("canonicalized");
    if (outcome.status !== "canonicalized") return;
    expect(outcome.complex.vertices.map((cell) => cell.id)).toEqual(legacy.vertices.map((cell) => cell.id));
    expect(outcome.complex.edges.map(({ id, endpoints }) => ({ id, endpoints }))).toEqual(
      legacy.edges.map(({ id, endpoints }) => ({ id, endpoints }))
    );
    expect(outcome.complex.faces.map((face) => face.attachment.map(({ edgeId, direction }) => ({ edgeId, direction })))).toEqual(
      legacy.faces.map((face) => face.attachment)
    );
    expect(outcome).not.toHaveProperty("realizations");
    expect(outcome).not.toHaveProperty("analysis");
    expect(deriveFundamentalDiagramQuotient(diagram)).not.toHaveProperty("realizations");
  });

  it("is unaffected by display-realization references on the shared document", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("cylinder")!.buildDiagram();
    const base = adaptCurrentTopologyDocument(createCurrentTopologyDocument(diagram)).document!;
    const sourceGeneration = {
      documentId: base.identity.id,
      revision: base.identity.revision,
      structuralHash: base.identity.structuralHash,
      generation: 1,
    };
    const decorated = createSharedTopologyDocument({
      identity: base.identity,
      source: base.source,
      canonicalComplex: base.canonicalComplex,
      results: base.results,
      displayRealizations: [{
        realizationId: "display:unrelated",
        kind: "immersed",
        authority: "illustrative",
        source: sourceGeneration,
        state: "available",
        artifact: { artifactId: "artifact:unrelated", kind: "mesh", role: "display-only" },
      }],
      provenance: base.provenance,
    });

    expect(canonicalizeFundamentalDiagramTopologyDocument(decorated, 8)).toEqual(
      canonicalizeFundamentalDiagramTopologyDocument(base, 8)
    );
  });

  it("returns explicit failures for wrong or malformed source contracts", () => {
    const cw = sharedDocument("cw-complex", {
      id: "point",
      name: "Point",
      vertices: [{ id: "v" }],
      edges: [],
      faces: [],
    }, "wrong-adapter");
    expect(canonicalizeFundamentalDiagramTopologyDocument(cw).status).toBe("unsupported");

    const malformed = sharedDocument("fundamental-diagram", { id: "bad" }, "bad-diagram");
    const outcome = canonicalizeFundamentalDiagramTopologyDocument(malformed);
    expect(outcome.status).toBe("invalid-source");
    if (outcome.status === "invalid-source") {
      expect(outcome.diagnostics[0]?.code).toBe("canonicalization/invalid-fundamental-diagram");
    }
  });
});
