import { describe, expect, it } from "vitest";
import { createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectDefinition, type Math3DProject } from "@math3d/core";
import { createSageRecipeStarter } from "./sageRecipeStarter";

const empty = () => createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
  results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
{ stableKey: "sage-b07-starters", title: "Recipe starters" });
const add = (project: Math3DProject, label: string, definition: AlgebraObjectDefinition) => {
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, label),
    revision: 1, label, definition });
  return { project: upsertMath3DProjectAlgebraObject(project, record), target: { objectId: record.id, revision: 1 } };
};

describe("SAGE-B07 bounded recipe starters", () => {
  it("builds typed dependent stages for ZZ, QQ, modular and QQ[x] objects", () => {
    let state = add(empty(), "Z", { kind: "integer-ring" });
    const integers = createSageRecipeStarter(state.project, state.target);
    expect(integers.stages.map((stage) => stage.id)).toEqual(["construct", "gcd", "integer-forms"]);
    expect(integers.stages[1].dependsOn[0].outputSchema).toBe(integers.stages[0].outputSchema);
    state = add(state.project, "Q", { kind: "rational-field" });
    expect(createSageRecipeStarter(state.project, state.target).stages.map((stage) => stage.id))
      .toEqual(["construct", "matrix-dossier"]);
    const q = state.target;
    state = add(state.project, "R", { kind: "polynomial-ring", coefficientDomain: q,
      variables: ["x"], monomialOrder: "lex" });
    expect(createSageRecipeStarter(state.project, state.target).stages.map((stage) => stage.id))
      .toEqual(["construct", "polynomial-dossier", "exact-roots"]);
    state = add(state.project, "Z12", { kind: "modular-ring", modulus: "12" });
    expect(createSageRecipeStarter(state.project, state.target).stages.map((stage) => stage.id))
      .toEqual(["construct", "inverse"]);
  });

  it("limits unsupported finite-field polynomial operations to reconstruction", () => {
    let state = add(empty(), "F5", { kind: "finite-field", characteristic: 5, degree: 1,
      generator: "a", construction: "canonical" });
    const parent = state.target;
    state = add(state.project, "F5x", { kind: "polynomial-ring", coefficientDomain: parent,
      variables: ["x"], monomialOrder: "lex" });
    expect(createSageRecipeStarter(state.project, state.target).stages.map((stage) => stage.id))
      .toEqual(["construct"]);
  });
});
