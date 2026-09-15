import { describe, expect, it } from "vitest";
import corpusJson from "../../../tests/fixtures/topology-v1/canonical-regression-corpus.json";
import {
  canonicalizeFinite2DTopologyDocument,
  composeExactSparseIntegerMatrices,
  constructExactSparseBoundaryMatrices,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument,
  decodeExactSparseBoundaryMatrixArtifact,
  decodeExactSparseIntegerMatrix,
  encodeExactSparseBoundaryMatrixArtifact,
  locateExactSparseMatrixCoordinate,
  normalizeExactSparseBoundaryMatrixArtifact,
  structuralHash,
  type CanonicalFinite2DResult,
  type CanonicalJsonValue,
  type ScientificSourceGeneration,
  type TopologyDocument,
  type TopologyDocumentSource,
} from "@math3d/core";
import { createInMemoryArtifactRegistry } from "@math3d/kernel";
import { publishCanonicalBoundaryMatrixArtifact } from "../topology/canonicalBoundaryMatrixArtifact";
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
    validation: { cellularAlgebraEligible: boolean };
    boundary: {
      status: "exact" | "unsupported";
      d1: string[][] | null;
      d2: string[][] | null;
    };
  };
};

const corpus = corpusJson as unknown as { entries: CorpusEntry[] };

const sharedDocument = (
  model: Record<string, CanonicalJsonValue>,
  key: string
): TopologyDocument => {
  const id = createStableDocumentId("topology", { boundaryFixture: key });
  const source: TopologyDocumentSource = { sourceId: `${id}/source`, kind: "cw-complex", model };
  return createTopologyDocument({
    identity: createDocumentIdentity(id, source),
    source,
    canonicalComplex: null,
    results: [],
    displayRealizations: [],
    provenance: {
      origin: "native",
      sourceFormat: "exact-sparse-boundary-test",
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
    const result = canonicalizeFinite2DTopologyDocument(document);
    if (result.status !== "canonicalized") throw new Error(`Could not canonicalize '${entry.id}'.`);
    return { document, result };
  }
  const diagram = TOPOLOGY_PRESET_BY_ID.get(entry.source.presetId)!.buildDiagram();
  const document = adaptCurrentTopologyDocument(createCurrentTopologyDocument(diagram)).document!;
  const result = canonicalizeFundamentalDiagramTopologyDocument(document);
  if (result.status !== "canonicalized") throw new Error(`Could not canonicalize '${entry.id}'.`);
  return { document, result };
};

const decimalDense = (matrix: ReturnType<typeof decodeExactSparseIntegerMatrix>): string[][] =>
  matrix.map((row) => row.map((value) => value.toString()));

describe("exact sparse canonical boundary matrices", () => {
  it("matches every exact T01 d1/d2 matrix and rejects the invalid fixture", () => {
    for (const entry of corpus.entries) {
      const { document, result } = canonicalForEntry(entry);
      const outcome = constructExactSparseBoundaryMatrices(result, document);
      expect(outcome.status, entry.id).toBe(entry.expected.boundary.status);
      if (outcome.status !== "exact") {
        expect(entry.expected.validation.cellularAlgebraEligible, entry.id).toBe(false);
        expect(outcome.diagnostics.map(({ code }) => code), entry.id).toEqual(expect.arrayContaining([
          "edge/dangling-endpoint",
          "attachment/dangling-edge",
        ]));
        continue;
      }

      expect(decimalDense(decodeExactSparseIntegerMatrix(outcome.payload.boundary1)), entry.id).toEqual(
        entry.expected.boundary.d1
      );
      expect(decimalDense(decodeExactSparseIntegerMatrix(outcome.payload.boundary2)), entry.id).toEqual(
        entry.expected.boundary.d2
      );
      expect(composeExactSparseIntegerMatrices(
        outcome.payload.boundary1,
        outcome.payload.boundary2
      ), entry.id).toEqual([]);
      expect(outcome.payload.chainCondition).toEqual({
        expression: "d1*d2 = 0",
        holds: true,
        nonzeroEntries: [],
      });
    }
  });

  it("uses canonical cell ordering and deterministic exact COO encoding", () => {
    const { document, result } = canonicalForEntry(corpus.entries.find(({ id }) => id === "sphere")!);
    const first = constructExactSparseBoundaryMatrices(result, document);
    const replay = constructExactSparseBoundaryMatrices(result, document);
    expect(first.status).toBe("exact");
    expect(replay).toEqual(first);
    if (first.status !== "exact" || replay.status !== "exact") return;

    expect(first.payload.boundary1.rowBasis.map(({ cell }) => cell.cellId)).toEqual(["v0", "v1"]);
    expect(first.payload.boundary1.columnBasis.map(({ cell }) => cell.cellId)).toEqual(["a", "b"]);
    expect(first.payload.boundary2.columnBasis.map(({ cell }) => cell.cellId)).toEqual(["north", "south"]);
    expect(first.payload.boundary1.encoding).toBe("coo-decimal-bigint");
    expect(first.payload.boundary1.entries.every(({ value }) => /^-?[1-9][0-9]*$/.test(value))).toBe(true);
    expect(encodeExactSparseBoundaryMatrixArtifact(first.payload)).toEqual(
      encodeExactSparseBoundaryMatrixArtifact(replay.payload)
    );
    expect(Object.isFrozen(first.payload.boundary2.entries)).toBe(true);
  });

  it("locates selected matrix coordinates back to cells and source occurrences", () => {
    const { document, result } = canonicalForEntry(corpus.entries.find(({ id }) => id === "sphere")!);
    const outcome = constructExactSparseBoundaryMatrices(result, document);
    expect(outcome.status).toBe("exact");
    if (outcome.status !== "exact") return;

    const location = locateExactSparseMatrixCoordinate(outcome.payload.boundary2, 0, 0);
    expect(location).toMatchObject({
      coefficient: "1",
      rowCell: { index: 0, cell: { dimension: 1, cellId: "a" } },
      columnCell: { index: 0, cell: { dimension: 2, cellId: "north" } },
    });
    expect(location?.contributions).toHaveLength(1);
    expect(location?.contributions[0]?.sourceReferences).toContainEqual(expect.objectContaining({
      stage: "source",
      dimension: 1,
      cellId: "a",
      occurrence: 0,
    }));
    expect(locateExactSparseMatrixCoordinate(outcome.payload.boundary2, 99, 0)).toBeNull();
  });

  it("retains cancelling atomic contributions for exact zero coordinates", () => {
    const { document, result } = canonicalForEntry(corpus.entries.find(({ id }) => id === "circle")!);
    const outcome = constructExactSparseBoundaryMatrices(result, document);
    expect(outcome.status).toBe("exact");
    if (outcome.status !== "exact") return;

    expect(outcome.payload.boundary1.entries).toEqual([]);
    const loopBoundary = locateExactSparseMatrixCoordinate(outcome.payload.boundary1, 0, 0);
    expect(loopBoundary?.coefficient).toBe("0");
    expect(loopBoundary?.contributions.map(({ value }) => value)).toEqual(["-1", "1"]);
    expect(loopBoundary?.rowCell.cell).toEqual({ dimension: 0, cellId: "v" });
    expect(loopBoundary?.columnCell.cell).toEqual({ dimension: 1, cellId: "a" });
  });

  it("round-trips strict artifact bytes and rejects inconsistent sparse entries", () => {
    const { document, result } = canonicalForEntry(corpus.entries.find(({ id }) => id === "moore-z3-1")!);
    const outcome = constructExactSparseBoundaryMatrices(result, document);
    expect(outcome.status).toBe("exact");
    if (outcome.status !== "exact") return;
    const decoded = decodeExactSparseBoundaryMatrixArtifact(
      encodeExactSparseBoundaryMatrixArtifact(outcome.payload)
    );
    expect(decoded).toEqual(outcome.payload);
    expect(decoded.boundary2.entries).toEqual([{ row: 0, column: 0, value: "3" }]);

    const tampered = structuredClone(decoded) as unknown as {
      boundary2: { entries: Array<{ row: number; column: number; value: string }> };
    };
    tampered.boundary2.entries[0]!.value = "2";
    const normalized = normalizeExactSparseBoundaryMatrixArtifact(tampered);
    expect(normalized.ok).toBe(false);
    if (!normalized.ok) expect(normalized.errors.join(" ")).toContain("exact sum of contributions");

    const badReference = structuredClone(decoded) as unknown as {
      boundary2: { contributions: Array<{ sourceReferences: Array<{ sourceId: string }> }> };
    };
    badReference.boundary2.contributions[0]!.sourceReferences[0]!.sourceId = "other/source";
    const badReferenceResult = normalizeExactSparseBoundaryMatrixArtifact(badReference);
    expect(badReferenceResult.ok).toBe(false);
    if (!badReferenceResult.ok) expect(badReferenceResult.errors.join(" ")).toContain("must match artifact.sourceId");
  });

  it("publishes bytes to F07 and returns only a compact artifact reference", () => {
    const { document, result } = canonicalForEntry(corpus.entries.find(({ id }) => id === "torus")!);
    let currentSource: ScientificSourceGeneration = result.source;
    const registry = createInMemoryArtifactRegistry({
      resolveSource: (documentId) => documentId === currentSource.documentId ? currentSource : null,
    });
    const published = publishCanonicalBoundaryMatrixArtifact(
      registry,
      result,
      document,
      "cache:topology-boundary"
    );
    expect(published.status).toBe("exact");
    if (published.status !== "exact") return;

    expect(published).not.toHaveProperty("payload");
    expect(published.handle).toMatchObject({ kind: "sparse-matrix", role: "topology.cellular-boundary-d1-d2" });
    expect(published.metadata).toMatchObject({ availability: "available", status: "clean" });
    const resolution = registry.resolve(published.handle, result.source);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(decodeExactSparseBoundaryMatrixArtifact(resolution.bytes).canonicalHash).toBe(result.canonicalHash);
    expect(JSON.stringify(document)).not.toContain("coo-decimal-bigint");

    currentSource = {
      ...currentSource,
      revision: currentSource.revision + 1,
      structuralHash: structuralHash({ changed: true }),
      generation: currentSource.generation + 1,
    };
    expect(registry.invalidateDocumentSource(currentSource)).toEqual([published.handle.artifactId]);
    expect(registry.resolve(published.handle, result.source)).toMatchObject({ ok: false, reason: "stale-source" });
  });

  it("does not declare an F07 artifact when T04 rejects the complex", () => {
    const { document, result } = canonicalForEntry(
      corpus.entries.find(({ id }) => id === "invalid-dangling-complex")!
    );
    const registry = createInMemoryArtifactRegistry({
      resolveSource: (documentId) => documentId === result.source.documentId ? result.source : null,
    });
    const outcome = publishCanonicalBoundaryMatrixArtifact(
      registry,
      result,
      document,
      "cache:topology-boundary"
    );

    expect(outcome.status).toBe("unsupported");
    expect(registry.listMetadata()).toEqual([]);
  });
});
