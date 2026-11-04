import { ALGEBRA_OPERATION_REGISTRY, algebraOperationsFor, createAlgebraRecipeGraph,
  type AlgebraObjectRef, type AlgebraOperationArguments, type AlgebraOperationId,
  type AlgebraRecipeGraph, type Math3DProject } from "@math3d/core";

/** One bounded starter per current object kind; users can rerun the saved graph without retyping inputs. */
export const createSageRecipeStarter = (project: Math3DProject, target: AlgebraObjectRef): AlgebraRecipeGraph => {
  const record = project.algebraObjects?.find((entry) => entry.id === target.objectId)?.revisions[target.revision - 1];
  if (!record) throw new TypeError("Select a saved structure for a recipe.");
  const eligible = new Set(algebraOperationsFor(project, target).filter((item) => item.eligible)
    .map((item) => item.definition.id));
  const stages: { id: string; operation: AlgebraOperationId; backend: "docker";
    target: AlgebraObjectRef; args: AlgebraOperationArguments[AlgebraOperationId];
    dependsOn: { stageId: string; outputSchema: string }[] }[] = [];
  const add = (id: string, operation: AlgebraOperationId, args: AlgebraOperationArguments[AlgebraOperationId],
    dependencies: string[] = []) => {
    if (!eligible.has(operation)) return;
    const dependsOn = dependencies.map((stageId) => {
      const parent = stages.find((item) => item.id === stageId);
      const outputSchema = ALGEBRA_OPERATION_REGISTRY.find((item) => item.id === parent?.operation)?.outputSchema;
      if (!parent || !outputSchema) throw new TypeError(`Missing recipe stage ${stageId}.`);
      return { stageId, outputSchema };
    });
    stages.push({ id, operation, backend: "docker", target, args, dependsOn });
  };
  add("construct", "sage.algebra.reconstruct", {});
  if (record.kind === "integer-ring") {
    add("gcd", "sage.numberTheory.gcd", { values: ["84", "30"] }, ["construct"]);
    add("integer-forms", "sage.matrix.integer_forms", { matrix: [["2", "0", "0"],
      ["0", "6", "0"], ["0", "0", "0"]] }, ["construct"]);
  } else if (record.kind === "rational-field") {
    add("matrix-dossier", "sage.matrix.linear_dossier", { matrix: [["1", "2"], ["2", "4"]] }, ["construct"]);
  } else if (record.kind === "modular-ring") {
    add("inverse", "sage.numberTheory.modInverse", { a: "1" }, ["construct"]);
  } else if (record.definition.kind === "polynomial-ring") {
    const [first, second] = record.definition.variables;
    const polynomial = `${first}^2-1`;
    if (record.definition.variables.length === 1) {
      add("polynomial-dossier", "sage.polynomial.dossier", { polynomial }, ["construct"]);
      add("exact-roots", "sage.polynomial.roots_exact", { polynomial }, ["polynomial-dossier"]);
    } else {
      add("factor", "sage.polynomial.factor", { polynomial }, ["construct"]);
      add("groebner", "sage.groebner.compute", { polynomials: [polynomial, second] }, ["construct"]);
    }
  } else if (record.definition.kind === "ideal") {
    const definition = record.definition;
    add("groebner", "sage.ideal.groebner", {});
    const ring = project.algebraObjects?.find((item) => item.id === definition.ambientRing.objectId)
      ?.revisions[definition.ambientRing.revision - 1];
    if (ring?.definition.kind === "polynomial-ring" && ring.definition.variables.length > 1)
      add("elimination", "sage.ideal.eliminate", { eliminate: [ring.definition.variables[0]] }, ["groebner"]);
    add("membership", "sage.ideal.membership", { polynomial: definition.generators[0] }, ["groebner"]);
  } else if (record.definition.kind === "quotient-ring") {
    add("dimension", "sage.ideal.quotientDimension", {});
  }
  return createAlgebraRecipeGraph(project, { template: "bounded-starter-v1", target },
    `${record.label} exact analysis`, stages);
};
