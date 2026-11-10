import { describe, expect, it } from "vitest";
import { quantumInspectorEvidence, quantumInspectorEvidenceCsv, quantumInspectorEvidenceJson,
  quantumInspectorPublication,
  type QuantumInspectorEvidenceInput } from "./quantumInspectorEvidence";

const input: QuantumInspectorEvidenceInput = {
  status: "current", fingerprint: "a".repeat(64), resultSha256: "b".repeat(64),
  schema: "quantum-scene/v2", limitations: ["Finite grid"],
  runId: "run-1", model: "qwz", engine: "theory-lab", engineVersion: "1",
  kind: "numerical-result", datasets: [{ id: "energies", count: 25, components: 2, unit: "eV" }],
  invariants: [{ id: "chern", label: "Chern number", value: 1, status: "producer-computed",
    method: "lattice gauge" }],
};

describe("Quantum Inspector evidence qualification", () => {
  it("separates producer claims from exact source verification", () => {
    const evidence = quantumInspectorEvidence(input);
    expect(evidence).toMatchObject({ status: "current", claim: "Producer-supplied numerical scene and invariants",
      source: { runId: "run-1", resultSha256: "b".repeat(64) } });
    expect(evidence.checkScope).toMatch(/not independently proved/);
    expect(evidence.invariants[0]).toMatchObject({ value: 1, status: "producer-computed" });
    const report = JSON.parse(quantumInspectorEvidenceJson(evidence));
    expect(report).toMatchObject({ format: "math3d.quantum-inspector-evidence.v1",
      qualification: "current", producerInvariants: [{ value: 1, status: "producer-computed" }],
      source: { fingerprint: "a".repeat(64) } });
    expect(JSON.stringify(report)).not.toMatch(/directory|sampleValue|parameter/i);
    expect(report.publication).toMatchObject({ schema: "math3d.result-publication/v1",
      module: "quantum", source: { id: "run-1", hash: "a".repeat(64) },
      assessment: { status: "recorded", sourceStatus: "current" },
      summary: { producerInvariants: [{ value: 1 }] } });
    const csv = quantumInspectorEvidenceCsv(evidence);
    expect(csv).toContain('"producerInvariants"');
    expect(csv).toContain('"recordedClaim"');
    expect(csv).not.toContain("sampleValue");
  });

  it("withholds dataset and invariant numbers while checking or after a source change", () => {
    for (const status of ["opened", "checking", "withheld"] as const) {
      const evidence = quantumInspectorEvidence({ ...input, status });
      expect(evidence.datasets).toEqual([]);
      expect(evidence.invariants).toEqual([]);
      expect(JSON.stringify(evidence)).not.toContain("producer-computed");
      expect(() => quantumInspectorEvidenceJson(evidence)).toThrow(/withheld/);
      expect(() => quantumInspectorEvidenceCsv(evidence)).toThrow(/withheld/);
      expect(quantumInspectorPublication(evidence).summary).toBeNull();
    }
    const malformed = quantumInspectorEvidence({ ...input, fingerprint: "../changed" });
    expect(malformed.status).toBe("withheld");
    expect(malformed.invariants).toEqual([]);
  });
});
