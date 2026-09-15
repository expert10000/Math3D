import { describe, expect, it } from "vitest";
import corpusJson from "../../../tests/fixtures/topology-v1/canonical-regression-corpus.json";
import {
  canonicalizeFinite2DTopologyDocument,
  classifyCanonicalFinite2DSurface,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument as createSharedTopologyDocument,
  type CanonicalJsonValue,
  type TopologyDocument,
  type TopologyDocumentSource,
} from "@math3d/core";
import { canonicalizeFundamentalDiagramTopologyDocument } from "../topology/canonicalFinite2DAdapter";
import { createTopologyDocument as createCurrentTopologyDocument } from "../topology/documentFormat";
import { TOPOLOGY_PRESET_BY_ID } from "../topology/presets";
import { adaptCurrentTopologyDocument } from "../topology/topologyDocumentAdapter";

type CorpusEntry = {
  id: string;
  source:
    | { kind: "preset"; presetId: string }
    | { kind: "cw-complex"; value: Record<string, CanonicalJsonValue> };
  expected: {
    classification: {
      status: "certified-within-model" | "unsupported";
      eligible: boolean | null;
      label: string | null;
    };
  };
};

const corpus = corpusJson as unknown as { entries: CorpusEntry[] };

const sharedDocument = (model: Record<string, CanonicalJsonValue>, key: string): TopologyDocument => {
  const id = createStableDocumentId("topology", { surfaceClassificationFixture: key });
  const source: TopologyDocumentSource = { sourceId: `${id}/source`, kind: "cw-complex", model };
  return createSharedTopologyDocument({
    identity: createDocumentIdentity(id, source),
    source,
    canonicalComplex: null,
    results: [],
    displayRealizations: [],
    provenance: { origin: "native", sourceFormat: "surface-classification-test", sourceVersion: 1, diagnostics: [] },
  });
};

const classifyEntry = (entry: CorpusEntry) => {
  if (entry.source.kind === "cw-complex") {
    const document = sharedDocument(entry.source.value, entry.id);
    const canonical = canonicalizeFinite2DTopologyDocument(document);
    if (canonical.status !== "canonicalized") throw new Error(`Could not canonicalize '${entry.id}'.`);
    return classifyCanonicalFinite2DSurface(canonical, document);
  }
  const diagram = TOPOLOGY_PRESET_BY_ID.get(entry.source.presetId)!.buildDiagram();
  const document = adaptCurrentTopologyDocument(createCurrentTopologyDocument(diagram)).document!;
  const canonical = canonicalizeFundamentalDiagramTopologyDocument(document);
  if (canonical.status !== "canonicalized") throw new Error(`Could not canonicalize '${entry.id}'.`);
  return classifyCanonicalFinite2DSurface(canonical, document);
};

describe("canonical finite-surface classification", () => {
  it("matches every reviewed T01 classification decision without consulting preset names or realizations", () => {
    for (const entry of corpus.entries) {
      const outcome = classifyEntry(entry);
      expect(outcome.status, entry.id).toBe(entry.expected.classification.status);
      expect(outcome.report?.eligible ?? null, entry.id).toBe(entry.expected.classification.eligible);
      expect(outcome.report?.classification?.label ?? null, entry.id).toBe(entry.expected.classification.label);
    }
  });

  it("publishes all eligibility gates and revision-bound certified provenance", () => {
    const outcome = classifyEntry(corpus.entries.find(({ id }) => id === "torus")!);
    expect(outcome.status).toBe("certified-within-model");
    expect(outcome.report?.eligibilityChecks.map(({ id }) => id)).toEqual([
      "finite-2d", "connected", "edge-links", "vertex-links", "boundary-circles", "euler-characteristic",
    ]);
    expect(outcome.report?.eligibilityChecks.every(({ holds }) => holds)).toBe(true);
    expect(outcome.report?.orientability).toMatchObject({ orientable: true, conflictEdgeIds: [] });
    expect(outcome.report?.classification).toMatchObject({ family: "orientable", genus: 1, eulerCharacteristic: 0 });
    expect(outcome.result).toMatchObject({
      status: "certified",
      provenance: {
        source: outcome.validation.source,
        operation: { type: "topology.surface-classification", algorithmVersion: "finite-surface-classification@2" },
        engine: { name: "Math3D shared core", version: "1" },
      },
      summary: { eligible: true, classification: "Torus (orientable genus 1)" },
    });
  });

  it("certifies non-orientability from signed incidence and reports boundary components", () => {
    const projective = classifyEntry(corpus.entries.find(({ id }) => id === "rp2")!);
    expect(projective.report).toMatchObject({
      eligible: true,
      boundaryComponents: 0,
      orientability: { orientable: false },
      classification: { family: "non-orientable", crosscapNumber: 1 },
    });
    expect(projective.report?.orientability?.conflictEdgeIds.length).toBeGreaterThan(0);

    const mobius = classifyEntry(corpus.entries.find(({ id }) => id === "mobius-band")!);
    expect(mobius.report).toMatchObject({
      eligible: true,
      boundaryComponents: 1,
      classification: { family: "non-orientable", crosscapNumber: 1 },
    });
  });

  it("refuses a torus-named non-manifold source and retains exact failed prerequisites with locate-back", () => {
    const impostor = sharedDocument({
      id: "fixture/torus-impostor",
      name: "Torus",
      vertices: [{ id: "v" }],
      edges: [{ id: "a", endpoints: ["v", "v"] }],
      faces: [{
        id: "f",
        attachment: [
          { edgeId: "a", direction: 1 },
          { edgeId: "a", direction: 1 },
          { edgeId: "a", direction: 1 },
        ],
      }],
    }, "torus-impostor");
    const canonical = canonicalizeFinite2DTopologyDocument(impostor);
    if (canonical.status !== "canonicalized") throw new Error("Could not canonicalize torus impostor.");
    const outcome = classifyCanonicalFinite2DSurface(canonical, impostor);

    expect(outcome.status).toBe("certified-within-model");
    expect(outcome.report?.eligible).toBe(false);
    expect(outcome.report?.classification).toBeNull();
    const edgeGate = outcome.report?.eligibilityChecks.find(({ id }) => id === "edge-links");
    expect(edgeGate).toMatchObject({ holds: false, canonicalCells: [{ dimension: 1, cellId: "a" }] });
    expect(edgeGate?.sourceReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "source", dimension: 1, cellId: "a" }),
    ]));
    expect(outcome.result).toMatchObject({ status: "certified", summary: { eligible: false, classification: null } });
  });

  it("publishes unsupported—not a guessed label—when canonical structure is invalid", () => {
    const outcome = classifyEntry(corpus.entries.find(({ id }) => id === "invalid-dangling-complex")!);
    expect(outcome).toMatchObject({
      status: "unsupported",
      report: null,
      result: { status: "unsupported", summary: { eligible: null } },
    });
    expect(outcome.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "surface-classification/edge/dangling-endpoint",
      "surface-classification/attachment/dangling-edge",
    ]));
  });
});
