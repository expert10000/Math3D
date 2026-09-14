import { describe, expect, it } from "vitest";
import {
  canonicalizeFinite2DTopologyDocument,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument,
  locateCanonicalCellSourceReferences,
  locateCanonicalCellsForSource,
  normalizeCanonicalFinite2DComplex,
  normalizeCanonicalFinite2DResult,
  type CanonicalJsonValue,
  type TopologyDocument,
  type TopologyDocumentSource,
} from "@math3d/core";

const makeDocument = (
  kind: TopologyDocumentSource["kind"],
  model: Record<string, CanonicalJsonValue>,
  key = "canonical-fixture"
): TopologyDocument => {
  const id = createStableDocumentId("topology", { key });
  const source: TopologyDocumentSource = { sourceId: `${id}/source`, kind, model };
  return createTopologyDocument({
    identity: createDocumentIdentity(id, source),
    source,
    canonicalComplex: null,
    results: [],
    displayRealizations: [],
    provenance: {
      origin: "native",
      sourceFormat: "test",
      sourceVersion: 1,
      diagnostics: [],
    },
  });
};

const cwModel = (reverseCells = false): Record<string, CanonicalJsonValue> => {
  const vertices = [{ id: "v1" }, { id: "v0" }];
  const edges = [
    { id: "b", endpoints: ["v0", "v1"] },
    { id: "a", endpoints: ["v0", "v1"] },
  ];
  return {
    id: "cw-test",
    name: "CW test",
    vertices: reverseCells ? [...vertices].reverse() : vertices,
    edges: reverseCells ? [...edges].reverse() : edges,
    faces: [{
      id: "f",
      attachment: [
        { edgeId: "a", direction: 1 },
        { edgeId: "b", direction: -1 },
      ],
    }],
  };
};

describe("canonical finite 2D complex", () => {
  it("canonicalizes CW cells in stable order with oriented attachment words", () => {
    const first = canonicalizeFinite2DTopologyDocument(makeDocument("cw-complex", cwModel()), 4);
    const reordered = canonicalizeFinite2DTopologyDocument(makeDocument("cw-complex", cwModel(true)), 4);

    expect(first.status).toBe("canonicalized");
    expect(reordered.status).toBe("canonicalized");
    if (first.status !== "canonicalized" || reordered.status !== "canonicalized") return;
    expect(first.complex).toEqual(reordered.complex);
    expect(first.canonicalHash).toBe(reordered.canonicalHash);
    expect(first.complex.vertices.map((cell) => cell.id)).toEqual(["v0", "v1"]);
    expect(first.complex.edges.map((cell) => cell.id)).toEqual(["a", "b"]);
    expect(first.complex.faces[0]?.boundaryWord).toBe("a b^-1");
    expect(first.complex.faces[0]?.attachment.map((entry) => entry.direction)).toEqual([1, -1]);
    expect(first.source.generation).toBe(4);
    expect(first.source.structuralHash).toBe(makeDocument("cw-complex", cwModel()).identity.structuralHash);
    expect(normalizeCanonicalFinite2DResult(first).ok).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.complex.faces[0]?.attachment)).toBe(true);
  });

  it("provides deterministic two-way source maps for every cell", () => {
    const outcome = canonicalizeFinite2DTopologyDocument(makeDocument("cw-complex", cwModel()));
    expect(outcome.status).toBe("canonicalized");
    if (outcome.status !== "canonicalized") return;

    for (const [dimension, cells] of [
      [0, outcome.complex.vertices],
      [1, outcome.complex.edges],
      [2, outcome.complex.faces],
    ] as const) {
      for (const cell of cells) {
        const references = locateCanonicalCellSourceReferences(outcome.complex, { dimension, cellId: cell.id });
        expect(references.length).toBeGreaterThan(0);
        for (const reference of references) {
          expect(locateCanonicalCellsForSource(outcome.complex, reference)).toContainEqual({
            dimension,
            cellId: cell.id,
          });
        }
      }
    }
    expect(outcome.complex.faces[0]?.attachment.map((token) => token.sourceRef.occurrence)).toEqual([0, 1]);
  });

  it("derives simplicial orientation from triangle winding and declared edge order", () => {
    const document = makeDocument("simplicial-complex", {
      id: "triangle",
      name: "Oriented triangle",
      vertexIds: ["v2", "v0", "v1"],
      edges: [
        { id: "e20", vertices: ["v2", "v0"] },
        { id: "e10", vertices: ["v1", "v0"] },
        { id: "e12", vertices: ["v1", "v2"] },
      ],
      triangles: [{ id: "t", vertices: ["v0", "v1", "v2"] }],
    });
    const outcome = canonicalizeFinite2DTopologyDocument(document);

    expect(outcome.status).toBe("canonicalized");
    if (outcome.status !== "canonicalized") return;
    expect(outcome.complex.faces[0]?.attachment.map(({ edgeId, direction }) => [edgeId, direction])).toEqual([
      ["e10", -1],
      ["e12", 1],
      ["e20", 1],
    ]);
    expect(outcome.complex.faces[0]?.boundaryWord).toBe("e10^-1 e12 e20");
  });

  it("preserves dangling CW references for T04 without claiming validity", () => {
    const document = makeDocument("cw-complex", {
      id: "invalid",
      name: "Invalid but serializable",
      vertices: [{ id: "v" }],
      edges: [],
      faces: [{ id: "f", attachment: [{ edgeId: "missing", direction: 1 }] }],
    });
    const outcome = canonicalizeFinite2DTopologyDocument(document);

    expect(outcome.status).toBe("canonicalized");
    if (outcome.status !== "canonicalized") return;
    expect(outcome.complex.faces[0]?.attachment[0]?.edgeId).toBe("missing");
    expect(outcome).not.toHaveProperty("valid");
    expect(outcome).not.toHaveProperty("analysis");
  });

  it("rejects tampered artifacts and explicitly reports unsupported source kinds", () => {
    const accepted = canonicalizeFinite2DTopologyDocument(makeDocument("cw-complex", cwModel()));
    expect(accepted.status).toBe("canonicalized");
    if (accepted.status !== "canonicalized") return;
    const tampered = structuredClone(accepted.complex) as unknown as {
      faces: Array<{ boundaryWord: string; sourceRefs: unknown[] }>;
    };
    tampered.faces[0]!.boundaryWord = "invented";
    tampered.faces[0]!.sourceRefs = [];
    const normalized = normalizeCanonicalFinite2DComplex(tampered);
    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.errors.join(" ")).toContain("at least one source reference");
      expect(normalized.errors.join(" ")).toContain("canonical oriented attachment word");
    }

    const wrongHash = structuredClone(accepted) as unknown as { canonicalHash: string };
    wrongHash.canonicalHash = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    const resultValidation = normalizeCanonicalFinite2DResult(wrongHash);
    expect(resultValidation.ok).toBe(false);
    if (!resultValidation.ok) expect(resultValidation.errors.join(" ")).toContain("does not match");

    const unsupported = canonicalizeFinite2DTopologyDocument(
      makeDocument("mesh-snapshot", { id: "mesh", name: "Mesh" })
    );
    expect(unsupported.status).toBe("unsupported");
    if (unsupported.status === "unsupported") {
      expect(unsupported.diagnostics[0]?.code).toBe("canonicalization/unsupported-source-kind");
    }
  });
});
