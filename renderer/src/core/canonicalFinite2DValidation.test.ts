import { describe, expect, it } from "vitest";
import corpusJson from "../../../tests/fixtures/topology-v1/canonical-regression-corpus.json";
import {
  canonicalizeFinite2DTopologyDocument,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument,
  gateCanonicalFinite2DFormalHomology,
  validateCanonicalFinite2DStructure,
  type CanonicalFinite2DResult,
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
    validation: {
      status: "certified-within-model" | "failed";
      structurallyValid: boolean;
      cellularAlgebraEligible: boolean;
      requiredDiagnosticCodes: string[];
    };
    classification: { eligible: boolean | null };
  };
};

const corpus = corpusJson as unknown as { entries: CorpusEntry[] };

const sharedDocument = (
  model: Record<string, CanonicalJsonValue>,
  key: string,
  revision = 1
): TopologyDocument => {
  const id = createStableDocumentId("topology", { validationFixture: key });
  const source: TopologyDocumentSource = { sourceId: `${id}/source`, kind: "cw-complex", model };
  return createTopologyDocument({
    identity: createDocumentIdentity(id, source, revision),
    source,
    canonicalComplex: null,
    results: [],
    displayRealizations: [],
    provenance: {
      origin: "native",
      sourceFormat: "canonical-structure-validation-test",
      sourceVersion: 1,
      diagnostics: [],
    },
  });
};

const canonicalForEntry = (
  entry: CorpusEntry
): { document: TopologyDocument; result: CanonicalFinite2DResult } => {
  if (entry.source.kind === "cw-complex") {
    const document = sharedDocument(entry.source.value, entry.id);
    const outcome = canonicalizeFinite2DTopologyDocument(document);
    if (outcome.status !== "canonicalized") throw new Error(`Could not canonicalize corpus entry '${entry.id}'.`);
    return { document, result: outcome };
  }
  const diagram = TOPOLOGY_PRESET_BY_ID.get(entry.source.presetId)!.buildDiagram();
  const document = adaptCurrentTopologyDocument(createCurrentTopologyDocument(diagram)).document!;
  const outcome = canonicalizeFundamentalDiagramTopologyDocument(document);
  if (outcome.status !== "canonicalized") throw new Error(`Could not canonicalize preset '${entry.id}'.`);
  return { document, result: outcome };
};

describe("canonical finite 2D structural validation", () => {
  it("certifies the T01 corpus and reproduces its validity and manifold eligibility boundary", () => {
    for (const entry of corpus.entries) {
      const { document, result } = canonicalForEntry(entry);
      const validation = validateCanonicalFinite2DStructure(result, document);
      const replay = validateCanonicalFinite2DStructure(result, document);

      expect(validation, entry.id).toEqual(replay);
      expect(validation.status, entry.id).toBe(entry.expected.validation.status);
      expect(validation.report?.eligibility.cellularAlgebra, entry.id).toBe(
        entry.expected.validation.cellularAlgebraEligible
      );
      expect(validation.report?.eligibility.formalHomologyJob, entry.id).toBe(
        entry.expected.validation.cellularAlgebraEligible
      );
      expect(validation.report?.eligibility.surfaceManifold, entry.id).toBe(
        entry.expected.classification.eligible ?? false
      );
      expect(validation.report?.chainCondition.holds, entry.id).toBe(
        entry.expected.validation.cellularAlgebraEligible
      );
      expect(validation.diagnostics.map(({ code }) => code), entry.id).toEqual(
        expect.arrayContaining(entry.expected.validation.requiredDiagnosticCodes)
      );
      expect(gateCanonicalFinite2DFormalHomology(result, document).allowed, entry.id).toBe(
        entry.expected.validation.cellularAlgebraEligible
      );
      expect(Object.isFrozen(validation), entry.id).toBe(true);
      expect(Object.isFrozen(validation.report), entry.id).toBe(true);
    }
  });

  it("reports dangling incidence with canonical and authoritative source references", () => {
    const entry = corpus.entries.find(({ id }) => id === "invalid-dangling-complex")!;
    const { document, result } = canonicalForEntry(entry);
    const validation = validateCanonicalFinite2DStructure(result, document);
    const endpoint = validation.diagnostics.find(({ code }) => code === "edge/dangling-endpoint");
    const attachment = validation.diagnostics.find(({ code }) => code === "attachment/dangling-edge");

    expect(endpoint?.canonicalCell).toEqual({ dimension: 1, cellId: "bad" });
    expect(endpoint?.sourceReferences).toContainEqual(expect.objectContaining({
      stage: "source",
      dimension: 1,
      cellId: "bad",
    }));
    expect(attachment?.canonicalCell).toEqual({ dimension: 2, cellId: "f" });
    expect(attachment?.sourceReferences).toContainEqual(expect.objectContaining({
      stage: "source",
      dimension: 1,
      cellId: "missing-edge",
      occurrence: 0,
    }));
    expect(validation.report?.chainCondition.verified).toBe(false);
  });

  it("detects a non-closed attachment and a nonzero d1*d2 precondition", () => {
    const document = sharedDocument({
      id: "open-walk",
      name: "Open attachment walk",
      vertices: [{ id: "v0" }, { id: "v1" }, { id: "v2" }],
      edges: [
        { id: "a", endpoints: ["v0", "v1"] },
        { id: "b", endpoints: ["v2", "v0"] },
      ],
      faces: [{
        id: "f",
        attachment: [{ edgeId: "a", direction: 1 }, { edgeId: "b", direction: 1 }],
      }],
    }, "open-walk");
    const outcome = canonicalizeFinite2DTopologyDocument(document);
    expect(outcome.status).toBe("canonicalized");
    if (outcome.status !== "canonicalized") return;
    const validation = validateCanonicalFinite2DStructure(outcome, document);

    expect(validation.status).toBe("failed");
    expect(validation.report?.chainCondition).toMatchObject({ verified: true, holds: false });
    expect(validation.report?.chainCondition.nonzeroEntries).toEqual([
      { vertexId: "v1", faceId: "f", value: "1" },
      { vertexId: "v2", faceId: "f", value: "-1" },
    ]);
    expect(validation.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "attachment/non-contiguous",
      "chain/nonzero-boundary-composition",
    ]));
    expect(gateCanonicalFinite2DFormalHomology(outcome, document)).toMatchObject({ allowed: false });
  });

  it("rejects stale source generations before formal analysis submission", () => {
    const original = sharedDocument({
      id: "circle",
      name: "Circle",
      vertices: [{ id: "v" }],
      edges: [{ id: "a", endpoints: ["v", "v"] }],
      faces: [],
    }, "stale-source", 1);
    const outcome = canonicalizeFinite2DTopologyDocument(original, 4);
    expect(outcome.status).toBe("canonicalized");
    if (outcome.status !== "canonicalized") return;
    const revised = sharedDocument(original.source.model, "stale-source", 2);
    const validation = validateCanonicalFinite2DStructure(outcome, revised);

    expect(validation.status).toBe("failed");
    expect(validation.diagnostics.map(({ code }) => code)).toContain("source/generation-mismatch");
    expect(gateCanonicalFinite2DFormalHomology(outcome, revised)).toMatchObject({
      allowed: false,
      diagnosticCodes: expect.arrayContaining(["source/generation-mismatch"]),
    });
  });

  it("fails closed for a malformed canonical artifact while preserving an explicit limitation", () => {
    const { document, result } = canonicalForEntry(corpus.entries.find(({ id }) => id === "torus")!);
    const malformed = structuredClone(result) as unknown as { complex: { faces: Array<{ boundaryWord: string }> } };
    malformed.complex.faces[0]!.boundaryWord = "tampered";
    const validation = validateCanonicalFinite2DStructure(
      malformed as unknown as CanonicalFinite2DResult,
      document
    );

    expect(validation.status).toBe("invalid-artifact");
    expect(validation.report).toBeNull();
    expect(validation.diagnostics[0]?.code).toBe("validation/invalid-artifact");
    expect(gateCanonicalFinite2DFormalHomology(
      malformed as unknown as CanonicalFinite2DResult,
      document
    )).toMatchObject({ allowed: false });
  });
});
