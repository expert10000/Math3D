import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import matrixFixture from "../../../../tests/fixtures/sage-matrix-dossier-singular.json";
import smithFixture from "../../../../tests/fixtures/sage-integer-matrix-forms-2-6-0.json";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraEvidence,
  createProjectAlgebraObjectId, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectDefinition, type Math3DProject } from "@math3d/core";
import { algebraEvidenceInspectorModel } from "./algebraEvidenceInspectorModel";
import { qualifyAlgebraEvidence } from "./algebraEvidenceQualification";
import SageAlgebraEvidenceInspector from "./SageAlgebraEvidenceInspector";

const empty = () => createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
  results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
{ stableKey: "sage-b06", title: "Inspector acceptance" });
const withObject = (project: Math3DProject, label: string, definition: AlgebraObjectDefinition) => {
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, label),
    revision: 1, label, definition });
  return { project: upsertMath3DProjectAlgebraObject(project, record), record };
};
const provenance = (jobId: string) => ({ engine: "sagemath" as const, version: "9.5", backend: "docker" as const,
  jobId, elapsedMs: 17, warnings: [] });

describe("SAGE-B06 saved algebra evidence Inspector", () => {
  it("qualifies integrity and pinned revision separately from current lineage", () => {
    const { project, record } = withObject(empty(), "Z", { kind: "integer-ring" });
    const request = buildAlgebraOperationRequest(project, { objectId: record.id, revision: 1 },
      "sage.numberTheory.gcd", "docker", { values: ["84", "30"] });
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { value: "6" }, provenance("b06-qualification"));
    const saved = addMath3DProjectAlgebraEvidence(project, evidence);
    expect(qualifyAlgebraEvidence(saved, evidence)).toMatchObject({
      status: "current", canUseResult: true, canDerive: true,
      revision: 1, definitionHash: record.contentHash });
    const revised = upsertMath3DProjectAlgebraObject(saved, createAlgebraObjectRecord({ id: record.id,
      revision: 2, label: "Integers", definition: { kind: "integer-ring" } }));
    expect(qualifyAlgebraEvidence(revised, evidence)).toMatchObject({
      status: "historical", canUseResult: true, canDerive: false });
    expect(qualifyAlgebraEvidence(saved, { ...evidence,
      resultHash: "sha256:" + "0".repeat(64) })).toMatchObject({
      status: "invalid", canUseResult: false, canDerive: false });
    const invalid = algebraEvidenceInspectorModel(saved, { ...evidence,
      resultHash: "sha256:" + "0".repeat(64) });
    expect(invalid).toMatchObject({ mode: "FAILED", result: [] });
    expect(invalid.checks).toContainEqual(expect.objectContaining({
      label: "Saved evidence integrity", status: "failed" }));
    expect(invalid.structure).toContainEqual({ label: "Status", value: "Invalid evidence" });
    const historical = algebraEvidenceInspectorModel(revised, evidence);
    expect(historical.qualification.status).toBe("historical");
    expect(historical.structure).toContainEqual({ label: "Status", value: "Historical revision" });
    expect(historical.result).toContainEqual({ label: "Greatest common divisor", value: "6" });
  });
  it("independently checks GCD and catches a mathematically wrong saved value", () => {
    const { project, record } = withObject(empty(), "Z", { kind: "integer-ring" });
    const request = buildAlgebraOperationRequest(project, { objectId: record.id, revision: 1 },
      "sage.numberTheory.gcd", "docker", { values: ["84", "30"] });
    const good = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { value: "6" }, provenance("b06-gcd-good"));
    const saved = addMath3DProjectAlgebraEvidence(project, good);
    const model = algebraEvidenceInspectorModel(saved, good);
    expect(model.mode).toBe("CHECKED");
    expect(model.result).toContainEqual({ label: "Greatest common divisor", value: "6" });
    expect(model.checks).toContainEqual(expect.objectContaining({ label: "Exact GCD", status: "checked" }));
    const wrong = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { value: "7" }, provenance("b06-gcd-wrong"));
    expect(algebraEvidenceInspectorModel(addMath3DProjectAlgebraEvidence(saved, wrong), wrong).mode).toBe("FAILED");
    const revised = upsertMath3DProjectAlgebraObject(saved, createAlgebraObjectRecord({ id: record.id,
      revision: 2, label: "Integers", definition: { kind: "integer-ring" } }));
    expect(algebraEvidenceInspectorModel(revised, good).structure).toContainEqual({ label: "Status", value: "Historical revision" });
  });

  it("checks Smith transformations but labels matrix polynomial claims as reported", () => {
    const integer = withObject(empty(), "Z", { kind: "integer-ring" });
    const smithRequest = buildAlgebraOperationRequest(integer.project,
      { objectId: integer.record.id, revision: 1 }, "sage.matrix.integer_forms", "docker",
      { matrix: smithFixture.sourceMatrix });
    const smith = createProjectAlgebraEvidence(integer.project.identity.id, integer.project.algebraObjects!,
      smithRequest, smithFixture, provenance("b06-smith"));
    const smithModel = algebraEvidenceInspectorModel(addMath3DProjectAlgebraEvidence(integer.project, smith), smith);
    expect(smithModel.mode).toBe("CHECKED");
    expect(smithModel.result).toContainEqual({ label: "Smith diagonal", value: ["2", "6", "0"] });
    expect(smithModel.checks).toContainEqual(expect.objectContaining({ label: "Smith transformation", status: "checked" }));

    const rational = withObject(empty(), "Q", { kind: "rational-field" });
    const request = buildAlgebraOperationRequest(rational.project, { objectId: rational.record.id, revision: 1 },
      "sage.matrix.linear_dossier", "docker", { matrix: matrixFixture.sourceMatrix });
    const evidence = createProjectAlgebraEvidence(rational.project.identity.id, rational.project.algebraObjects!,
      request, matrixFixture, provenance("b06-matrix"));
    const model = algebraEvidenceInspectorModel(addMath3DProjectAlgebraEvidence(rational.project, evidence), evidence);
    expect(model.mode).toBe("COMPUTED");
    expect(model.result).toContainEqual({ label: "RREF", value: [["1", "2"], ["0", "0"]] });
    expect(model.checks).toContainEqual(expect.objectContaining({ label: "Kernel and image witnesses", status: "checked" }));
    expect(model.checks).toContainEqual(expect.objectContaining({ label: "Full matrix equivalence", status: "reported" }));
    expect(model.execution).toContainEqual({ label: "Algorithm", value: "Not reported" });
    const rendered = renderToStaticMarkup(createElement(SageAlgebraEvidenceInspector,
      { model, section: "result" }));
    expect(rendered).toContain('<table class="sage-evidence-matrix"');
    expect(rendered).toContain("Kernel basis");
  });

  it("checks a modular inverse identity and labels unavailable Smith certificates", () => {
    const modular = withObject(empty(), "Z12", { kind: "modular-ring", modulus: "12" });
    const inverseRequest = buildAlgebraOperationRequest(modular.project,
      { objectId: modular.record.id, revision: 1 }, "sage.numberTheory.modInverse", "docker", { a: "5" });
    const inverse = createProjectAlgebraEvidence(modular.project.identity.id, modular.project.algebraObjects!,
      inverseRequest, { value: "5", modulus: "12" }, provenance("b06-inverse"));
    expect(algebraEvidenceInspectorModel(addMath3DProjectAlgebraEvidence(modular.project, inverse), inverse).mode)
      .toBe("CHECKED");
    const mismatchedRequest = { ...inverseRequest, params: { a: "5", modulus: "13" } };
    const mismatched = createProjectAlgebraEvidence(modular.project.identity.id, modular.project.algebraObjects!,
      mismatchedRequest, { value: "8", modulus: "13" }, provenance("b06-inverse-wrong-ring"));
    expect(algebraEvidenceInspectorModel(addMath3DProjectAlgebraEvidence(modular.project, mismatched), mismatched).mode)
      .toBe("FAILED");

    const integer = withObject(empty(), "Z", { kind: "integer-ring" });
    const request = buildAlgebraOperationRequest(integer.project, { objectId: integer.record.id, revision: 1 },
      "sage.matrix.integer_forms", "docker", { matrix: smithFixture.sourceMatrix });
    const forms = { ...smithFixture,
      smith: { ...smithFixture.smith, transformations: { status: "unavailable", reason: "Runtime omitted U and V." } },
      hermite: { ...smithFixture.hermite, transformation: { status: "unavailable", reason: "Runtime omitted U." } } };
    const evidence = createProjectAlgebraEvidence(integer.project.identity.id, integer.project.algebraObjects!,
      request, forms, provenance("b06-smith-no-cert"));
    const model = algebraEvidenceInspectorModel(addMath3DProjectAlgebraEvidence(integer.project, evidence), evidence);
    expect(model.mode).toBe("COMPUTED");
    expect(model.checks).toContainEqual(expect.objectContaining({ label: "Smith transformation", status: "unavailable" }));
  });
});
