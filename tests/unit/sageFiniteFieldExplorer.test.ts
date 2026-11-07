import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, parseMath3DProject,
  parseProjectAlgebraEvidence, serializeMath3DProject, upsertMath3DProjectAlgebraObject,
} from "../../packages/core/src/index";

const projectWithField = (p = 2, degree = 2) => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: `sage-g01-${p}-${degree}`, title: "Finite-field explorer" });
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "F"),
    revision: 1, label: "F", definition: { kind: "finite-field", characteristic: p, degree,
      generator: "a", construction: "canonical" } });
  project = upsertMath3DProjectAlgebraObject(project, record);
  return { project, record, target: { objectId: record.id, revision: 1 } };
};

// Exact GF(4) values from the live Sage 9.5 worker; source identity is rebound to this test Project.
const gf4 = {
  format: "math3d.sage-finite-field-explorer-result", schemaVersion: 1,
  characteristic: 2, degree: 2, order: 4, generator: "a", construction: "canonical",
  definingPolynomial: [1, 1, 1], selected: { coefficients: [0, 1], text: "a",
    frobeniusOrbit: [[0, 1], [1, 1]], trace: "1", norm: "1",
    minimalPolynomial: [1, 1, 1], multiplicativeOrder: 3, primitive: true },
  elements: [{ coefficients: [0, 0], text: "0" }, { coefficients: [0, 1], text: "a" },
    { coefficients: [1, 0], text: "1" }, { coefficients: [1, 1], text: "a + 1" }],
  primitiveElements: [[0, 1], [1, 1]], multiplicationTable: { status: "complete",
    cells: [[0, 0, 0, 0], [0, 3, 1, 2], [0, 1, 2, 3], [0, 2, 3, 1]] },
};

describe("SAGE-G01 finite-field explorer", () => {
  it("verifies exact GF(4) invariants and independently reopens pinned evidence", () => {
    const { project, record, target } = projectWithField();
    const request = buildAlgebraOperationRequest(project, target, "sage.finiteField.explore", "docker", { element: [0, 1] });
    const result = { ...gf4, target, targetHash: record.contentHash };
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, result,
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sage-g01-gf4",
        elapsedMs: 1, warnings: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(addMath3DProjectAlgebraEvidence(project, evidence)));
    expect(reopened.algebraObjects?.[0].revisions[0]).toEqual(record);
    expect(reopened.algebraEvidence?.[0].result).toEqual(result);
    expect(reopened.algebraEvidence?.[0].certificate?.runtime.sageVersion).toBe("9.5");
    expect(reopened.algebraEvidence?.[0].request.params).toEqual(request.params);
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...result, selected: { ...result.selected, norm: "0" } },
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sage-g01-bad",
        elapsedMs: 1, warnings: [] })).toThrow(/trace or norm/);
    expect(() => parseProjectAlgebraEvidence({ ...evidence, request: { ...request,
      params: { ...request.params, element: [1, 0] } } }, project.identity.id, project.algebraObjects!)).toThrow();
  });

  it("rejects invalid vectors and fields above the enumeration budget", () => {
    const { project, target } = projectWithField();
    expect(() => buildAlgebraOperationRequest(project, target, "sage.finiteField.explore", "docker",
      { element: [2, 0] })).toThrow(/coefficients/);
    expect(() => buildAlgebraOperationRequest(project, target, "sage.finiteField.explore", "private",
      { element: [0, 1] })).toThrow(/not available/);
    const large = projectWithField(2, 7);
    const gate = algebraOperationsFor(large.project, large.target, [{ backend: "docker", available: true,
      operations: ["finite-field.explore"] }]).find((item) => item.definition.id === "sage.finiteField.explore")!;
    expect(gate.reason).toContain("64 elements");
  });
});
