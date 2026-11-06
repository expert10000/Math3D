import { describe, expect, it } from "vitest";
import smithFixture from "../../../../tests/fixtures/sage-integer-matrix-forms-2-6-0.json";
import singularFixture from "../../../../tests/fixtures/sage-matrix-dossier-singular.json";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraEvidence,
  createProjectAlgebraObjectId, parseMath3DProject, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "@math3d/core";
import { compareAlgebraEvidence } from "./algebraEvidenceComparisonModel";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-h02", title: "Exact comparisons" });
  const add = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) => {
    const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key),
      revision: 1, label: key, definition });
    project = upsertMath3DProjectAlgebraObject(project, record);
    return { objectId: record.id, revision: 1 } as const;
  };
  const z = add("Z", { kind: "integer-ring" }), q = add("Q", { kind: "rational-field" });
  const m = add("M", { kind: "modular-ring", modulus: "7" });
  const save = (request: ReturnType<typeof buildAlgebraOperationRequest>, result: unknown,
    jobId: string, version = "10.10") => {
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects ?? [], request,
      result, { engine: "sagemath", version, backend: request.backend, jobId, elapsedMs: 12, warnings: [] });
    project = addMath3DProjectAlgebraEvidence(project, evidence);
    return evidence;
  };
  return { get project() { return project; }, z, q, m, save };
};

describe("SAGE-H02 typed algebra evidence comparison", () => {
  it("checks exact backend agreement after independent Project reopen", () => {
    const state = setup();
    const docker = state.save(buildAlgebraOperationRequest(state.project, state.z, "sage.numberTheory.gcd",
      "docker", { values: ["84", "30"] }), { value: "6" }, "h02docker", "10.10");
    const local = state.save(buildAlgebraOperationRequest(state.project, state.z, "sage.numberTheory.gcd",
      "private", { values: ["84", "30"] }), { value: "6" }, "h02local", "9.5");
    const reopened = parseMath3DProject(serializeMath3DProject(state.project));
    const comparison = compareAlgebraEvidence(reopened, reopened.algebraEvidence!.find((item) => item.id === docker.id)!,
      reopened.algebraEvidence!.find((item) => item.id === local.id)!);
    expect(comparison).toMatchObject({ kind: "backend", verdict: "verified agreement",
      left: { domain: "ZZ", verification: "CHECKED", sageVersion: "10.10" },
      right: { domain: "ZZ", verification: "CHECKED", sageVersion: "9.5" } });
    expect(comparison.left.facts).toContainEqual({ label: "Exact value", value: "6" });
  });

  it("flags wrong arithmetic and refuses mismatched backend inputs", () => {
    const state = setup();
    const good = state.save(buildAlgebraOperationRequest(state.project, state.z, "sage.numberTheory.gcd",
      "docker", { values: ["84", "30"] }), { value: "6" }, "h02good");
    const wrong = state.save(buildAlgebraOperationRequest(state.project, state.z, "sage.numberTheory.gcd",
      "private", { values: ["84", "30"] }), { value: "7" }, "h02wrong");
    expect(compareAlgebraEvidence(state.project, good, wrong).verdict).toBe("verification failed");
    expect(compareAlgebraEvidence(state.project, good, { ...wrong, resultHash: good.resultHash }).verdict)
      .toBe("verification failed");
    const different = state.save(buildAlgebraOperationRequest(state.project, state.z, "sage.numberTheory.gcd",
      "private", { values: ["84", "28"] }), { value: "28" }, "h02different");
    expect(compareAlgebraEvidence(state.project, good, different)).toMatchObject({ kind: "incompatible",
      verdict: "incompatible" });
  });

  it("compares modular inverses only after both inverse identities pass", () => {
    const state = setup();
    const docker = state.save(buildAlgebraOperationRequest(state.project, state.m,
      "sage.numberTheory.modInverse", "docker", { a: "3" }), { value: "5", modulus: "7" }, "h02inversedocker");
    const local = state.save(buildAlgebraOperationRequest(state.project, state.m,
      "sage.numberTheory.modInverse", "private", { a: "3" }), { value: "5", modulus: "7" }, "h02inverselocal");
    expect(compareAlgebraEvidence(state.project, docker, local)).toMatchObject({ kind: "backend",
      verdict: "verified agreement", left: { domain: "Z/7Z", verification: "CHECKED" } });
  });

  it("compares QQ rank with ZZ Smith data while retaining domain-specific torsion", () => {
    const state = setup();
    const matrix = [["2", "0", "0"], ["0", "6", "0"], ["0", "0", "0"]];
    const qqResult = { format: "math3d.sage-matrix-dossier-result", schemaVersion: 1, coefficientDomain: "QQ",
      sourceMatrix: matrix, inputShape: [3, 3], rank: 2,
      reducedRowEchelonForm: [["1", "0", "0"], ["0", "1", "0"], ["0", "0", "0"]],
      pivotColumns: [0, 1], kernelBasis: [["0", "0", "1"]],
      imageBasis: [["2", "0", "0"], ["0", "6", "0"]],
      minimalPolynomial: "t*(t-2)*(t-6)", characteristicPolynomial: "t*(t-2)*(t-6)" };
    const qq = state.save(buildAlgebraOperationRequest(state.project, state.q, "sage.matrix.linear_dossier",
      "docker", { matrix }), qqResult, "h02qq");
    const zz = state.save(buildAlgebraOperationRequest(state.project, state.z, "sage.matrix.integer_forms",
      "docker", { matrix }), smithFixture, "h02zz");
    const comparison = compareAlgebraEvidence(state.project, qq, zz);
    expect(comparison).toMatchObject({ kind: "domain", verdict: "reported consistency",
      left: { domain: "QQ", verification: "COMPUTED" }, right: { domain: "ZZ", verification: "CHECKED" } });
    expect(comparison.right.facts).toContainEqual({ label: "Cokernel torsion", value: "2, 6" });
    expect(comparison.checks).toContain("Typed rank comparison; full QQ row equivalence is not independently certified");
    const other = state.save(buildAlgebraOperationRequest(state.project, state.q, "sage.matrix.linear_dossier",
      "docker", { matrix: [["1", "2"], ["2", "4"]] }), singularFixture, "h02other");
    expect(compareAlgebraEvidence(state.project, other, zz)).toMatchObject({ kind: "incompatible",
      verdict: "incompatible" });
  });
});
