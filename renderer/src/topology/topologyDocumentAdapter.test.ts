import { describe, expect, it } from "vitest";
import corpusJson from "../../../tests/fixtures/topology-v1/canonical-regression-corpus.json";
import {
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument as createSharedTopologyDocument,
  deserializeTopologyDocument,
  serializeTopologyDocument,
  type CanonicalJsonValue,
  type TopologyDocumentSource,
} from "@math3d/core";
import { createTopologyDocument as createCurrentTopologyDocument } from "./documentFormat";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { adaptCurrentTopologyDocument } from "./topologyDocumentAdapter";

type CorpusEntry = {
  id: string;
  source:
    | { kind: "preset"; presetId: string }
    | { kind: "cw-complex"; value: Record<string, CanonicalJsonValue> };
};

const corpus = corpusJson as unknown as { entries: CorpusEntry[] };

describe("topology document compatibility adapter", () => {
  it("deterministically adapts a verified v2 file without promoting legacy results", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const current = createCurrentTopologyDocument(diagram);
    const first = adaptCurrentTopologyDocument(current);
    const second = adaptCurrentTopologyDocument(structuredClone(current));

    expect(first.disposition, first.diagnostics[0]?.message).toBe("migrated");
    expect(first.document?.identity).toEqual(second.document?.identity);
    expect(first.document?.source.model).toEqual(JSON.parse(JSON.stringify(diagram)));
    expect(first.document?.canonicalComplex?.state).toBe("legacy-embedded");
    expect(first.document?.results.length).toBeGreaterThan(0);
    expect(first.document?.results.every((result) => result.state === "legacy-limited")).toBe(true);
    expect(first.document?.displayRealizations.every((view) => view.authority === "illustrative")).toBe(true);
    expect(first.document?.results.every((result) => result.source.structuralHash === first.document?.identity.structuralHash)).toBe(true);

    const serialized = serializeTopologyDocument(first.document!);
    expect(deserializeTopologyDocument(serialized).ok).toBe(true);
    expect(serialized).not.toContain("vertexPositions");
    expect(serialized).not.toContain("faceRealizationMesh");
    expect(serialized).not.toContain('"status":"exact"');
  });

  it("withholds stale v2 canonical and result references while retaining illustrative display refs", () => {
    const current = createCurrentTopologyDocument(
      TOPOLOGY_PRESET_BY_ID.get("cylinder")!.buildDiagram()
    );
    const stale = structuredClone(current);
    stale.payload.cache.algorithmVersions.homology = "obsolete@0";
    stale.payload.canonical.name = "tampered snapshot";

    const adapted = adaptCurrentTopologyDocument(stale);
    expect(adapted.disposition, adapted.diagnostics[0]?.message).toBe("needs-canonicalization");
    expect(adapted.document?.canonicalComplex).toBeNull();
    expect(adapted.document?.results).toEqual([]);
    expect(adapted.document?.displayRealizations.length).toBeGreaterThan(0);
    expect(adapted.document?.displayRealizations.every((view) => view.state === "legacy-embedded")).toBe(true);
    expect(adapted.diagnostics[0]?.action).toMatch(/Canonicalize/i);
  });

  it("adapts v1 source only, ignores its cache, and requires canonicalization", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const legacy = {
      format: "math3d-topology",
      version: 1,
      extension: ".math3d-topology",
      savedAt: "2026-04-04T00:00:00.000Z",
      payload: {
        diagram,
        cache: { buildResult: { untrusted: true }, realizationChoiceIds: ["untrusted"] },
      },
    };

    const adapted = adaptCurrentTopologyDocument(legacy);
    expect(adapted.disposition).toBe("needs-canonicalization");
    expect(adapted.document?.source.model).toEqual(JSON.parse(JSON.stringify(diagram)));
    expect(adapted.document?.canonicalComplex).toBeNull();
    expect(adapted.document?.results).toEqual([]);
    expect(adapted.document?.displayRealizations).toEqual([]);
    expect(JSON.stringify(adapted.document)).not.toContain("untrusted");
  });

  it("returns an actionable view-only outcome for malformed or unsupported files", () => {
    const unsupported = adaptCurrentTopologyDocument({
      format: "math3d-topology",
      version: 99,
      extension: ".math3d-topology",
      payload: {},
    });
    expect(unsupported.disposition).toBe("view-only");
    expect(unsupported.document).toBeNull();
    expect(unsupported.diagnostics[0]?.action.length).toBeGreaterThan(10);

    const malformed = adaptCurrentTopologyDocument(null);
    expect(malformed.disposition).toBe("view-only");
  });

  it("wraps every T01 authoritative source in the shared document without changing it", () => {
    for (const entry of corpus.entries) {
      const rawModel = entry.source.kind === "cw-complex"
        ? entry.source.value
        : TOPOLOGY_PRESET_BY_ID.get(entry.source.presetId)!.buildDiagram() as unknown as Record<string, CanonicalJsonValue>;
      const model = JSON.parse(JSON.stringify(rawModel)) as Record<string, CanonicalJsonValue>;
      const kind = entry.source.kind === "cw-complex" ? "cw-complex" : "fundamental-diagram";
      const id = createStableDocumentId("topology", { corpusId: entry.id });
      const source: TopologyDocumentSource = { sourceId: `${id}/source`, kind, model };
      const document = createSharedTopologyDocument({
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
      const loaded = deserializeTopologyDocument(serializeTopologyDocument(document));
      expect(loaded.ok && loaded.value.source.model).toEqual(model);
    }
  });
});
