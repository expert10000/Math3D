import { describe, expect, it } from "vitest";
import {
  ANALYSIS_RESULT_STATUSES,
  createAnalysisResultEnvelope,
  createAnalysisResultFromScientificJob,
  createStableDocumentId,
  isAnalysisResultCurrent,
  normalizeAnalysisResultEnvelope,
  normalizeAnalysisResultRecord,
  structuralHash,
  type AnalysisResultEnvelope,
  type ScientificJobResult,
  type ScientificSourceGeneration,
} from "@math3d/core";

const documentId = createStableDocumentId("analysis", { fixture: "f06" });

const source = (revision = 4, generation = 2): ScientificSourceGeneration => ({
  documentId,
  revision,
  structuralHash: structuralHash({ revision }),
  generation,
});

const validResult = (
  overrides: Partial<Omit<AnalysisResultEnvelope, "schemaVersion">> = {}
): AnalysisResultEnvelope => createAnalysisResultEnvelope({
  resultId: "result:betti:4",
  status: "certified",
  provenance: {
    source: source(),
    operation: {
      type: "topology.compute-betti",
      algorithm: "boundary-matrix-reduction",
      algorithmVersion: "1.2.0",
      parameters: { coefficientField: "Z2" },
    },
    engine: { name: "math3d-topology", version: "1.5.0" },
    elapsedMs: 12.5,
  },
  summary: { bettiNumbers: [1, 2, 1], eulerCharacteristic: 0 },
  warnings: [],
  diagnostics: [],
  artifacts: [],
  ...overrides,
});

describe("compact analysis-result envelopes", () => {
  it("normalizes deterministic immutable schema-v1 provenance and summaries", () => {
    const result = validResult({
      warnings: ["Boundary orientation was normalized."],
      diagnostics: [{ code: "TOPOLOGY_ORIENTATION", severity: "info", message: "Canonical orientation used." }],
    });

    expect(result.schemaVersion).toBe(1);
    expect(result.provenance.source).toEqual(source());
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.provenance.operation.parameters)).toBe(true);
    expect(() => (result.summary as { eulerCharacteristic: number }).eulerCharacteristic = 5).toThrow();
  });

  it("accepts every common epistemic and terminal status", () => {
    for (const status of ANALYSIS_RESULT_STATUSES) {
      const result = validResult({
        resultId: `result:${status}`,
        status,
        ...(status === "numerical" ? {
          provenance: {
            ...validResult().provenance,
            numericContext: { precision: { decimalDigits: 15 }, tolerance: { relative: 1e-10 } },
          },
        } : {}),
      });
      expect(result.status).toBe(status);
    }
  });

  it("rejects invalid status, missing source provenance, and unknown fields", () => {
    const candidate = JSON.parse(JSON.stringify(validResult())) as Record<string, unknown>;
    candidate.status = "ready";
    (candidate.provenance as Record<string, unknown>).source = { revision: 4 };
    candidate.uiState = { expanded: true };

    const normalized = normalizeAnalysisResultEnvelope(candidate);
    expect(normalized.ok).toBe(false);
    if (normalized.ok) return;
    expect(normalized.errors.join(" ")).toMatch(/unknown fields: uiState/);
    expect(normalized.errors.join(" ")).toMatch(/status must be one of/);
    expect(normalized.errors.join(" ")).toMatch(/exact scientific source generation/);
  });

  it("requires useful finite precision or tolerance metadata for numerical results", () => {
    expect(() => validResult({ status: "numerical" })).toThrow(/must declare.*numericContext/);
    expect(() => validResult({
      status: "numerical",
      provenance: {
        ...validResult().provenance,
        numericContext: { precision: { decimalDigits: 0 }, tolerance: { absolute: -1 } },
      },
    })).toThrow(/positive safe integer.*non-negative finite number/);

    expect(validResult({
      status: "numerical",
      provenance: {
        ...validResult().provenance,
        numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: 1e-12, relative: 1e-9 } },
      },
    }).status).toBe("numerical");
  });

  it("keeps sampled grids, sparse matrices, meshes, and typed buffers out of summaries", () => {
    for (const summary of [
      { sampledGrid: [[1, 2], [3, 4]] },
      { sparseMatrix: { rowPointers: [0, 2], columnIndices: [0, 1] } },
      { mesh: { vertices: [[0, 0, 0]], faces: [[0, 0, 0]] } },
      { buffer: [1, 2, 3] },
    ]) {
      expect(() => validResult({ summary })).toThrow(/use an artifact handle/);
    }

    expect(() => validResult({ summary: { values: new Float64Array(4) as never } })).toThrow(/canonical JSON/);
  });

  it("bounds JSON arrays and serialized summary size", () => {
    expect(() => validResult({ summary: { histogram: Array.from({ length: 257 }, (_, index) => index) } }))
      .toThrow(/exceeds 256 entries/);
    expect(() => validResult({ summary: { note: "x".repeat(17_000) } }))
      .toThrow(/exceeds 16384 bytes/);
  });

  it("stores only typed opaque artifact handles and rejects duplicate IDs", () => {
    const result = validResult({
      summary: { vertexCount: 42, faceCount: 80 },
      artifacts: [{ artifactId: "artifact:mesh:4", kind: "mesh", role: "canonical-complex" }],
    });
    expect(result.artifacts).toEqual([
      { artifactId: "artifact:mesh:4", kind: "mesh", role: "canonical-complex" },
    ]);
    expect(Object.keys(result.artifacts[0]!)).toEqual(["artifactId", "kind", "role"]);

    expect(() => validResult({ artifacts: [
      { artifactId: "artifact:mesh:4", kind: "mesh", role: "mesh" },
      { artifactId: "artifact:mesh:4", kind: "binary", role: "duplicate" },
    ] })).toThrow(/duplicated/);
  });

  it("publishes F05 success using an explicit compact summary without copying raw output", () => {
    const jobResult: ScientificJobResult = {
      ok: true,
      schemaVersion: 1,
      jobId: "job:betti:4",
      operationType: "topology.compute-betti",
      source: source(),
      output: { sampledGrid: [[1, 2], [3, 4]], internalTrace: "large worker output" },
      outputBytes: 67,
    };
    const result = createAnalysisResultFromScientificJob({
      resultId: "result:job:betti:4",
      status: "certified",
      jobResult,
      currentSource: source(),
      algorithm: "boundary-matrix-reduction",
      algorithmVersion: "1.2.0",
      parameters: { coefficientField: "Z2" },
      engine: { name: "math3d-topology", version: "1.5.0" },
      elapsedMs: 9,
      summary: { bettiNumbers: [1, 2, 1] },
      artifacts: [{ artifactId: "artifact:grid:4", kind: "sampled-grid", role: "worker-output" }],
    });

    expect(result.summary).toEqual({ bettiNumbers: [1, 2, 1] });
    expect(JSON.stringify(result)).not.toContain("internalTrace");
    expect(result.provenance.operation.type).toBe(jobResult.operationType);
  });

  it("rejects stale F05 publication and compares the complete source generation", () => {
    const jobResult: ScientificJobResult = {
      ok: true,
      schemaVersion: 1,
      jobId: "job:stale",
      operationType: "complex.compute-roots",
      source: source(),
      output: { roots: 3 },
      outputBytes: 11,
    };
    const publication = {
      resultId: "result:stale",
      status: "numerical" as const,
      jobResult,
      currentSource: source(5, 3),
      algorithm: "aberth",
      algorithmVersion: "1.0.0",
      parameters: {},
      numericContext: { tolerance: { relative: 1e-10 } },
      engine: { name: "math3d-complex", version: "1.5.0" },
      elapsedMs: 7,
      summary: { rootCount: 3 },
    };
    expect(() => createAnalysisResultFromScientificJob(publication)).toThrow(/source is stale/);
    expect(isAnalysisResultCurrent(validResult(), source())).toBe(true);
    expect(isAnalysisResultCurrent(validResult(), { ...source(), generation: 3 })).toBe(false);
  });

  it("classifies unversioned records as legacy-limited without inventing status", () => {
    const legacy = normalizeAnalysisResultRecord({ state: "ready", value: 42 });
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.value).toMatchObject({
      kind: "legacy-limited",
      reason: "missing-provenance",
      displaySummary: { state: "ready", value: 42 },
    });
    expect(legacy.value).not.toHaveProperty("status");

    const malformedVersioned = normalizeAnalysisResultRecord({ schemaVersion: 1, status: "exact" });
    expect(malformedVersioned.ok).toBe(false);
  });
});
