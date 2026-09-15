import { describe, expect, it } from "vitest";
import {
  canonicalJsonByteLength,
  locateExactSparseMatrixCoordinate,
  SCIENTIFIC_JOB_SCHEMA_VERSION,
  structuralHash,
  type SageIntegerHomologyOutput,
  type ScientificJobFailure,
  type ScientificJobResult,
} from "@math3d/core";
import {
  deriveTopologyAlgebraAuthority,
  prepareTopologyIntegerHomologyJob,
  publishTopologyIntegerHomologyOutcome,
} from "./algebraPublication";
import { createTopologyDocument } from "./documentFormat";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { adaptCurrentTopologyDocument } from "./topologyDocumentAdapter";

const documentFor = (presetId: string) => {
  const diagram = TOPOLOGY_PRESET_BY_ID.get(presetId)!.buildDiagram();
  return adaptCurrentTopologyDocument(createTopologyDocument(diagram)).document!;
};

const exactOutput = (prepared: ReturnType<typeof prepareTopologyIntegerHomologyJob>): SageIntegerHomologyOutput => ({
  format: "math3d.topology-integer-homology-result",
  schemaVersion: 1,
  coefficientRing: "Z",
  canonicalHash: prepared.payload.canonicalHash,
  matrixArtifactId: prepared.payload.matrixArtifactId,
  chainDimensions: prepared.payload.chainDimensions,
  groups: [
    { degree: 0, freeRank: 1, torsionCoefficients: [], notation: "Z" },
    { degree: 1, freeRank: 0, torsionCoefficients: ["2"], notation: "Z/2Z" },
    { degree: 2, freeRank: 0, torsionCoefficients: [], notation: "0" },
  ],
  smithNormalForms: { boundary1Diagonal: ["1"], boundary2Diagonal: ["2"] },
  engine: { name: "SageMath", version: "10.8" },
  algorithm: "sage-chain-complex-smith-normal-form",
  elapsedMs: 8,
  diagnostics: [{ code: "topology/integer-homology-exact", message: "Exact integral homology." }],
});

const exactJobResult = (
  prepared: ReturnType<typeof prepareTopologyIntegerHomologyJob>,
  output: SageIntegerHomologyOutput
): ScientificJobResult => ({
  ok: true,
  schemaVersion: SCIENTIFIC_JOB_SCHEMA_VERSION,
  jobId: prepared.request.jobId,
  operationType: prepared.request.operation.type,
  source: prepared.authority.canonical.source,
  output,
  outputBytes: canonicalJsonByteLength(output),
});

const failure = (
  prepared: ReturnType<typeof prepareTopologyIntegerHomologyJob>,
  code: ScientificJobFailure["code"],
  message: string
): ScientificJobFailure => ({
  ok: false,
  schemaVersion: SCIENTIFIC_JOB_SCHEMA_VERSION,
  jobId: prepared.request.jobId,
  operationType: prepared.request.operation.type,
  source: prepared.authority.canonical.source,
  code,
  message,
});

describe("Topology Algebra publication", () => {
  it("derives exact matrices whose coefficients locate back to canonical and authored source cells", () => {
    const authority = deriveTopologyAlgebraAuthority(documentFor("projective_plane"));
    expect(authority.status).toBe("exact");
    if (authority.status !== "exact") return;

    const location = locateExactSparseMatrixCoordinate(authority.boundary.payload.boundary2, 0, 0);
    expect(location).toMatchObject({
      coefficient: "2",
      rowCell: { cell: { dimension: 1 } },
      columnCell: { cell: { dimension: 2 } },
    });
    expect(location?.contributions).toHaveLength(2);
    expect(location?.contributions.flatMap(({ sourceReferences }) => sourceReferences)).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "source", dimension: 1 }),
      expect.objectContaining({ stage: "source", dimension: 2 }),
    ]));
  });

  it("publishes exact Z groups, torsion, Smith data, engine identity, source generation, and artifact provenance", () => {
    const prepared = prepareTopologyIntegerHomologyJob({
      document: documentFor("projective_plane"),
      jobId: "t09-exact",
      deadlineAt: Date.now() + 10_000,
    });
    const output = exactOutput(prepared);
    const publication = publishTopologyIntegerHomologyOutcome({
      prepared,
      outcome: exactJobResult(prepared, output),
      currentSource: prepared.authority.canonical.source,
    });

    expect(publication).toMatchObject({
      status: "exact",
      output: {
        coefficientRing: "Z",
        groups: [{ notation: "Z" }, { notation: "Z/2Z", torsionCoefficients: ["2"] }, { notation: "0" }],
        smithNormalForms: { boundary2Diagonal: ["2"] },
        engine: { name: "SageMath", version: "10.8" },
      },
      result: {
        provenance: { source: prepared.authority.canonical.source, engine: { name: "SageMath", version: "10.8" } },
        artifacts: [{ artifactId: prepared.authority.boundary.handle.artifactId }],
      },
    });
  });

  it("rejects stale exact output instead of publishing it", () => {
    const prepared = prepareTopologyIntegerHomologyJob({
      document: documentFor("torus_square"),
      jobId: "t09-stale",
      deadlineAt: Date.now() + 10_000,
    });
    const output = exactOutput(prepared);
    const currentSource = {
      ...prepared.authority.canonical.source,
      revision: prepared.authority.canonical.source.revision + 1,
      generation: prepared.authority.canonical.source.generation + 1,
      structuralHash: structuralHash({ changed: true }),
    };
    expect(publishTopologyIntegerHomologyOutcome({
      prepared,
      outcome: exactJobResult(prepared, output),
      currentSource,
    })).toMatchObject({ status: "failed", message: expect.stringMatching(/stale/i) });
  });

  it("keeps unavailable and timed-out jobs distinct while retaining only labeled local Z/2Z feedback", () => {
    const prepared = prepareTopologyIntegerHomologyJob({
      document: documentFor("projective_plane"),
      jobId: "t09-fallback",
      deadlineAt: Date.now() + 10_000,
    });
    const unavailable = publishTopologyIntegerHomologyOutcome({
      prepared,
      outcome: failure(prepared, "adapter-failed", "SageMath is unavailable."),
      currentSource: prepared.authority.canonical.source,
    });
    expect(unavailable).toMatchObject({
      status: "sage-unavailable",
      localZ2: { status: "exact", value: { coefficientField: { notation: "Z/2Z" } } },
    });

    const timedOut = publishTopologyIntegerHomologyOutcome({
      prepared,
      outcome: failure(prepared, "deadline-exceeded", "Deadline exceeded."),
      currentSource: prepared.authority.canonical.source,
    });
    expect(timedOut).toMatchObject({
      status: "timed-out",
      localZ2: { status: "exact", value: { coefficientField: { notation: "Z/2Z" } } },
    });
  });
});
