import { describe, expect, it } from "vitest";
import fixture from "../fixtures/sage-matrix-dossier-singular.json";
import { algebraOperationsFor, buildAlgebraOperationRequest, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, parseAlgebraOperationResult,
  parseSageMatrixDossierInput, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const projectWithDomains = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [],
    artifacts: [], relations: [], committedSelection: null, constructions: [] }), { stableKey: "sage-b03" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"), label: "Q",
    revision: 1, definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const z = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Z"), label: "Z",
    revision: 1, definition: { kind: "integer-ring" } });
  project = upsertMath3DProjectAlgebraObject(project, z);
  return { project, q: { objectId: q.id, revision: 1 }, z: { objectId: z.id, revision: 1 } };
};

describe("SAGE-B03 exact QQ matrix dossier", () => {
  it("filters by saved coefficient domain and builds a bounded versioned request", () => {
    const { project, q, z } = projectWithDomains();
    expect(algebraOperationsFor(project, q).find((item) => item.definition.id === "sage.matrix.linear_dossier")?.eligible).toBe(true);
    expect(algebraOperationsFor(project, z).find((item) => item.definition.id === "sage.matrix.linear_dossier")?.reason)
      .toMatch(/does not accept integer-ring/);
    const request = buildAlgebraOperationRequest(project, q, "sage.matrix.linear_dossier", "docker",
      { matrix: [["1", "2"], ["2", "4"]] });
    expect(request).toMatchObject({ target: q, backend: "docker", outputSchema: "math3d.sage-matrix-dossier-result/v1",
      params: { format: "math3d.sage-matrix-dossier", schemaVersion: 1, matrix: [["1", "2"], ["2", "4"]] } });
    expect(parseAlgebraOperationResult(request, fixture)).toMatchObject({ rank: 1, pivotColumns: [0],
      kernelBasis: [["-2", "1"]], minimalPolynomial: "t^2 - 5*t" });
    expect(() => buildAlgebraOperationRequest(project, z, "sage.matrix.linear_dossier", "docker",
      { matrix: [["1"]] })).toThrow(/does not accept integer-ring/);
    expect(() => buildAlgebraOperationRequest(project, q, "sage.matrix.linear_dossier", "private",
      { matrix: [["1"]] })).toThrow(/not available/);
  });

  it("rejects noncanonical fractions, extra fields and mismatched witnesses", () => {
    for (const bad of ([["2/4"]], [["0/2"]], [["-0"]], [["1/0"]], [["1", "2"], ["3"]],
      [["1;print(1)"]], Array.from({ length: 9 }, () => ["1"]))) {
      expect(() => parseSageMatrixDossierInput({ format: "math3d.sage-matrix-dossier", schemaVersion: 1,
        matrix: bad })).toThrow(/canonical QQ/);
    }
    const { project, q } = projectWithDomains();
    const request = buildAlgebraOperationRequest(project, q, "sage.matrix.linear_dossier", "docker",
      { matrix: [["1", "2"], ["2", "4"]] });
    expect(() => parseAlgebraOperationResult(request, { ...fixture, sourceMatrix: [["1", "2"], ["2", "5"]] }))
      .toThrow(/mismatched source/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, kernelBasis: [["1", "0"]] }))
      .toThrow(/kernel vector/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, kernelBasis: [["0", "0"]] }))
      .toThrow(/canonical RREF/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, imageBasis: [["1", "3"]] }))
      .toThrow(/image basis/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, pivotColumns: [1] }))
      .toThrow(/RREF/);
    expect(() => parseAlgebraOperationResult(request, { ...fixture, code: "print(1)" })).toThrow(/Invalid exact/);
  });
});
