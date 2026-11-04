import { describe, expect, it } from "vitest";
import { analyzeQuadraticNumberField, buildSageAlgebraReconstructionInput,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, inspectProjectAlgebraFreshness, parseAlgebraObjectRecord,
  parseMath3DProject, parseSageAlgebraReconstructionResult, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [],
    artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-d01", title: "Quadratic field experiment" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
    revision: 1, label: "Q", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const k = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "K"),
    revision: 1, label: "K", definition: { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
      definingPolynomial: ["-5", "0", "1"], generator: "a" } });
  return { project, q, k };
};

describe("SAGE-D01 bounded number fields", () => {
  it("independently reopens Q(sqrt(5)) with exact ID, definition, hash and revision", () => {
    const { project, q, k } = setup();
    const saved = upsertMath3DProjectAlgebraObject(project, k);
    const copy = parseMath3DProject(serializeMath3DProject(saved));
    expect(copy.algebraObjects?.find((item) => item.id === k.id)?.revisions[0]).toEqual(k);
    expect(k.dependencies).toEqual([{ objectId: q.id, revision: 1 }]);
    expect(analyzeQuadraticNumberField(["-5", "0", "1"], "a")).toMatchObject({
      polynomialDiscriminant: "20", squarefreeRadicand: "5", fieldDiscriminant: "5",
      signature: [2, 0], powerBasis: ["1", "a"], integralBasis: ["1", "(1+a)/2"],
      embeddingImages: ["√5", "-√5"], ringOfIntegers: "Z[(1+√5)/2]",
    });
    expect(analyzeQuadraticNumberField(["1", "0", "1"], "i")).toMatchObject({
      squarefreeRadicand: "-1", fieldDiscriminant: "-4", signature: [0, 1],
      integralBasis: ["1", "i"], ringOfIntegers: "Z[√(-1)]",
    });
  });

  it("rejects reducible, malformed, wrong-parent and forged definitions", () => {
    const { project, q, k } = setup();
    const withPolynomial = (coefficients: readonly [string, string, "1"]) =>
      createAlgebraObjectRecord({ id: k.id, revision: 1, label: "K",
        definition: { kind: "number-field" as const, baseField: { objectId: q.id, revision: 1 },
          definingPolynomial: coefficients, generator: "a" } });
    expect(() => withPolynomial(["-4", "0", "1"])).toThrow(/reducible/);
    expect(() => withPolynomial(["-5", "01", "1"])).toThrow(/canonical integer/);
    expect(() => withPolynomial(["-5000", "0", "1"])).toThrow(/4096/);
    expect(() => createAlgebraObjectRecord({ id: k.id, revision: 1, label: "K",
      definition: { ...k.definition, generator: "a;print(1)" } })).toThrow(/identifier/);
    expect(() => parseAlgebraObjectRecord({ ...k, contentHash: `sha256:${"0".repeat(64)}` }))
      .toThrow(/contentHash/);
    const z = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Z"),
      revision: 1, label: "Z", definition: { kind: "integer-ring" } });
    const wrong = upsertMath3DProjectAlgebraObject(project, z);
    expect(() => upsertMath3DProjectAlgebraObject(wrong, createAlgebraObjectRecord({ id: k.id,
      revision: 1, label: "K", definition: { kind: "number-field",
        baseField: { objectId: z.id, revision: 1 }, definingPolynomial: ["-5", "0", "1"], generator: "a" } })))
      .toThrow(/pinned QQ base field/);
    expect(() => upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id: k.id,
      revision: 1, label: "K", definition: { kind: "number-field",
        baseField: { objectId: createProjectAlgebraObjectId(project.identity.id, "missing"), revision: 1 },
        definingPolynomial: ["-5", "0", "1"], generator: "a" } })))
      .toThrow(/Missing algebra parent/);
  });

  it("pins and checks a Sage reconstruction while preserving label-only base revisions", () => {
    const { project, q, k } = setup();
    const saved = upsertMath3DProjectAlgebraObject(project, k);
    const input = buildSageAlgebraReconstructionInput(saved, { objectId: k.id, revision: 1 });
    expect(input.objects.map((item) => item.id)).toEqual([q.id, k.id]);
    const result = { format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
      target: input.target, kind: "number-field", definitionHash: k.contentHash,
      text: "Number Field in a with defining polynomial x^2 - 5", latex: "", characteristic: "0", isField: true,
      numberField: { degree: 2, signature: [2, 0], polynomialDiscriminant: "20", fieldDiscriminant: "5",
        powerBasis: ["1", "a"], integralBasis: ["1/2*a + 1/2", "a"], embeddingCount: 2 } };
    expect(parseSageAlgebraReconstructionResult(result, input).numberField?.fieldDiscriminant).toBe("5");
    expect(() => parseSageAlgebraReconstructionResult({ ...result,
      numberField: { ...result.numberField, fieldDiscriminant: "20" } }, input)).toThrow(/differs/);
    const revisedQ = createAlgebraObjectRecord({ id: q.id, revision: 2, label: "Q2",
      definition: { kind: "rational-field" } });
    const advanced = upsertMath3DProjectAlgebraObject(saved, revisedQ);
    expect(inspectProjectAlgebraFreshness(advanced).find((item) => item.objectId === k.id)?.status).toBe("fresh");
    expect(parseMath3DProject(serializeMath3DProject(advanced)).algebraObjects
      ?.find((item) => item.id === k.id)?.revisions[0]).toEqual(k);
  });
});
