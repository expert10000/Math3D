import { describe, expect, it } from "vitest";
import corpusJson from "../../../tests/fixtures/topology-v1/canonical-regression-corpus.json";
import {
  canonicalizeFinite2DTopologyDocument,
  computeLocalZ2Homology,
  constructExactSparseBoundaryMatrices,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyDocument,
  normalizeAnalysisResultEnvelope,
  structuralHash,
  type CanonicalFinite2DResult,
  type CanonicalJsonValue,
  type ExactSparseBoundaryMatrixOutcome,
  type ScientificSourceGeneration,
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
    homology: { status: "exact" | "unsupported"; mod2Dimensions: number[] | null };
  };
};

const corpus = corpusJson as unknown as { entries: CorpusEntry[] };

const canonicalForEntry = (entry: CorpusEntry): { document: TopologyDocument; canonical: CanonicalFinite2DResult } => {
  if (entry.source.kind === "cw-complex") {
    const id = createStableDocumentId("topology", { localZ2Fixture: entry.id });
    const source: TopologyDocumentSource = {
      sourceId: `${id}/source`,
      kind: "cw-complex",
      model: entry.source.value,
    };
    const document = createTopologyDocument({
      identity: createDocumentIdentity(id, source),
      source,
      canonicalComplex: null,
      results: [],
      displayRealizations: [],
      provenance: { origin: "native", sourceFormat: "local-z2-test", sourceVersion: 1, diagnostics: [] },
    });
    const canonical = canonicalizeFinite2DTopologyDocument(document);
    if (canonical.status !== "canonicalized") throw new Error(`Could not canonicalize '${entry.id}'.`);
    return { document, canonical };
  }
  const diagram = TOPOLOGY_PRESET_BY_ID.get(entry.source.presetId)!.buildDiagram();
  const document = adaptCurrentTopologyDocument(createCurrentTopologyDocument(diagram)).document!;
  const canonical = canonicalizeFundamentalDiagramTopologyDocument(document);
  if (canonical.status !== "canonicalized") throw new Error(`Could not canonicalize '${entry.id}'.`);
  return { document, canonical };
};

const exactBoundaryFor = (entry: CorpusEntry) => {
  const { document, canonical } = canonicalForEntry(entry);
  const boundary = constructExactSparseBoundaryMatrices(canonical, document);
  if (boundary.status !== "exact") throw new Error(`No exact matrices for '${entry.id}'.`);
  return { canonical, boundary };
};

const compute = (canonical: CanonicalFinite2DResult, boundary: Extract<ExactSparseBoundaryMatrixOutcome, { status: "exact" }>) =>
  computeLocalZ2Homology({
    boundaryMatrices: boundary.payload,
    boundaryMatrixHandle: boundary.handle,
    currentSource: canonical.source,
  });

describe("bounded local Z/2Z homology", () => {
  it("matches every eligible T01 finite-field Betti oracle and withholds invalid input", () => {
    for (const entry of corpus.entries) {
      const { document, canonical } = canonicalForEntry(entry);
      const boundary = constructExactSparseBoundaryMatrices(canonical, document);
      if (boundary.status !== "exact") {
        expect(entry.expected.homology.status, entry.id).toBe("unsupported");
        continue;
      }
      const outcome = compute(canonical, boundary);
      expect(outcome.status, entry.id).toBe("exact");
      if (outcome.status !== "exact") continue;
      expect(outcome.value.bettiNumbers, entry.id).toEqual(entry.expected.homology.mod2Dimensions);
      expect(outcome.value.coefficientField).toEqual({
        name: "finite field with two elements",
        notation: "Z/2Z",
        characteristic: 2,
      });
      expect(normalizeAnalysisResultEnvelope(outcome.result).ok, entry.id).toBe(true);
      expect(outcome.result.artifacts).toEqual([boundary.handle]);
      expect(outcome.result.provenance.source).toEqual(canonical.source);
    }
  });

  it("is deterministic and distinguishes odd from even torsion behavior", () => {
    const odd = exactBoundaryFor(corpus.entries.find(({ id }) => id === "moore-z3-1")!);
    const projective = exactBoundaryFor(corpus.entries.find(({ id }) => id === "rp2")!);
    const first = compute(odd.canonical, odd.boundary);
    const replay = compute(odd.canonical, odd.boundary);
    expect(replay).toEqual(first);
    expect(first.status === "exact" && first.value.bettiNumbers).toEqual([1, 0, 0]);

    const mod2Torsion = compute(projective.canonical, projective.boundary);
    expect(mod2Torsion.status === "exact" && mod2Torsion.value.bettiNumbers).toEqual([1, 1, 1]);
  });

  it("satisfies the Euler-Poincare identity over the field", () => {
    for (const entry of corpus.entries.filter((candidate) => candidate.expected.homology.status === "exact")) {
      const { canonical, boundary } = exactBoundaryFor(entry);
      const outcome = compute(canonical, boundary);
      expect(outcome.status, entry.id).toBe("exact");
      if (outcome.status !== "exact") continue;
      const [c0, c1, c2] = outcome.value.chainDimensions;
      const [b0, b1, b2] = outcome.value.bettiNumbers;
      expect(b0 - b1 + b2, entry.id).toBe(c0 - c1 + c2);
    }
  });

  it("fails closed for stale, malformed, and wrong-artifact requests", () => {
    const { canonical, boundary } = exactBoundaryFor(corpus.entries.find(({ id }) => id === "torus")!);
    const stale: ScientificSourceGeneration = {
      ...canonical.source,
      revision: canonical.source.revision + 1,
      structuralHash: structuralHash({ stale: true }),
    };
    expect(computeLocalZ2Homology({
      boundaryMatrices: boundary.payload,
      boundaryMatrixHandle: boundary.handle,
      currentSource: stale,
    })).toMatchObject({ status: "unsupported", diagnostics: [{ code: "homology-z2/stale-source" }] });

    const malformed = structuredClone(boundary.payload) as unknown as {
      chainCondition: { holds: boolean };
    };
    malformed.chainCondition.holds = false;
    expect(computeLocalZ2Homology({
      boundaryMatrices: malformed,
      boundaryMatrixHandle: boundary.handle,
      currentSource: canonical.source,
    })).toMatchObject({ status: "failed", diagnostics: [{ code: "homology-z2/invalid-boundary-artifact" }] });

    expect(computeLocalZ2Homology({
      boundaryMatrices: boundary.payload,
      boundaryMatrixHandle: { ...boundary.handle, role: "wrong" },
      currentSource: canonical.source,
    })).toMatchObject({ status: "failed", diagnostics: [{ code: "homology-z2/invalid-request" }] });
  });

  it("returns explicit local cell and work-limit outcomes without partial Betti numbers", () => {
    const { canonical, boundary } = exactBoundaryFor(corpus.entries.find(({ id }) => id === "torus")!);
    const cells = computeLocalZ2Homology({
      boundaryMatrices: boundary.payload,
      boundaryMatrixHandle: boundary.handle,
      currentSource: canonical.source,
      limits: { maxCells: 2 },
    });
    expect(cells).toMatchObject({
      status: "unsupported",
      diagnostics: [{ code: "homology-z2/cell-limit-exceeded" }],
      result: { status: "unsupported", summary: { coefficientField: "Z/2Z" } },
    });
    expect(cells).not.toHaveProperty("value");

    const sphere = exactBoundaryFor(corpus.entries.find(({ id }) => id === "sphere")!);
    const nonzeros = computeLocalZ2Homology({
      boundaryMatrices: sphere.boundary.payload,
      boundaryMatrixHandle: sphere.boundary.handle,
      currentSource: sphere.canonical.source,
      limits: { maxNonzeros: 1 },
    });
    expect(nonzeros).toMatchObject({ status: "unsupported", diagnostics: [{ code: "homology-z2/nonzero-limit-exceeded" }] });
    expect(nonzeros).not.toHaveProperty("value");

    const work = computeLocalZ2Homology({
      boundaryMatrices: sphere.boundary.payload,
      boundaryMatrixHandle: sphere.boundary.handle,
      currentSource: sphere.canonical.source,
      limits: { maxReductionSteps: 1 },
    });
    expect(work).toMatchObject({ status: "unsupported", diagnostics: [{ code: "homology-z2/work-limit-exceeded" }] });
    expect(work).not.toHaveProperty("value");
  });
});
