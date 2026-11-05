import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendProjectDerivedField, compileProjectDerivedFieldEvaluator,
  createMixedWorkspaceDocument, deriveFieldOutput, parseMath3DProject,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  reviewProjectDerivedField, serializeMath3DProject,
  vectorField3DExpression, verifiedVectorFieldSampler,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../fixtures/graph-field/gf23Bundle";

const analytic = () => {
  let project = parseMath3DProject(readFileSync(new URL(
    "../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url), "utf8"));
  const original = project.workspace.entries.find(item => item.module === "vector3d")!
    .checkpoint as VectorField3DDocument;
  const field = reviseVectorField3DDocument(original, { ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("-y", "m/s"),
      vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("0", "m/s")] } });
  project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
    ...project.workspace, derivedFields: [], entries: project.workspace.entries.map(item =>
      item.expected.id === original.identity.id ?
        { ...item, checkpoint: field, expected: field.identity } : item) }));
  return { project, field };
};
const add = (project: Math3DProject, field: VectorField3DDocument,
  kind: "q-criterion" | "lambda2" | "swirling-strength") =>
  appendProjectDerivedField(project, field.identity.id, { kind },
    { stableKey: `gf38-${kind}`, title: kind },
    source => source.source.field.kind === "expressions");

describe("GF-38 saved tensor measures", () => {
  it("round trips three guarded recipes with correct units, bounds and source generations", () => {
    let { project, field } = analytic();
    for (const kind of ["q-criterion", "lambda2", "swirling-strength"] as const)
      project = add(project, field, kind);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const values = reopened.workspace.derivedFields!.map(item => {
      const evaluator = compileProjectDerivedFieldEvaluator(reopened, item.identity.id, 100);
      const value = evaluator.sampleDetailed([.4, -.2, 0]);
      expect(evaluator.evaluations()).toBeLessThanOrEqual(100);
      expect(evaluator.sampleDetailed([100, 0, 0])).toMatchObject({ status: "unavailable",
        reason: expect.stringContaining("coverage") });
      return { kind: item.operation.kind, unit: item.output.unit,
        value: value.status === "value" ? value.value : null };
    });
    expect(values.map(item => [item.kind, item.unit])).toEqual([
      ["q-criterion", "m/s/m²"], ["lambda2", "m/s/m²"],
      ["swirling-strength", "m/s/m"]]);
    expect(values[0]!.value).toBeCloseTo(1, 8);
    expect(values[1]!.value).toBeCloseTo(-1, 8);
    expect(values[2]!.value).toBeCloseTo(1, 8);
    const changed = reviseVectorField3DDocument(field, { ...field.source,
      display: { ...field.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened, createMixedWorkspaceDocument({
      ...reopened.workspace, entries: reopened.workspace.entries.map(item =>
        item.expected.id === field.identity.id ?
          { ...item, checkpoint: changed, expected: changed.identity } : item) }));
    const id = reopened.workspace.derivedFields![0]!.identity.id;
    expect(reviewProjectDerivedField(stale, id, () => true).status).toBe("stale");
    expect(() => compileProjectDerivedFieldEvaluator(stale, id)).toThrow(/stale/);
    expect(() => deriveFieldOutput({ ...reopened.workspace.derivedFields![0]!.input.shape,
      axes: reopened.workspace.derivedFields![0]!.input.shape.axes.map((axis, index) =>
        index === 1 ? { ...axis, unit: "cm" } : axis) },
      { kind: "lambda2" })).toThrow(/units/);
  });

  it("requires verified scientific transfer coverage and withholds ill-conditioned swirl", () => {
    let project = createGf23Project();
    const source = project.workspace.entries[0]!.checkpoint as VectorField3DDocument;
    const transfer = gf23Transfer();
    project = appendProjectDerivedField(project, source.identity.id,
      { kind: "q-criterion" }, { stableKey: "gf38-bundle", title: "Bundle Q" },
      document => { verifiedVectorFieldSampler(document, transfer); return true; });
    const id = project.workspace.derivedFields!.at(-1)!.identity.id;
    expect(() => compileProjectDerivedFieldEvaluator(project, id, 100))
      .toThrow(/unverified/);
    const evaluator = compileProjectDerivedFieldEvaluator(project, id, 100,
      new Map([[source.identity.id, transfer]]));
    expect(evaluator.sampleDetailed([1, 0, 0]).status).toBe("value");
    expect(evaluator.sampleDetailed([100, 0, 0]).status).toBe("unavailable");
    expect(evaluator.evaluations()).toBeLessThanOrEqual(100);
    const { project: base, field } = analytic();
    const zero = reviseVectorField3DDocument(field, { ...field.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("0", "m/s"),
        vectorField3DExpression("0", "m/s"),
        vectorField3DExpression("0", "m/s")] } });
    const quiet = replaceMath3DProjectWorkspace(base, createMixedWorkspaceDocument({
      ...base.workspace, entries: base.workspace.entries.map(item =>
        item.expected.id === field.identity.id ?
          { ...item, checkpoint: zero, expected: zero.identity } : item) }));
    const saved = add(quiet, zero, "swirling-strength");
    expect(compileProjectDerivedFieldEvaluator(saved,
      saved.workspace.derivedFields![0]!.identity.id, 100).sampleDetailed([0, 0, 0]))
      .toMatchObject({ status: "unavailable",
        reason: expect.stringContaining("ill-conditioned") });
  });
});
