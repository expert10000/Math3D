import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";

export type QuantumInspectorSourceStatus = "opened" | "checking" | "current" | "withheld";

export type QuantumInspectorEvidenceInput = Readonly<{
  status: QuantumInspectorSourceStatus;
  fingerprint: string;
  runId: string;
  resultSha256: string;
  schema: string;
  model: string;
  engine: string;
  engineVersion: string;
  kind?: "geometry-fixture" | "numerical-result";
  datasets: readonly Readonly<{ id: string; count: number; components: number; unit: string }>[];
  invariants: readonly Readonly<{ id: string; label: string; value: number | null;
    status: string; method?: string }>[];
  limitations: readonly string[];
}>;

export type QuantumInspectorEvidence = Readonly<{
  status: QuantumInspectorSourceStatus;
  reason: string;
  claim: string;
  checkScope: string;
  source: Readonly<{ fingerprint: string; runId: string; resultSha256: string;
    model: string; engine: string; engineVersion: string }>;
  schema: string;
  datasets: QuantumInspectorEvidenceInput["datasets"];
  invariants: QuantumInspectorEvidenceInput["invariants"];
  limitations: readonly string[];
}>;

const digest = /^[a-f0-9]{64}$/;

/** Producer values are released only for a source whose exact bundle was just re-verified. */
export function quantumInspectorEvidence(input: QuantumInspectorEvidenceInput): QuantumInspectorEvidence {
  const source = { fingerprint: input.fingerprint, runId: input.runId,
    resultSha256: input.resultSha256, model: input.model,
    engine: input.engine, engineVersion: input.engineVersion };
  const identityValid = digest.test(input.fingerprint) && digest.test(input.resultSha256) &&
    input.runId.length > 0 && input.model.length > 0;
  const status = identityValid ? input.status : "withheld";
  const reason = !identityValid ? "Source identity is incomplete or malformed." :
    status === "current" ? "Exact bundle bytes re-verified for this Inspector view." :
      status === "opened" ? "Verified when opened; re-verifying before numerical inspection." :
        status === "checking" ? "Re-verifying the active source bundle." :
          "The active source bundle is missing or changed.";
  return {
    status, reason,
    claim: input.kind === "geometry-fixture" ? "Producer-supplied geometry fixture" :
      "Producer-supplied numerical scene and invariants",
    checkScope: "Math3D checks the bundle, schema and dataset references. Producer invariant values and methods are reported, not independently proved by this Inspector.",
    source, schema: input.schema,
    datasets: status === "current" ? input.datasets : [],
    invariants: status === "current" ? input.invariants : [],
    limitations: status === "current" ? input.limitations : [],
  };
}

export function quantumInspectorPublication(evidence: QuantumInspectorEvidence) {
  return createResultPublication({ module: "quantum", resultId: evidence.source.runId,
    source: { id: evidence.source.runId, revision: null, generation: null,
      hash: evidence.source.fingerprint },
    sourceStatus: evidence.status, status: evidence.status === "current" ? "recorded" : "withheld",
    reason: evidence.reason, recordedClaim: evidence.claim, independentCheck: evidence.checkScope,
    summary: { schema: evidence.schema, resultSha256: evidence.source.resultSha256,
      datasets: evidence.datasets, producerInvariants: evidence.invariants,
      limitations: evidence.limitations } });
}

/** Summary evidence only: dense sample arrays stay in the verified source bundle. */
export function quantumInspectorEvidenceJson(evidence: QuantumInspectorEvidence): string {
  if (evidence.status !== "current") throw new TypeError(`Quantum Inspector evidence withheld: ${evidence.reason}`);
  return JSON.stringify({ format: "math3d.quantum-inspector-evidence.v1", qualification: evidence.status,
    source: evidence.source, schema: evidence.schema, recordedClaim: evidence.claim,
    checkScope: evidence.checkScope, datasets: evidence.datasets,
    producerInvariants: evidence.invariants, limitations: evidence.limitations,
    publication: quantumInspectorPublication(evidence) }, null, 2) + "\n";
}

export function quantumInspectorEvidenceCsv(evidence: QuantumInspectorEvidence): string {
  if (evidence.status !== "current") throw new TypeError(`Quantum Inspector evidence withheld: ${evidence.reason}`);
  const publication = quantumInspectorPublication(evidence);
  return resultEvidenceRowsCsv([
    ["runId", evidence.source.runId], ["sceneFingerprint", evidence.source.fingerprint],
    ["resultSha256", evidence.source.resultSha256], ["sourceStatus", evidence.status],
    ["schema", evidence.schema], ["recordedClaim", publication.assessment.recordedClaim],
    ["independentCheck", publication.assessment.independentCheck],
    ["datasets", evidence.datasets], ["producerInvariants", evidence.invariants],
    ["limitations", evidence.limitations],
  ]);
}
