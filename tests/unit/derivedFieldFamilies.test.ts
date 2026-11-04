import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendProjectDerivedField, compileProjectDerivedFieldEvaluator,
  createMixedWorkspaceDocument, createVectorField3DDocument,
  deriveFieldOutput, parseMath3DProject, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, reviewProjectDerivedField,
  serializeMath3DProject, vectorField3DExpression,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const source = (project: Math3DProject) => project.workspace.entries.find(item =>
  item.module === "vector3d")!.checkpoint as VectorField3DDocument;
const idFor = (project: Math3DProject, key: string) =>
  project.workspace.derivedFields!.find(item => item.metadata.title === key)!.identity.id;
const add = (project: Math3DProject, input: string, kind: Parameters<typeof appendProjectDerivedField>[2],
  title: string, secondaryInputId?: string) => appendProjectDerivedField(project, input, kind,
  { stableKey: `gf16-${title}`, title, secondaryInputId },
  document => document.source.field.kind === "expressions");

describe("GF-16 typed derived operation families", () => {
  it("saves scalar derivatives and Jacobian decomposition with analytic values", () => {
    let project = load();
    const root = source(project).identity.id;
    const magnitude = project.workspace.derivedFields![0]!.identity.id;
    project = add(project, magnitude, { kind: "scalar-gradient" }, "gradient");
    project = add(project, magnitude, { kind: "scalar-hessian" }, "hessian");
    project = add(project, magnitude, { kind: "directional-derivative",
      direction: [0, 2, 0] }, "directional");
    project = add(project, root, { kind: "vector-jacobian" }, "jacobian");
    project = add(project, root, { kind: "jacobian-symmetric" }, "strain");
    project = add(project, root, { kind: "jacobian-antisymmetric" }, "rotation");
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const sample = (name: string) => compileProjectDerivedFieldEvaluator(reopened,
      idFor(reopened, name)).sample([2, 0, 0]);
    expect((sample("gradient") as number[])[0]).toBeCloseTo(1, 10);
    expect(sample("directional")).toBeCloseTo(0, 10);
    const hessian = sample("hessian") as number[][];
    expect(hessian[1]![1]).toBeCloseTo(.5, 3);
    expect(hessian[2]![2]).toBeCloseTo(.5, 3);
    for (const name of ["jacobian", "strain"]) {
      const matrix = sample(name) as number[][];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++)
        expect(matrix[row]![col]).toBeCloseTo(row === col ? 1 : 0, 10);
    }
    for (const row of sample("rotation") as number[][]) for (const value of row)
      expect(value).toBeCloseTo(0, 10);
    expect(reopened.workspace.derivedFields!.find(item => item.metadata.title === "hessian")!.output)
      .toMatchObject({ kind: "tensor", unit: "m/s/m²" });
  });

  it("computes vector operators and withholds binary values when either source changes", () => {
    let project = load();
    const first = source(project);
    const second = createVectorField3DDocument({ ...first.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("1", "m/s"),
        vectorField3DExpression("2", "m/s"),
        vectorField3DExpression("3", "m/s")] } },
    { stableKey: "gf16-second", title: "Second vector" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
      entries: [...project.workspace.entries, { module: "vector3d", checkpoint: second,
        expected: second.identity, replay: null }] }));
    for (const kind of ["vector-dot", "vector-cross", "vector-difference"] as const)
      project = add(project, first.identity.id, { kind }, kind, second.identity.id);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const sample = (name: string) => compileProjectDerivedFieldEvaluator(reopened,
      idFor(reopened, name)).sample([1, 2, 3]);
    expect(sample("vector-dot")).toBe(14);
    expect(sample("vector-cross")).toEqual([0, 0, 0]);
    expect(sample("vector-difference")).toEqual([0, 0, 0]);
    expect(reopened.workspace.derivedFields!.find(item => item.metadata.title === "vector-dot")!
      .secondaryInput).toMatchObject({ documentId: second.identity.id,
        revision: second.identity.revision });
    const revised = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display,
        maxGlyphs: second.source.display.maxGlyphs + 1 } });
    expect(revised.identity.revision).toBe(second.identity.revision + 1);
    const changed = replaceMath3DProjectWorkspace(reopened, createMixedWorkspaceDocument({
      ...reopened.workspace, entries: reopened.workspace.entries.map(item =>
        item.expected.id === second.identity.id ?
          { ...item, checkpoint: revised, expected: revised.identity } : item) }));
    expect(changed.workspace.entries.find(item => item.expected.id === second.identity.id)!.expected.revision)
      .toBe(revised.identity.revision);
    expect(reviewProjectDerivedField(changed, idFor(reopened, "vector-dot"),
      document => document.source.field.kind === "expressions").status).toBe("stale");
    expect(() => compileProjectDerivedFieldEvaluator(changed,
      idFor(reopened, "vector-dot"))).toThrow(/stale/);
    expect(() => deriveFieldOutput(first.source && project.workspace.derivedFields![0]!.input.shape,
      { kind: "vector-dot" }, { ...project.workspace.derivedFields![0]!.input.shape,
        axes: project.workspace.derivedFields![0]!.input.shape.axes.map((axis, index) =>
          index === 0 ? { ...axis, unit: "cm" } : axis) })).toThrow(/frames/);
  });

  it("evaluates rotational vorticity, helicity and enstrophy with a work cap", () => {
    let project = load(); const prior = source(project);
    const rotational = reviseVectorField3DDocument(prior, { ...prior.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("-y", "m/s"),
        vectorField3DExpression("x", "m/s"),
        vectorField3DExpression("1", "m/s")] } });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, derivedFields: [], entries: project.workspace.entries.map(item =>
        item.expected.id === prior.identity.id ?
          { ...item, checkpoint: rotational, expected: rotational.identity } : item) }));
    for (const kind of ["vorticity", "helicity", "enstrophy"] as const)
      project = add(project, rotational.identity.id, { kind }, kind);
    const sample = (name: string) => compileProjectDerivedFieldEvaluator(project,
      idFor(project, name), 100).sample([.5, .25, 0]);
    expect((sample("vorticity") as number[])[2]).toBeCloseTo(2, 10);
    expect(sample("helicity")).toBeCloseTo(2, 10);
    expect(sample("enstrophy")).toBeCloseTo(2, 10);
    expect(() => compileProjectDerivedFieldEvaluator(project,
      idFor(project, "vorticity"), 1).sample([0, 0, 0])).toThrow(/cap/);
  });
});
