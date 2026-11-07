import { describe, expect, it } from "vitest";
import { createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, inspectProjectAlgebraFreshness, parseMath3DProject,
  serializeMath3DProject, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const makeProject = () => createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
  results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
{ stableKey: "sage-e04", title: "Module presentations" });
const record = (project: ReturnType<typeof makeProject>, key: string,
  definition: Parameters<typeof createAlgebraObjectRecord>[0]["definition"]) => createAlgebraObjectRecord({
    id: createProjectAlgebraObjectId(project.identity.id, key), revision: 1, label: key, definition });
const ref = (item: ReturnType<typeof createAlgebraObjectRecord>) => ({ objectId: item.id, revision: item.revision });

describe("SAGE-E04 module presentations", () => {
  it("saves free and presented ZZ modules and a typed map with stable IDs and matrices", () => {
    let project = makeProject();
    const zz = record(project, "ZZ", { kind: "integer-ring" });
    project = upsertMath3DProjectAlgebraObject(project, zz);
    const free = record(project, "F", { kind: "module", baseRing: ref(zz), ambientRank: 2,
      generators: ["e1", "e2"], relationMap: { domainRank: 0, codomainRank: 2, matrix: [[], []] } });
    project = upsertMath3DProjectAlgebraObject(project, free);
    const presented = record(project, "M", { kind: "module", baseRing: ref(zz), ambientRank: 2,
      generators: ["u", "v"], relationMap: { domainRank: 2, codomainRank: 2,
        matrix: [["2", "0"], ["0", "6"]] } });
    project = upsertMath3DProjectAlgebraObject(project, presented);
    const target = record(project, "G", { kind: "module", baseRing: ref(zz), ambientRank: 3,
      generators: ["a", "b", "c"], relationMap: { domainRank: 0, codomainRank: 3, matrix: [[], [], []] } });
    project = upsertMath3DProjectAlgebraObject(project, target);
    const map = record(project, "f", { kind: "module-map", sourceModule: ref(free), targetModule: ref(target),
      domainRank: 2, codomainRank: 3, matrix: [["1", "0"], ["0", "1"], ["3", "-2"]] });
    project = upsertMath3DProjectAlgebraObject(project, map);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.algebraObjects).toEqual(project.algebraObjects);
    expect(reopened.algebraObjects?.find((item) => item.id === presented.id)?.revisions[0].definition).toEqual(presented.definition);
    expect(reopened.algebraObjects?.find((item) => item.id === map.id)?.revisions[0].dependencies).toEqual([ref(free), ref(target)]);
    expect(inspectProjectAlgebraFreshness(reopened).every((item) => item.status === "fresh")).toBe(true);
  });

  it("rejects invalid dimensions, wrong ZZ scalars, missing parents and quotient-domain maps", () => {
    let project = makeProject();
    const zz = record(project, "ZZ", { kind: "integer-ring" });
    project = upsertMath3DProjectAlgebraObject(project, zz);
    const good = { kind: "module" as const, baseRing: ref(zz), ambientRank: 2,
      generators: ["e1", "e2"], relationMap: { domainRank: 1, codomainRank: 2, matrix: [["2"], ["0"]] } };
    expect(() => createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "bad-shape"),
      revision: 1, label: "bad-shape", definition: { ...good,
        relationMap: { ...good.relationMap, matrix: [["2", "0"], ["0", "1"]] } } })).toThrow(/2 rows and 1 columns/);
    expect(() => upsertMath3DProjectAlgebraObject(project, record(project, "bad-scalar", { ...good,
      relationMap: { ...good.relationMap, matrix: [["1/2"], ["0"]] } }))).toThrow(/ZZ module matrices/);
    const missing = record(project, "missing", { ...good, baseRing: {
      objectId: createProjectAlgebraObjectId(project.identity.id, "absent"), revision: 1 } });
    expect(() => upsertMath3DProjectAlgebraObject(project, missing)).toThrow(/Missing algebra parent/);
    const quotient = record(project, "Q", good);
    project = upsertMath3DProjectAlgebraObject(project, quotient);
    const map = record(project, "bad-map", { kind: "module-map", sourceModule: ref(quotient), targetModule: ref(quotient),
      domainRank: 2, codomainRank: 2, matrix: [["1", "0"], ["0", "1"]] });
    expect(() => upsertMath3DProjectAlgebraObject(project, map)).toThrow(/free-module source and target/);
    const free = record(project, "F", { kind: "module", baseRing: ref(zz), ambientRank: 2,
      generators: ["a", "b"], relationMap: { domainRank: 0, codomainRank: 2, matrix: [[], []] } });
    project = upsertMath3DProjectAlgebraObject(project, free);
    expect(() => upsertMath3DProjectAlgebraObject(project, record(project, "wrong-dim", {
      kind: "module-map", sourceModule: ref(free), targetModule: ref(free),
      domainRank: 1, codomainRank: 2, matrix: [["1"], ["0"]] }))).toThrow(/dimensions inconsistent/);
    const modular = record(project, "Z5", { kind: "modular-ring", modulus: "5" });
    project = upsertMath3DProjectAlgebraObject(project, modular);
    expect(() => upsertMath3DProjectAlgebraObject(project, record(project, "unsupported-ring", {
      kind: "module", baseRing: ref(modular), ambientRank: 1, generators: ["e"],
      relationMap: { domainRank: 0, codomainRank: 1, matrix: [[]] } }))).toThrow(/requires pinned ZZ, QQ or QQ polynomial/);
  });

  it("checks QQ and polynomial entries and marks modules stale when their pinned ring advances", () => {
    let project = makeProject();
    const qq = record(project, "QQ", { kind: "rational-field" });
    project = upsertMath3DProjectAlgebraObject(project, qq);
    const rational = record(project, "V", { kind: "module", baseRing: ref(qq), ambientRank: 1,
      generators: ["e"], relationMap: { domainRank: 1, codomainRank: 1, matrix: [["1/10"]] } });
    project = upsertMath3DProjectAlgebraObject(project, rational);
    expect(() => upsertMath3DProjectAlgebraObject(project, record(project, "bad-rational", { kind: "module",
      baseRing: ref(qq), ambientRank: 1, generators: ["e"],
      relationMap: { domainRank: 1, codomainRank: 1, matrix: [["2/4"]] } }))).toThrow(/reduced rational/);
    const ring = record(project, "R", { kind: "polynomial-ring", coefficientDomain: ref(qq),
      variables: ["x", "y"], monomialOrder: "degrevlex" });
    project = upsertMath3DProjectAlgebraObject(project, ring);
    const module = record(project, "P", { kind: "module", baseRing: ref(ring), ambientRank: 2,
      generators: ["u", "v"], relationMap: { domainRank: 1, codomainRank: 2,
        matrix: [["x+y"], ["x^2-1"]] } });
    project = upsertMath3DProjectAlgebraObject(project, module);
    expect(() => upsertMath3DProjectAlgebraObject(project, record(project, "bad-variable", { kind: "module",
      baseRing: ref(ring), ambientRank: 1, generators: ["e"],
      relationMap: { domainRank: 1, codomainRank: 1, matrix: [["z+1"]] } }))).toThrow(/outside the ambient ring/);
    const ring2 = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: { kind: "polynomial-ring", coefficientDomain: ref(qq), variables: ["x", "y", "z"],
        monomialOrder: "degrevlex" } });
    project = upsertMath3DProjectAlgebraObject(project, ring2);
    expect(inspectProjectAlgebraFreshness(project).find((item) => item.objectId === module.id)?.status).toBe("stale");
    expect(parseMath3DProject(serializeMath3DProject(project)).algebraObjects?.find((item) => item.id === module.id)
      ?.revisions[0].definition).toEqual(module.definition);
  });
});
