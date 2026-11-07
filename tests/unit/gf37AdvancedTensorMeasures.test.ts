import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { appendProjectDerivedField, compileProjectDerivedFieldEvaluator,
  createMixedWorkspaceDocument, evaluateAdvancedTensorMeasures,
  parseMath3DProject, replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  vectorField3DExpression, vectorFieldDerivedShape,
  type DerivedFieldShape, type VectorField3DDocument } from "@math3d/core";

const shape: DerivedFieldShape = { kind: "vector", unit: "m/s",
  componentUnits: ["m/s", "m/s", "m/s"],
  axes: ["x", "y", "z"].map((name, index) => ({ index: index as 0 | 1 | 2,
    name, unit: "m", min: -2, max: 2 })) };

describe("GF-37 advanced tensor validation gate", () => {
  it("matches a bounded numerical Jacobian from the existing analytic field evaluator", () => {
    const raw = readFileSync(new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
      import.meta.url), "utf8");
    let project = parseMath3DProject(raw);
    const first = project.workspace.entries.find(item => item.module === "vector3d")!
      .checkpoint as VectorField3DDocument;
    const rotating = reviseVectorField3DDocument(first, { ...first.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("-y", "m/s"),
        vectorField3DExpression("x", "m/s"),
        vectorField3DExpression("0", "m/s")] } });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, derivedFields: [], entries: project.workspace.entries.map(item =>
        item.expected.id === first.identity.id ?
          { ...item, checkpoint: rotating, expected: rotating.identity } : item) }));
    project = appendProjectDerivedField(project, rotating.identity.id,
      { kind: "vector-jacobian" }, { stableKey: "gf37-jacobian", title: "Jacobian" },
      source => source.source.field.kind === "expressions");
    const id = project.workspace.derivedFields![0]!.identity.id;
    const evaluator = compileProjectDerivedFieldEvaluator(project, id, 100);
    const jacobian = evaluator.sample([.3, -.2, .1]) as
      readonly (readonly [number, number, number])[];
    const result = evaluateAdvancedTensorMeasures(jacobian,
      vectorFieldDerivedShape(rotating));
    expect(result.qCriterion.value).toBeCloseTo(1, 8);
    expect(result.lambda2.value).toBeCloseTo(-1, 8);
    expect(result.swirlingStrength.value).toBeCloseTo(1, 8);
    expect(evaluator.evaluations()).toBeLessThanOrEqual(100);
  });
  it("matches rigid rotation, pure strain, frame reversal and physical units", () => {
    const rotation = evaluateAdvancedTensorMeasures([[0, -1, 0], [1, 0, 0],
      [0, 0, 0]], shape);
    expect(rotation.qCriterion.value).toBeCloseTo(1, 12);
    expect(rotation.lambda2.value).toBeCloseTo(-1, 12);
    expect(rotation.swirlingStrength.value).toBeCloseTo(1, 12);
    expect(rotation.lambda2.unit).toBe("m/s/m²");
    const reversed = evaluateAdvancedTensorMeasures([[0, 1, 0], [-1, 0, 0],
      [0, 0, 0]], shape);
    expect(reversed.qCriterion.value).toBeCloseTo(1, 12);
    expect(reversed.lambda2.value).toBeCloseTo(-1, 12);
    expect(reversed.swirlingStrength.value).toBeCloseTo(1, 12);
    const small = evaluateAdvancedTensorMeasures([[0, -1e-6, 0],
      [1e-6, 0, 0], [0, 0, 0]], shape);
    expect(small.swirlingStrength.value).toBeCloseTo(1e-6, 12);
    expect(small.lambda2.value).toBeCloseTo(-1e-12, 16);
    const strain = evaluateAdvancedTensorMeasures([[1, 0, 0], [0, -1, 0],
      [0, 0, 0]], shape);
    expect(strain.qCriterion.value).toBeCloseTo(-1, 12);
    expect(strain.lambda2.value).toBeCloseTo(1, 12);
    expect(strain.swirlingStrength.value).toBe(0);
    const rotatedStrain = evaluateAdvancedTensorMeasures([[1.5, -.5, 0],
      [-.5, 1.5, 0], [0, 0, 3]], shape);
    expect(rotatedStrain.qCriterion.value).toBeCloseTo(-7, 12);
    expect(rotatedStrain.lambda2.value).toBeCloseTo(4, 12);
    expect(rotatedStrain.swirlingStrength.value).toBe(0);
  });
  it("withholds ill-conditioned eigenvalues and rejects mixed frames or units", () => {
    const zero = evaluateAdvancedTensorMeasures([[0, 0, 0], [0, 0, 0],
      [0, 0, 0]], shape);
    expect(zero.swirlingStrength).toMatchObject({ status: "unavailable",
      value: null, reason: expect.stringContaining("ill-conditioned") });
    expect(() => evaluateAdvancedTensorMeasures([[0, 0, 0], [0, 0, 0],
      [0, 0, 0]], { ...shape, axes: shape.axes.map((axis, index) =>
        index === 1 ? { ...axis, unit: "cm" } : axis) })).toThrow(/frame/);
    expect(() => evaluateAdvancedTensorMeasures([[0, 0, 0], [0, 0, 0],
      [0, 0, 0]], { ...shape, componentUnits: ["m/s", "cm/s", "m/s"] }))
      .toThrow(/frame/);
    expect(() => evaluateAdvancedTensorMeasures([[NaN, 0, 0], [0, 0, 0],
      [0, 0, 0]], shape)).toThrow(/finite/);
  });
});
