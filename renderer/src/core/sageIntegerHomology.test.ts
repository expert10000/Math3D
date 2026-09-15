import { describe, expect, it } from "vitest";
import corpusJson from "../../../tests/fixtures/topology-v1/canonical-regression-corpus.json";
import {
  canonicalizeFinite2DTopologyDocument,
  canonicalJsonByteLength,
  constructExactSparseBoundaryMatrices,
  createDocumentIdentity,
  createSageIntegerHomologyJobRequest,
  createSageIntegerHomologyPayload,
  createStableDocumentId,
  createTopologyDocument,
  publishSageIntegerHomologyResult,
  SCIENTIFIC_JOB_SCHEMA_VERSION,
  structuralHash,
  type CanonicalFinite2DResult,
  type CanonicalJsonValue,
  type ExactSparseBoundaryMatrixOutcome,
  type SageIntegerHomologyOutput,
  type ScientificJobLimits,
  type ScientificSourceGeneration,
  type TopologyDocument,
  type TopologyDocumentSource,
} from "@math3d/core";
import {
  createInProcessScientificJobService,
  type ScientificJobRuntime,
} from "@math3d/kernel";
import {
  createSageIntegerHomologyJobAdapter,
  createSageUnavailableFallback,
  SAGE_TOPOLOGY_INTEGER_HOMOLOGY_OPERATION,
} from "../topology/sageIntegerHomologyJob";
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
    homology: {
      status: "exact" | "unsupported";
      integerGroups: string[] | null;
      h1Torsion: string[] | null;
    };
  };
};

const corpus = corpusJson as unknown as { entries: CorpusEntry[] };

const canonicalForEntry = (entry: CorpusEntry): { document: TopologyDocument; canonical: CanonicalFinite2DResult } => {
  if (entry.source.kind === "cw-complex") {
    const id = createStableDocumentId("topology", { sageIntegerFixture: entry.id });
    const source: TopologyDocumentSource = { sourceId: `${id}/source`, kind: "cw-complex", model: entry.source.value };
    const document = createTopologyDocument({
      identity: createDocumentIdentity(id, source),
      source,
      canonicalComplex: null,
      results: [],
      displayRealizations: [],
      provenance: { origin: "native", sourceFormat: "sage-integer-test", sourceVersion: 1, diagnostics: [] },
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

const freeRank = (notation: string): number => {
  const power = notation.match(/Z\^(\d+)/);
  if (power) return Number(power[1]);
  return notation === "Z" || notation.startsWith("Z ⊕") ? 1 : 0;
};

const outputFor = (
  payload: ReturnType<typeof createSageIntegerHomologyPayload>,
  integerGroups: readonly string[],
  h1Torsion: readonly string[]
): SageIntegerHomologyOutput => ({
  format: "math3d.topology-integer-homology-result",
  schemaVersion: 1,
  coefficientRing: "Z",
  canonicalHash: payload.canonicalHash,
  matrixArtifactId: payload.matrixArtifactId,
  chainDimensions: payload.chainDimensions,
  groups: [0, 1, 2].map((degree) => ({
    degree: degree as 0 | 1 | 2,
    freeRank: freeRank(integerGroups[degree]!),
    torsionCoefficients: degree === 1 ? [...h1Torsion] : [],
    notation: integerGroups[degree]!,
  })) as unknown as SageIntegerHomologyOutput["groups"],
  smithNormalForms: { boundary1Diagonal: [], boundary2Diagonal: [] },
  engine: { name: "SageMath", version: "10.8" },
  algorithm: "sage-chain-complex-smith-normal-form",
  elapsedMs: 7,
  diagnostics: [{ code: "topology/integer-homology-exact", message: "Exact integral homology fixture." }],
});

const limits = (deadlineAt = Date.now() + 10_000): ScientificJobLimits => ({
  deadlineAt,
  maxInputBytes: 256 * 1024,
  maxOutputBytes: 64 * 1024,
  maxMemoryBytes: 512 * 1024,
  maxWorkUnits: 100_000,
});

const requestFor = (
  canonical: CanonicalFinite2DResult,
  boundary: Extract<ExactSparseBoundaryMatrixOutcome, { status: "exact" }>,
  jobId: string,
  jobLimits = limits()
) => {
  const payload = createSageIntegerHomologyPayload({
    boundaryMatrices: boundary.payload,
    boundaryMatrixHandle: boundary.handle,
    currentSource: canonical.source,
  });
  return { payload, request: createSageIntegerHomologyJobRequest({ jobId, source: canonical.source, payload, limits: jobLimits }) };
};

class ManualRuntime implements ScientificJobRuntime {
  nowValue = 1_000;
  timers = new Map<number, { due: number; callback: () => void }>();
  nextHandle = 1;
  now = () => this.nowValue;
  schedule = (callback: () => void, delayMs: number) => {
    const handle = this.nextHandle++;
    this.timers.set(handle, { due: this.nowValue + delayMs, callback });
    return handle;
  };
  clear = (handle: unknown) => { this.timers.delete(handle as number); };
  advance = (milliseconds: number) => {
    this.nowValue += milliseconds;
    for (const [handle, timer] of [...this.timers]) {
      if (timer.due <= this.nowValue) {
        this.timers.delete(handle);
        timer.callback();
      }
    }
  };
}

describe("constrained Sage integer-homology job", () => {
  it("publishes every eligible integer/torsion corpus result through F05/F06 with engine provenance", async () => {
    for (const entry of corpus.entries.filter(({ expected }) => expected.homology.status === "exact")) {
      const { canonical, boundary } = exactBoundaryFor(entry);
      const { payload, request } = requestFor(canonical, boundary, `sage-${entry.id}`);
      let invokedOperation = "";
      const service = createInProcessScientificJobService({
        adapters: [createSageIntegerHomologyJobAdapter(async (sageRequest) => {
          invokedOperation = sageRequest.operation;
          expect(Object.keys(sageRequest.params).sort()).not.toContain("source");
          return {
            engine: "sagemath",
            operation: sageRequest.operation,
            success: true,
            latex: "",
            result: outputFor(payload, entry.expected.homology.integerGroups!, entry.expected.homology.h1Torsion!),
            warnings: [],
          };
        })],
        resolveSource: () => canonical.source,
      });
      const outcome = await service.submit(request);
      expect(outcome.ok, entry.id).toBe(true);
      if (!outcome.ok) continue;
      const result = publishSageIntegerHomologyResult({
        jobResult: outcome,
        currentSource: canonical.source,
        expectedPayload: payload,
        boundaryMatrixHandle: boundary.handle,
      });
      expect(invokedOperation, entry.id).toBe(SAGE_TOPOLOGY_INTEGER_HOMOLOGY_OPERATION);
      expect(result.summary.groups, entry.id).toEqual(outputFor(
        payload,
        entry.expected.homology.integerGroups!,
        entry.expected.homology.h1Torsion!
      ).groups);
      expect(result.provenance).toMatchObject({
        source: canonical.source,
        engine: { name: "SageMath", version: "10.8" },
        operation: { type: "topology.integer-homology", parameters: { coefficientRing: "Z" } },
      });
      expect(result.artifacts).toEqual([boundary.handle]);
    }
  });

  it("rejects source/script fields and enforces F05 input/output limits", async () => {
    const { canonical, boundary } = exactBoundaryFor(corpus.entries.find(({ id }) => id === "torus")!);
    const valid = requestFor(canonical, boundary, "sage-contract");
    let invoked = 0;
    const service = createInProcessScientificJobService({
      adapters: [createSageIntegerHomologyJobAdapter(async () => {
        invoked += 1;
        return {
          engine: "sagemath", operation: SAGE_TOPOLOGY_INTEGER_HOMOLOGY_OPERATION, success: true, latex: "", warnings: [],
          result: outputFor(valid.payload, ["Z", "Z^2", "Z"], []),
        };
      })],
      resolveSource: () => canonical.source,
    });
    const unsafe = structuredClone(valid.request) as unknown as { operation: { payload: Record<string, unknown> } };
    unsafe.operation.payload.sourceCode = "print('not allowed')";
    expect(await service.submit(unsafe)).toMatchObject({ ok: false, code: "adapter-failed" });
    expect(invoked).toBe(0);

    const tinyInput = { ...valid.request, jobId: "sage-input-limit", limits: { ...valid.request.limits, maxInputBytes: 1 } };
    expect(await service.submit(tinyInput)).toMatchObject({ ok: false, code: "input-limit-exceeded" });
    expect(invoked).toBe(0);

    const tinyOutput = { ...valid.request, jobId: "sage-output-limit", limits: { ...valid.request.limits, maxOutputBytes: 1 } };
    expect(await service.submit(tinyOutput)).toMatchObject({ ok: false, code: "output-limit-exceeded" });
    expect(invoked).toBe(1);
  });

  it("honors cancellation and timeout without publishing late Sage output", async () => {
    const { canonical, boundary } = exactBoundaryFor(corpus.entries.find(({ id }) => id === "circle")!);
    const runtime = new ManualRuntime();
    let finish!: (value: ReturnType<typeof outputFor>) => void;
    const service = createInProcessScientificJobService({
      adapters: [createSageIntegerHomologyJobAdapter(() => new Promise((resolve) => {
        finish = (output) => resolve({
          engine: "sagemath", operation: SAGE_TOPOLOGY_INTEGER_HOMOLOGY_OPERATION, success: true,
          latex: "", result: output, warnings: [],
        });
      }))],
      resolveSource: () => canonical.source,
      runtime,
    });
    const cancellation = requestFor(canonical, boundary, "sage-cancel", { ...limits(), deadlineAt: runtime.now() + 100 }).request;
    const pendingCancel = service.submit(cancellation);
    await Promise.resolve();
    expect(service.cancel("sage-cancel")).toBe(true);
    expect(await pendingCancel).toMatchObject({ ok: false, code: "cancelled" });
    finish(outputFor(requestFor(canonical, boundary, "late").payload, ["Z", "Z", "0"], []));

    const timeout = requestFor(canonical, boundary, "sage-timeout", { ...limits(), deadlineAt: runtime.now() + 10 }).request;
    const pendingTimeout = service.submit(timeout);
    await Promise.resolve();
    runtime.advance(10);
    expect(await pendingTimeout).toMatchObject({ ok: false, code: "deadline-exceeded" });
  });

  it("rejects stale publication and retains a distinctly labeled local Z/2Z fallback", async () => {
    const { canonical, boundary } = exactBoundaryFor(corpus.entries.find(({ id }) => id === "rp2")!);
    const { payload, request } = requestFor(canonical, boundary, "sage-stale-publish");
    const output = outputFor(payload, ["Z", "Z/2Z", "0"], ["2"]);
    const jobResult = {
      ok: true as const,
      schemaVersion: SCIENTIFIC_JOB_SCHEMA_VERSION,
      jobId: request.jobId,
      operationType: request.operation.type,
      source: canonical.source,
      output,
      outputBytes: canonicalJsonByteLength(output),
    };
    const stale: ScientificSourceGeneration = {
      ...canonical.source,
      revision: canonical.source.revision + 1,
      structuralHash: structuralHash({ stale: true }),
      generation: canonical.source.generation + 1,
    };
    expect(() => publishSageIntegerHomologyResult({
      jobResult,
      currentSource: stale,
      expectedPayload: payload,
      boundaryMatrixHandle: boundary.handle,
    })).toThrow(/stale/);

    const failure = {
      ok: false as const,
      schemaVersion: SCIENTIFIC_JOB_SCHEMA_VERSION,
      jobId: "sage-unavailable",
      operationType: "topology.integer-homology",
      source: canonical.source,
      code: "adapter-failed" as const,
      message: "SageMath service unavailable.",
    };
    const fallback = createSageUnavailableFallback({
      sageOutcome: failure,
      boundaryMatrices: boundary.payload,
      boundaryMatrixHandle: boundary.handle,
      currentSource: canonical.source,
    });
    expect(fallback).toMatchObject({
      status: "sage-unavailable",
      localZ2: { status: "exact", value: { coefficientField: { notation: "Z/2Z" } } },
    });
    expect(createSageUnavailableFallback({
      sageOutcome: { ...failure, code: "cancelled" },
      boundaryMatrices: boundary.payload,
      boundaryMatrixHandle: boundary.handle,
      currentSource: canonical.source,
    })).toBeNull();
  });
});
