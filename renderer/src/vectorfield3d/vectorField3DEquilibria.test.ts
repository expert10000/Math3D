import { describe, expect, it } from "vitest";
import { createVectorField3DDocument, parseVectorField3DDocument,
  reviseVectorField3DDocument,
  reviseVectorField3DWorkspace, searchVectorField3DEquilibria,
  serializeVectorField3DDocument, vectorField3DExpression,
  type VectorField3DSource } from "@math3d/core";

const axes = (["x", "y", "z"] as const).map(role =>
  ({ role, label: role, unit: "m", min: -2, max: 2 })) as VectorField3DSource["axes"];
const field = (components: readonly [string, string, string]) => createVectorField3DDocument({
  axes, timeUnit: "s", field: { kind: "expressions", components: components.map(source =>
    vectorField3DExpression(source, "m/s")) as unknown as
    Extract<VectorField3DSource["field"], { kind: "expressions" }>["components"] },
  seeds: [{ id: "center", position: [0, 0, 0] }],
  display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-7, relativeTolerance: 1e-7, maxSteps: 1000, maxTime: 2 },
}, { stableKey: components.join("|") });

describe("SCI-08 bounded equilibrium search", () => {
  it.each([
    [["x", "2*y", "3*z"], "source"],
    [["-x", "-2*y", "-3*z"], "sink"],
    [["x", "-2*y", "-3*z"], "saddle"],
    [["x*x", "y", "z"], "degenerate/uncertain"],
  ] as const)("classifies %s as %s without claiming completeness", (components, expected) => {
    const result = searchVectorField3DEquilibria(field(components));
    const center = result.candidates.find(item => Math.hypot(...item.position) < 1e-5);
    expect(center?.classification).toBe(expected);
    expect(center?.residual).toBeLessThan(1e-7);
    expect(result.status).toBe("bounded-incomplete");
    expect(result.diagnostics.join(" ")).toMatch(/unsampled equilibria/i);
    if (expected !== "degenerate/uncertain") {
      expect(center?.conditionEstimate).toBeGreaterThanOrEqual(1);
      expect(center?.eigenvalueRealParts).toHaveLength(3);
    }
  });

  it("reports a budget stop and never invents roots for a constant field", () => {
    const constant = searchVectorField3DEquilibria(field(["1", "0", "0"]), undefined,
      { maxEvaluations: 100 });
    expect(constant.status).toBe("budget-reached");
    expect(constant.candidates).toEqual([]);
    expect(constant.evaluations).toBe(100);
  });

  it("withholds a stability class at a domain-boundary equilibrium", () => {
    const result = searchVectorField3DEquilibria(field(["x+2", "y", "z"]));
    const edge = result.candidates.find(item => Math.abs(item.position[0] + 2) < 1e-5);
    expect(edge?.classification).toBe("degenerate/uncertain");
    expect(edge?.diagnostics.join(" ")).toMatch(/boundary/);
  });

  it("uses relative Jacobian conditioning for small but nonsingular fields", () => {
    const result = searchVectorField3DEquilibria(field([
      "0.00001*(x-0.3)", "0.00001*(y+0.2)", "0.00001*(z-0.1)"]));
    expect(result.candidates.some(item => Math.hypot(item.position[0] - 0.3,
      item.position[1] + 0.2, item.position[2] - 0.1) < 1e-4)).toBe(true);
  });

  it("round-trips linked constructions and marks their source revision", () => {
    const document = field(["x", "y", "z"]);
    const result = searchVectorField3DEquilibria(document);
    const candidate = result.candidates[0]!;
    const saved = reviseVectorField3DWorkspace(document, { ...document.workspace!,
      equilibriumConstructions: [{ id: "equilibrium-1", position: candidate.position,
        residual: candidate.residual, classification: candidate.classification,
        sourceRevision: result.source.revision,
        sourceStructuralHash: result.source.structuralHash, sourceHash: result.sourceHash }] });
    expect(parseVectorField3DDocument(serializeVectorField3DDocument(saved)).workspace
      ?.equilibriumConstructions[0]?.position).toEqual(candidate.position);
    const changed = reviseVectorField3DDocument(saved, { ...saved.source,
      seeds: [{ id: "different", position: [1, 1, 1] }] });
    expect(changed.workspace?.equilibriumConstructions[0]?.sourceStructuralHash)
      .not.toBe(changed.identity.structuralHash);
    const legacy = JSON.parse(serializeVectorField3DDocument(document));
    delete legacy.workspace.equilibriumConstructions;
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace?.equilibriumConstructions)
      .toEqual([]);
  });
});
