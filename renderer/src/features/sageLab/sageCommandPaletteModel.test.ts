import { describe, expect, it } from "vitest";
import { createAlgebraObjectRecord, createAlgebraRecipeGraph, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, upsertMath3DProjectAlgebraObject,
  upsertMath3DProjectAlgebraRecipe, type AlgebraRouteCapability } from "@math3d/core";
import { sagePaletteCommands, searchSagePaletteCommands } from "./sageCommandPaletteModel";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-h01", title: "Command discovery" });
  const add = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) => {
    const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key),
      revision: 1, label: key, definition });
    project = upsertMath3DProjectAlgebraObject(project, record);
    return record;
  };
  const z = add("Z", { kind: "integer-ring" });
  const q = add("Q", { kind: "rational-field" });
  const ring = add("R", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
    variables: ["x", "y"], monomialOrder: "degrevlex" });
  const field = add("K", { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
    definingPolynomial: ["-5", "0", "1"], generator: "a" });
  const ideal = add("I", { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
    generators: ["x^2+y"] });
  const target = { objectId: z.id, revision: 1 };
  const recipe = createAlgebraRecipeGraph(project, "smith-review", "Smith review", [{ id: "gcd",
    operation: "sage.numberTheory.gcd", backend: "docker", target, args: { values: ["84", "30"] },
    dependsOn: [] }]);
  project = upsertMath3DProjectAlgebraRecipe(project, recipe);
  return { project, z, q, ring, field, ideal, recipe };
};

describe("SAGE-H01 mathematics command discovery", () => {
  it("matches aliases and saved recipes, filtered by the selected object's type", () => {
    const { project, z, q, ring, field, ideal, recipe } = setup();
    const ready: AlgebraRouteCapability[] = [{ backend: "docker", available: true,
      operations: ["matrix.integer-forms", "polynomial.factor", "number-field.prime-decomposition"] }];
    const forZ = sagePaletteCommands(project, { objectId: z.id, revision: 1 }, ready, true);
    expect(searchSagePaletteCommands(forZ, "smith").map((item) => item.key))
      .toContain("sage.matrix.integer_forms");
    expect(searchSagePaletteCommands(forZ, "smith").find((item) => item.key === "sage.matrix.integer_forms")?.enabled)
      .toBe(true);
    expect(searchSagePaletteCommands(forZ, "Smith review")[0].action).toEqual({ kind: "recipe", id: recipe.id });
    expect(searchSagePaletteCommands(sagePaletteCommands(project, { objectId: q.id, revision: 1 }, ready, true), "smith"))
      .toEqual([]);
    expect(searchSagePaletteCommands(sagePaletteCommands(project, { objectId: ring.id, revision: 1 }, ready, true),
      "factor over")[0].enabled).toBe(true);
    expect(searchSagePaletteCommands(sagePaletteCommands(project, { objectId: field.id, revision: 1 }, ready, true),
      "prime decomposition")[0].key).toBe("sage.numberField.primeDecomposition");
    expect(searchSagePaletteCommands(sagePaletteCommands(project, { objectId: ideal.id, revision: 1 }, ready, true),
      "show tangent cone")[0].action).toEqual({ kind: "tangent" });
  });

  it("explains unavailable runtime and invalid domain without launching a command", () => {
    const { project, z, ring } = setup();
    const offline: AlgebraRouteCapability[] = [{ backend: "docker", available: false, operations: [],
      reason: "Docker engine stopped" }];
    const smith = searchSagePaletteCommands(sagePaletteCommands(project, { objectId: z.id, revision: 1 },
      offline, true), "smith").find((item) => item.key === "sage.matrix.integer_forms")!;
    expect(smith.enabled).toBe(false);
    expect(smith.reason).toContain("Docker engine stopped");
    const dossier = searchSagePaletteCommands(sagePaletteCommands(project, { objectId: ring.id, revision: 1 },
      offline, true), "polynomial dossier")[0];
    expect(dossier.enabled).toBe(false);
    expect(dossier.reason).toContain("exactly one polynomial variable");
    expect(sagePaletteCommands(null, null, [], false).map((item) => item.key)).toEqual(["runtimes"]);
  });

  it("does not offer execution from a stale pinned parent", () => {
    const { project, q, ring, ideal } = setup();
    const advanced = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
      id: ring.id, revision: 2, label: ring.label, definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: q.id, revision: 1 }, variables: ["x", "y", "z"],
        monomialOrder: "degrevlex" } }));
    const membership = searchSagePaletteCommands(sagePaletteCommands(advanced,
      { objectId: ideal.id, revision: 1 }, [{ backend: "docker", available: true,
        operations: ["ideal.membership"] }], true), "membership")[0];
    expect(membership.enabled).toBe(false);
    expect(membership.reason).toContain("stale parent");
  });
});
