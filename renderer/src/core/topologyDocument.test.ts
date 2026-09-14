import { describe, expect, it } from "vitest";
import {
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument,
  deserializeTopologyDocument,
  normalizeTopologyDocument,
  serializeTopologyDocument,
  type ScientificSourceGeneration,
  type TopologyDocument,
  type TopologyDocumentSource,
} from "@math3d/core";

const makeDocument = (model: Readonly<Record<string, string | number>> = { id: "circle", attachingWord: "a" }): TopologyDocument => {
  const id = createStableDocumentId("topology", { fixture: "shared-document" });
  const source: TopologyDocumentSource = {
    sourceId: `${id}/source`,
    kind: "cw-complex",
    model,
  };
  const identity = createDocumentIdentity(id, source, 3);
  const generation: ScientificSourceGeneration = {
    documentId: identity.id,
    revision: identity.revision,
    structuralHash: identity.structuralHash,
    generation: 7,
  };
  return createTopologyDocument({
    identity,
    source,
    canonicalComplex: {
      referenceId: `${id}/canonical`,
      source: generation,
      state: "current",
      canonicalHash: identity.structuralHash,
      artifact: { artifactId: "artifact:canonical", kind: "other", role: "canonical-complex" },
    },
    results: [{
      resultId: `${id}/result/homology`,
      resultType: "topology.homology",
      source: generation,
      state: "available",
    }],
    displayRealizations: [{
      realizationId: `${id}/display/schematic`,
      kind: "schematic",
      authority: "illustrative",
      source: generation,
      state: "available",
      artifact: { artifactId: "artifact:display", kind: "mesh", role: "illustrative-realization" },
    }],
    provenance: {
      origin: "native",
      sourceFormat: "math3d.topology-document",
      sourceVersion: 1,
      diagnostics: [],
    },
  });
};

describe("shared topology document", () => {
  it("round-trips canonical schema-v1 JSON deterministically and immutably", () => {
    const document = makeDocument();
    const serialized = serializeTopologyDocument(document);
    const loaded = deserializeTopologyDocument(serialized);

    expect(serialized).toBe(serializeTopologyDocument(makeDocument({ attachingWord: "a", id: "circle" })));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value).toEqual(document);
    expect(Object.isFrozen(loaded.value)).toBe(true);
    expect(Object.isFrozen(loaded.value.source.model)).toBe(true);
    expect(Object.isFrozen(loaded.value.results)).toBe(true);
  });

  it("keeps a stable ID while source edits change the structural hash", () => {
    const initial = makeDocument({ id: "circle", attachingWord: "a" });
    const edited = makeDocument({ id: "circle", attachingWord: "a^2" });

    expect(edited.identity.id).toBe(initial.identity.id);
    expect(edited.identity.revision).toBe(initial.identity.revision);
    expect(edited.identity.structuralHash).not.toBe(initial.identity.structuralHash);
  });

  it("rejects unknown fields, stale guards, duplicate references, and authoritative displays", () => {
    const unknown = structuredClone(makeDocument()) as unknown as Record<string, unknown>;
    unknown.rendererState = {};
    expect(normalizeTopologyDocument(unknown)).toMatchObject({ ok: false });

    const stale = structuredClone(makeDocument()) as unknown as {
      results: Array<{ source: { revision: number } }>;
    };
    stale.results[0]!.source.revision += 1;
    const staleResult = normalizeTopologyDocument(stale);
    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) expect(staleResult.errors.join(" ")).toContain("must match the topology document identity");

    const duplicate = structuredClone(makeDocument()) as unknown as { results: unknown[] };
    duplicate.results.push(structuredClone(duplicate.results[0]));
    const duplicateResult = normalizeTopologyDocument(duplicate);
    expect(duplicateResult.ok).toBe(false);
    if (!duplicateResult.ok) expect(duplicateResult.errors.join(" ")).toContain("duplicated");

    const authoritative = structuredClone(makeDocument()) as unknown as {
      displayRealizations: Array<{ authority: string }>;
    };
    authoritative.displayRealizations[0]!.authority = "exact";
    const authorityResult = normalizeTopologyDocument(authoritative);
    expect(authorityResult.ok).toBe(false);
    if (!authorityResult.ok) expect(authorityResult.errors.join(" ")).toContain("must be illustrative");
  });

  it("rejects unsupported versions, invalid source hashes, and non-JSON values", () => {
    const versioned = structuredClone(makeDocument()) as unknown as { schemaVersion: number };
    versioned.schemaVersion = 2;
    expect(normalizeTopologyDocument(versioned)).toMatchObject({ ok: false });

    const wrongHash = structuredClone(makeDocument()) as unknown as {
      source: { model: { attachingWord: string } };
    };
    wrongHash.source.model.attachingWord = "changed-without-identity-update";
    const hashResult = normalizeTopologyDocument(wrongHash);
    expect(hashResult.ok).toBe(false);
    if (!hashResult.ok) expect(hashResult.errors.join(" ")).toContain("structuralHash does not match");

    const nonJson = structuredClone(makeDocument()) as unknown as { source: { model: Record<string, unknown> } };
    nonJson.source.model.invalid = undefined;
    const jsonResult = normalizeTopologyDocument(nonJson);
    expect(jsonResult.ok).toBe(false);
    if (!jsonResult.ok) expect(jsonResult.errors.join(" ")).toContain("canonical JSON");
  });

  it("does not let unavailable canonical references retain hashes or artifacts", () => {
    const unavailable = structuredClone(makeDocument()) as unknown as {
      canonicalComplex: { state: string };
    };
    unavailable.canonicalComplex.state = "unavailable";
    const result = normalizeTopologyDocument(unavailable);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("cannot claim an artifact handle");
      expect(result.errors.join(" ")).toContain("cannot claim a canonical hash");
    }
  });
});
