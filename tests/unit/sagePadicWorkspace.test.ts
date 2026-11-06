import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, parseMath3DProject,
  parsePadicRationalText, parseProjectAlgebraEvidence, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";
import zp from "../fixtures/sage-padic-zp-sage95.json";
import qp from "../fixtures/sage-padic-qp-sage95.json";

const setup = (kind: "integer-ring" | "rational-field") => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: `sage-g02-${kind}`, title: "p-adic precision" });
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, kind),
    revision: 1, label: kind === "integer-ring" ? "ZZ" : "QQ", definition: { kind } });
  project = upsertMath3DProjectAlgebraObject(project, record);
  return { project, record, target: { objectId: record.id, revision: 1 } };
};

describe("SAGE-G02 precision-explicit p-adic studies", () => {
  it("checks Z7 precision loss, Hensel root and independent Project reopen", () => {
    const { project, record, target } = setup("integer-ring");
    const request = buildAlgebraOperationRequest(project, target, "sage.numberTheory.padic", "docker", {
      prime: 7, precision: 6, a: parsePadicRationalText("3"), b: parsePadicRationalText("4"),
      hensel: { coefficients: ["-2", "0", "1"], seed: 3 } });
    const result = { ...zp, target, targetHash: record.contentHash };
    const runtime = { engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
      jobId: "sage-g02-zp", elapsedMs: 1, warnings: [] };
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result, runtime);
    const reopened = parseMath3DProject(serializeMath3DProject(addMath3DProjectAlgebraEvidence(project, evidence)));
    expect(reopened.algebraObjects?.[0].revisions[0]).toEqual(record);
    expect(reopened.algebraEvidence?.[0].result).toEqual(result);
    expect(reopened.algebraEvidence?.[0].certificate?.runtime.sageVersion).toBe("9.5");
    expect(result.entries.sum).toMatchObject({ absolutePrecision: 6, relativePrecision: 5,
      valuation: 1, precisionLost: true });
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...result, entries: { ...result.entries, sum: { ...result.entries.sum, relativePrecision: 6 } } }, runtime))
      .toThrow(/precision labels/);
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...result, hensel: { ...result.hensel, rootResidue: "3" } }, runtime)).toThrow(/Hensel root/);
    expect(() => parseProjectAlgebraEvidence({ ...evidence, request: { ...request,
      params: { ...request.params, targetHash: `sha256:${"0".repeat(64)}` } } },
    project.identity.id, project.algebraObjects!)).toThrow(/pinned/);
  });

  it("keeps Q5 negative valuation and uncertain cancellation distinct from exact source zero", () => {
    const { project, record, target } = setup("rational-field");
    const request = buildAlgebraOperationRequest(project, target, "sage.numberTheory.padic", "docker", {
      prime: 5, precision: 8, a: parsePadicRationalText("1/5"), b: parsePadicRationalText("-1/5"),
      hensel: null });
    const result = { ...qp, target, targetHash: record.contentHash };
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result,
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sage-g02-qp",
        elapsedMs: 1, warnings: [] });
    expect(evidence.result).toEqual(result);
    expect(result.entries.a).toMatchObject({ valuation: -1, absolutePrecision: 7, relativePrecision: 8 });
    expect(result.entries.sum).toMatchObject({ zeroStatus: "undetermined", absolutePrecision: 7,
      source: { numerator: "0", denominator: "1" } });
    expect(() => buildAlgebraOperationRequest(project, target, "sage.numberTheory.padic", "private",
      { prime: 5, precision: 8, a: parsePadicRationalText("1/5"), b: parsePadicRationalText("1"),
        hensel: null })).toThrow(/not available/);
  });

  it("rejects composite primes, nonintegral Zp inputs, bad Hensel seeds and unavailable runtime", () => {
    const { project, target } = setup("integer-ring");
    const args = { prime: 7, precision: 6, a: parsePadicRationalText("3"),
      b: parsePadicRationalText("4"), hensel: null };
    expect(() => buildAlgebraOperationRequest(project, target, "sage.numberTheory.padic", "docker",
      { ...args, prime: 9 })).toThrow(/p-adic/);
    expect(() => buildAlgebraOperationRequest(project, target, "sage.numberTheory.padic", "docker",
      { ...args, a: parsePadicRationalText("1/7") })).toThrow(/integral/);
    expect(() => buildAlgebraOperationRequest(project, target, "sage.numberTheory.padic", "docker",
      { ...args, hensel: { coefficients: ["-2", "0", "1"], seed: 2 } })).toThrow(/simple root/);
    expect(() => parsePadicRationalText("2/4")).toThrow(/reduced/);
    const gate = algebraOperationsFor(project, target, [{ backend: "docker", available: true,
      operations: ["number-theory.gcd"] }]).find((item) => item.definition.id === "sage.numberTheory.padic")!;
    expect(gate.readyBackend).toBeNull();
    expect(gate.runtimeReason).toContain("number-theory.padic");
  });
});
