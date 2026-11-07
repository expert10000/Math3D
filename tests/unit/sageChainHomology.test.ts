import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, algebraOperationsFor, buildAlgebraOperationRequest,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraEvidence, createProjectAlgebraObjectId, inspectProjectAlgebraFreshness,
  parseMath3DProject, parseProjectAlgebraEvidence, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = (d1: string[][], d2: string[][]) => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-e06", title: "Chain homology" });
  const record = (key: string, definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) =>
    createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, key),
      revision: 1, label: key, definition });
  const ref = (item: ReturnType<typeof record>) => ({ objectId: item.id, revision: 1 });
  const zz = record("ZZ", { kind: "integer-ring" });
  project = upsertMath3DProjectAlgebraObject(project, zz);
  const dims = [d1.length, d2.length, d2[0].length];
  const groups = dims.map((rank, degree) => record(`C${degree}`, { kind: "module", baseRing: ref(zz),
    ambientRank: rank, generators: Array.from({ length: rank }, (_, index) => `e${index + 1}`),
    relationMap: { domainRank: 0, codomainRank: rank, matrix: Array.from({ length: rank }, () => []) } }));
  for (const group of groups) project = upsertMath3DProjectAlgebraObject(project, group);
  const map1 = record("d1", { kind: "module-map", sourceModule: ref(groups[1]), targetModule: ref(groups[0]),
    domainRank: dims[1], codomainRank: dims[0], matrix: d1 });
  const map2 = record("d2", { kind: "module-map", sourceModule: ref(groups[2]), targetModule: ref(groups[1]),
    domainRank: dims[2], codomainRank: dims[1], matrix: d2 });
  project = upsertMath3DProjectAlgebraObject(project, map1);
  project = upsertMath3DProjectAlgebraObject(project, map2);
  const chain = record("C", { kind: "chain-complex", coefficientRing: ref(zz),
    modules: [ref(groups[0]), ref(groups[1]), ref(groups[2])], boundaries: [ref(map1), ref(map2)] });
  return { project, chain, map1, map2, groups, zz, ref, finish: () => {
    const saved = upsertMath3DProjectAlgebraObject(project, chain);
    const request = buildAlgebraOperationRequest(saved, ref(chain), "sage.chain.homology", "docker", {});
    return { project: saved, request };
  } };
};
const diagonalSmith = (form: string[][]) => ({ form,
  diagonal: Array.from({ length: Math.min(form.length, form[0].length) }, (_, index) => form[index][index]),
  transformations: { status: "verified", left: Array.from({ length: form.length }, (_, i) =>
    Array.from({ length: form.length }, (_, j) => i === j ? "1" : "0")),
  right: Array.from({ length: form[0].length }, (_, i) =>
    Array.from({ length: form[0].length }, (_, j) => i === j ? "1" : "0")) } });
const result = (d1: string[][], restricted: string[][] | null,
  groups: { degree: number; freeRank: number; torsionOrders: string[] }[]) => ({
  format: "math3d.sage-chain-homology-result", schemaVersion: 1, coefficientDomain: "ZZ",
  dimensions: [d1.length, d1[0].length, restricted?.[0].length ?? 1],
  boundary1Smith: diagonalSmith(d1),
  inverseRight: Array.from({ length: d1[0].length }, (_, i) =>
    Array.from({ length: d1[0].length }, (_, j) => i === j ? "1" : "0")),
  restrictedBoundary2Smith: restricted ? diagonalSmith(restricted) : null, groups });
const runtime = { engine: "sagemath" as const, version: "10.10", backend: "docker" as const,
  jobId: "sage-e06-chain", elapsedMs: 2, warnings: [] };

describe("SAGE-E06 pinned chain complexes and exact homology", () => {
  it("saves a torsion complex and reopens pinned homology evidence independently", () => {
    const { chain, finish } = setup([["0"]], [["2"]]);
    const { project, request } = finish();
    const output = result([["0"]], [["2"]], [
      { degree: 0, freeRank: 1, torsionOrders: [] },
      { degree: 1, freeRank: 0, torsionOrders: ["2"] },
      { degree: 2, freeRank: 0, torsionOrders: [] }]);
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, output, runtime);
    const reopened = parseMath3DProject(serializeMath3DProject(addMath3DProjectAlgebraEvidence(project, evidence)));
    expect(reopened.algebraObjects?.find((item) => item.id === chain.id)?.revisions[0]).toEqual(chain);
    expect(reopened.algebraEvidence?.[0].result).toEqual(evidence.result);
    expect((reopened.algebraEvidence?.[0].result as typeof evidence.result & { groups: typeof output.groups }).groups[1])
      .toEqual({ degree: 1, freeRank: 0, torsionOrders: ["2"] });
  });

  it("checks a free plus torsion H1 and a zero-rank kernel", () => {
    const mixed = setup([["0", "0"]], [["2"], ["0"]]).finish();
    const mixedOutput = result([["0", "0"]], [["2"], ["0"]], [
      { degree: 0, freeRank: 1, torsionOrders: [] },
      { degree: 1, freeRank: 1, torsionOrders: ["2"] },
      { degree: 2, freeRank: 0, torsionOrders: [] }]);
    expect(createProjectAlgebraEvidence(mixed.project.identity.id, mixed.project.algebraObjects!, mixed.request,
      mixedOutput, runtime).result).toMatchObject({ groups: mixedOutput.groups });
    const full = setup([["1"]], [["0"]]).finish();
    const fullOutput = result([["1"]], null, [
      { degree: 0, freeRank: 0, torsionOrders: [] },
      { degree: 1, freeRank: 0, torsionOrders: [] },
      { degree: 2, freeRank: 1, torsionOrders: [] }]);
    expect(createProjectAlgebraEvidence(full.project.identity.id, full.project.algebraObjects!, full.request,
      fullOutput, runtime).result).toMatchObject({ groups: fullOutput.groups });
  });

  it("checks a nontrivial Smith kernel-basis change against its pinned maps", () => {
    const { project, request } = setup([["2", "4"]], [["-2"], ["1"]]).finish();
    const output = { format: "math3d.sage-chain-homology-result", schemaVersion: 1,
      coefficientDomain: "ZZ", dimensions: [1, 2, 1],
      boundary1Smith: { form: [["2", "0"]], diagonal: ["2"], transformations: {
        status: "verified", left: [["1"]], right: [["1", "-2"], ["0", "1"]] } },
      inverseRight: [["1", "2"], ["0", "1"]],
      restrictedBoundary2Smith: diagonalSmith([["1"]]),
      groups: [{ degree: 0, freeRank: 0, torsionOrders: ["2"] },
        { degree: 1, freeRank: 0, torsionOrders: [] }, { degree: 2, freeRank: 0, torsionOrders: [] }] };
    expect(createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      output, runtime).result).toMatchObject({ groups: output.groups });
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...output, inverseRight: [["1", "0"], ["0", "1"]] }, runtime)).toThrow(/inverse/);
  });

  it("rejects nonzero composition, wrong typing, forged homology and changed snapshots", () => {
    const invalid = setup([["1"]], [["2"]]);
    expect(() => invalid.finish()).toThrow(/d1·d2 = 0/);
    const setupGood = setup([["0"]], [["2"]]);
    const badDefinition = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(setupGood.project.identity.id, "bad"),
      revision: 1, label: "bad", definition: { kind: "chain-complex", coefficientRing: setupGood.ref(setupGood.zz),
        modules: [setupGood.ref(setupGood.groups[1]), setupGood.ref(setupGood.groups[0]), setupGood.ref(setupGood.groups[2])],
        boundaries: [setupGood.ref(setupGood.map1), setupGood.ref(setupGood.map2)] } });
    expect(() => upsertMath3DProjectAlgebraObject(setupGood.project, badDefinition)).toThrow(/d1 must/);
    const { project, request } = setupGood.finish();
    const output = result([["0"]], [["2"]], [
      { degree: 0, freeRank: 1, torsionOrders: [] },
      { degree: 1, freeRank: 0, torsionOrders: ["2"] },
      { degree: 2, freeRank: 0, torsionOrders: [] }]);
    expect(() => createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      { ...output, groups: output.groups.map((group, index) => index === 1
        ? { ...group, torsionOrders: ["3"] } : group) }, runtime)).toThrow(/disagree/);
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request, output, runtime);
    expect(() => parseProjectAlgebraEvidence({ ...evidence, request: { ...request,
      params: { ...request.params, boundary2: [["3"]] } } }, project.identity.id,
    project.algebraObjects!)).toThrow(/differ/);
    const gate = algebraOperationsFor(project, { objectId: setupGood.chain.id, revision: 1 }, [
      { backend: "docker", available: false, operations: [], reason: "unavailable" }])
      .find((item) => item.definition.id === "sage.chain.homology")!;
    expect(gate.readyBackend).toBeNull();
    expect(gate.runtimeReason).toContain("unavailable");
    expect(inspectProjectAlgebraFreshness(project).every((item) => item.status === "fresh")).toBe(true);
  });

  it("marks the pinned complex stale when a boundary map advances", () => {
    const fixture = setup([["0"]], [["2"]]);
    let { project } = fixture.finish();
    const revised = createAlgebraObjectRecord({ id: fixture.map2.id, revision: 2, label: "d2 revised",
      definition: { kind: "module-map", sourceModule: fixture.ref(fixture.groups[2]),
        targetModule: fixture.ref(fixture.groups[1]), domainRank: 1, codomainRank: 1, matrix: [["4"]] } });
    project = upsertMath3DProjectAlgebraObject(project, revised);
    expect(inspectProjectAlgebraFreshness(project).find((item) => item.objectId === fixture.chain.id)?.status).toBe("stale");
    expect(() => buildAlgebraOperationRequest(project, fixture.ref(fixture.chain),
      "sage.chain.homology", "docker", {})).toThrow(/stale parent/);
  });
});
