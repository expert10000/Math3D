import { describe, expect, it } from "vitest";
import { createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, inspectProjectAlgebraFreshness, parseIdealGenerator,
  parseAlgebraObjectRecord, parseMath3DProject, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [],
    artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-c01", title: "Ideal Project" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
    revision: 1, label: "Q", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const r = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "R"),
    revision: 1, label: "R", definition: { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
      variables: ["x", "y"], monomialOrder: "lex" } });
  project = upsertMath3DProjectAlgebraObject(project, r);
  const ideal = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "I"),
    revision: 1, label: "I", definition: { kind: "ideal", ambientRing: { objectId: r.id, revision: 1 },
      generators: ["x^2+y", "x*y-1"] } });
  return { project, q, r, ideal };
};

describe("SAGE-C01 Project ideal objects", () => {
  it("exports and independently imports the same pinned ideal ID, definition and revision", () => {
    const { project, r, ideal } = setup();
    const saved = upsertMath3DProjectAlgebraObject(project, ideal);
    const bytes = serializeMath3DProject(saved);
    const reopened = parseMath3DProject(bytes);
    const found = reopened.algebraObjects?.find((entry) => entry.id === ideal.id)?.revisions[0];
    expect(found).toEqual(ideal);
    expect(found?.definition).toEqual({ kind: "ideal", ambientRing: { objectId: r.id, revision: 1 },
      generators: ["x^2+y", "x*y-1"] });
    expect(found?.contentHash).toBe(ideal.contentHash);
    expect(ideal.dependencies).toEqual([{ objectId: r.id, revision: 1 }]);
    expect(() => parseAlgebraObjectRecord({ ...ideal, contentHash: `sha256:${"0".repeat(64)}` }))
      .toThrow(/contentHash/);
    const revised = createAlgebraObjectRecord({ id: ideal.id, revision: 2, label: "I2",
      definition: { kind: "ideal", ambientRing: { objectId: r.id, revision: 1 }, generators: ["x^2+y", "x*y-2"] } });
    const twice = upsertMath3DProjectAlgebraObject(saved, revised);
    expect(parseMath3DProject(serializeMath3DProject(twice)).algebraObjects?.find((entry) => entry.id === ideal.id)
      ?.revisions).toEqual([ideal, revised]);
    expect(() => upsertMath3DProjectAlgebraObject(saved, { ...ideal, label: "Other" })).toThrow(/Duplicate/);
  });

  it("rejects missing or wrong ambient parents, foreign variables and unbounded syntax", () => {
    const { project, q, ideal } = setup();
    expect(parseIdealGenerator("(x+y)/2", ["x", "y"])).toBe("(x+y)/2");
    expect(() => upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
      id: ideal.id, revision: 1, label: "I", definition: { kind: "ideal",
        ambientRing: { objectId: q.id, revision: 1 }, generators: ["x"] } }))).toThrow(/polynomial ambient ring/);
    expect(() => upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
      id: ideal.id, revision: 1, label: "I", definition: { kind: "ideal",
        ambientRing: { objectId: createProjectAlgebraObjectId(project.identity.id, "missing"), revision: 1 },
        generators: ["x"] } }))).toThrow(/Missing algebra parent/);
    expect(() => upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({
      id: ideal.id, revision: 1, label: "I", definition: { ...ideal.definition, generators: ["z+1"] } })))
      .toThrow(/outside the ambient ring/);
    expect(() => createAlgebraObjectRecord({ id: ideal.id, revision: 1, label: "I",
      definition: { kind: "ideal", ambientRing: { objectId: q.id, revision: 1 },
        generators: ["x+y", "x+y"] } })).toThrow(/distinct/);
    for (const invalid of ["x^17", "x^-1", "x++y", "x;print(1)", "1/0", "x/y", "x*x*x*x*x*x*x*x*x*x*x*x*x*x*x*x*x"])
      expect(() => parseIdealGenerator(invalid, ["x", "y"])).toThrow();
  });

  it("marks an ideal stale when its pinned ambient ring advances", () => {
    const { project, q, r, ideal } = setup();
    const saved = upsertMath3DProjectAlgebraObject(project, ideal);
    const newRing = createAlgebraObjectRecord({ id: r.id, revision: 2, label: "R",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
        variables: ["x", "z"], monomialOrder: "lex" } });
    const advanced = upsertMath3DProjectAlgebraObject(saved, newRing);
    expect(inspectProjectAlgebraFreshness(advanced).find((item) => item.objectId === ideal.id)?.status).toBe("stale");
    expect(parseMath3DProject(serializeMath3DProject(advanced)).algebraObjects
      ?.find((entry) => entry.id === ideal.id)?.revisions[0]).toEqual(ideal);
  });
});
