import { describe, expect, it } from "vitest";
import fixture from "../fixtures/sage-integer-matrix-forms-2-6-0.json";
import { algebraOperationsFor, buildAlgebraOperationRequest, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseAlgebraOperationResult,
  parseSageIntegerMatrixFormsInput, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const projectWithDomains = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [],
    artifacts: [], relations: [], committedSelection: null, constructions: [] }), { stableKey: "sage-b04" });
  const z = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Z"), label: "Z",
    revision: 1, definition: { kind: "integer-ring" } });
  project = upsertMath3DProjectAlgebraObject(project, z);
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"), label: "Q",
    revision: 1, definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  return { project, z: { objectId: z.id, revision: 1 }, q: { objectId: q.id, revision: 1 } };
};

describe("SAGE-B04 Smith and Hermite over ZZ", () => {
  it("filters by saved integer ring and validates the shared exact fixture", () => {
    const { project, z, q } = projectWithDomains();
    expect(algebraOperationsFor(project, z).find((item) => item.definition.id === "sage.matrix.integer_forms")?.eligible).toBe(true);
    expect(algebraOperationsFor(project, q).find((item) => item.definition.id === "sage.matrix.integer_forms")?.reason)
      .toMatch(/does not accept rational-field/);
    const request = buildAlgebraOperationRequest(project, z, "sage.matrix.integer_forms", "docker",
      { matrix: [["2", "0", "0"], ["0", "6", "0"], ["0", "0", "0"]] });
    expect(request).toMatchObject({ target: z, outputSchema: "math3d.sage-integer-matrix-forms-result/v1",
      params: { format: "math3d.sage-integer-matrix-forms", schemaVersion: 1 } });
    expect(parseAlgebraOperationResult(request, fixture)).toMatchObject({ rank: 2,
      smith: { diagonal: ["2", "6", "0"], transformations: { status: "verified" } },
      cokernel: { freeRank: 1, torsionOrders: ["2", "6"] } });
    expect(() => buildAlgebraOperationRequest(project, q, "sage.matrix.integer_forms", "docker",
      { matrix: [["2"]] })).toThrow(/does not accept rational-field/);
    expect(() => buildAlgebraOperationRequest(project, z, "sage.matrix.integer_forms", "private",
      { matrix: [["2"]] })).toThrow(/not available/);
  });

  it("rejects noncanonical input and false invariant or transformation claims", () => {
    for (const matrix of ([["-0"]], [["01"]], [["1/2"]], [["1", "2"], ["3"]],
      [["1;print(1)"]], Array.from({ length: 7 }, () => ["1"]))) {
      expect(() => parseSageIntegerMatrixFormsInput({ format: "math3d.sage-integer-matrix-forms", schemaVersion: 1,
        matrix })).toThrow(/canonical signed decimals/);
    }
    const { project, z } = projectWithDomains();
    const request = buildAlgebraOperationRequest(project, z, "sage.matrix.integer_forms", "docker",
      { matrix: [["2", "0", "0"], ["0", "6", "0"], ["0", "0", "0"]] });
    expect(() => parseAlgebraOperationResult(request, { ...fixture, sourceMatrix: [["2", "0", "0"],
      ["0", "5", "0"], ["0", "0", "0"]] })).toThrow(/mismatched source/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, smith: { ...fixture.smith,
      diagonal: ["2", "5", "0"] } })).toThrow(/Smith form violates/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, cokernel: { freeRank: 1,
      torsionOrders: ["6"] } })).toThrow(/cokernel invariants/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, smith: { ...fixture.smith,
      transformations: { ...fixture.smith.transformations, right: [["2", "0", "0"],
        ["0", "1", "0"], ["0", "0", "1"]] } } })).toThrow(/unimodular/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, hermite: { ...fixture.hermite,
      transformation: { ...fixture.hermite.transformation, left: [["1", "0", "0"],
        ["0", "2", "0"], ["0", "0", "1"]] } } })).toThrow(/unimodular/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, code: "print(1)" })).toThrow(/Invalid exact/);
  });

  it("labels missing transformations explicitly without claiming a verified identity", () => {
    const { project, z } = projectWithDomains();
    const request = buildAlgebraOperationRequest(project, z, "sage.matrix.integer_forms", "docker",
      { matrix: [["2", "0", "0"], ["0", "6", "0"], ["0", "0", "0"]] });
    const without = { ...fixture,
      smith: { ...fixture.smith, transformations: { status: "unavailable", reason: "Runtime returned only D." } },
      hermite: { ...fixture.hermite, transformation: { status: "unavailable", reason: "Runtime returned only H." } } };
    expect(parseAlgebraOperationResult(request, without)).toMatchObject({
      smith: { transformations: { status: "unavailable" } }, hermite: { transformation: { status: "unavailable" } } });
  });
});
