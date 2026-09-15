import { describe, expect, it } from "vitest";
import {
  COMPLEX_ANALYSIS_TRANSIENT_VIEW_FIELDS,
  adaptLegacyComplexAnalysisState,
  createComplexAnalysisDocument,
  deserializeComplexAnalysisDocument,
  normalizeComplexAnalysisDocument,
  serializeComplexAnalysisDocument,
  type ComplexAnalysisStructuralSource,
  type ComplexExpressionAst,
} from "@math3d/core";

const zAst: ComplexExpressionAst = { type: "binary", operator: "/", left: { type: "number", value: 1 }, right: { type: "variable", name: "z" } };
const source = (): ComplexAnalysisStructuralSource => ({
  function: { sourceText: "1/z", astVersion: 1, normalizedAst: zAst, allowedVariables: ["z"] },
  parameters: [{ name: "a", value: { re: 1, im: -2 } }],
  assumptions: [{ target: "z", predicate: "nonzero" }],
  domain: { re: { min: -3, max: 3 }, im: { min: -2, max: 2 }, exclusions: [{ re: 0, im: 0 }] },
  sampling: { strategy: "adaptive-grid", columns: 96, rows: 80, maximumSamples: 20_000, tolerance: 1e-8 },
  contours: [{ contourId: "unit-circle", kind: "circle", points: [], center: { re: 0, im: 0 }, radius: 1, innerRadius: null, closed: true, winding: 1 }],
  branchPolicy: { profile: "log", cut: { kind: "negative-real-axis", angleRadians: Math.PI, points: [] }, includeInfinity: true, sheetCount: 4, activeSheet: 2 },
  covering: { kind: "exp", degree: null, fiberWindow: 3, deckShift: 1 },
  mobius: { a: { re: 1, im: 0 }, b: { re: 0, im: 0 }, c: { re: 1, im: 0 }, d: { re: 1, im: 0 } },
});

describe("C02 ComplexAnalysisDocument", () => {
  it("round trips all mathematical and branch semantics with stable identity", () => {
    const document = createComplexAnalysisDocument(source(), { stableKey: "c02-round-trip" });
    const restored = deserializeComplexAnalysisDocument(serializeComplexAnalysisDocument(document));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value).toEqual(document);
    expect(restored.value.identity.structuralHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(restored.value.branchPolicy).toEqual(source().branchPolicy);
    expect(restored.value.contours).toEqual(source().contours);
    expect(Object.isFrozen(restored.value)).toBe(true);
  });

  it("rejects transient UI state and stale available result references", () => {
    const document = createComplexAnalysisDocument(source(), { stableKey: "c02-authority" });
    for (const field of COMPLEX_ANALYSIS_TRANSIENT_VIEW_FIELDS) {
      const rejected = normalizeComplexAnalysisDocument({ ...document, [field]: field === "animationProgress" ? 0.5 : "preview" });
      expect(rejected.ok, field).toBe(false);
      if (!rejected.ok) expect(rejected.errors.join(" ")).toContain(field);
    }
    const stale = normalizeComplexAnalysisDocument({ ...document, results: [{ resultId: "result:1", resultType: "complex.residue", sourceRevision: 99, sourceHash: document.identity.structuralHash, state: "available" }] });
    expect(stale.ok).toBe(false);
  });

  it("hashes mathematical state but excludes provenance and result references", () => {
    const first = createComplexAnalysisDocument(source(), { stableKey: "c02-hash" });
    const second = createComplexAnalysisDocument(source(), { id: first.identity.id, provenance: { ...first.provenance, diagnostics: [{ code: "note", severity: "info", message: "metadata", action: "none" }] }, results: [{ resultId: "result:missing", resultType: "complex.preview", sourceRevision: first.identity.revision, sourceHash: first.identity.structuralHash, state: "unavailable" }] });
    expect(second.identity.structuralHash).toBe(first.identity.structuralHash);
  });

  it("adapts controlled legacy lab state through an AST parser and omits view state", () => {
    const adapted = adaptLegacyComplexAnalysisState({ complexMapSpec: { fExpr: "1/z", uMin: -4, uMax: 4, vMin: -3, vMax: 3, nu: 40, nv: 30, sheetCount: 2, sheetIndex: 1 }, panelLayout: "four_pane", animationProgress: 0.75 }, () => ({ ok: true, value: zAst }), "legacy-fixture");
    expect(adapted.document?.domain).toEqual({ re: { min: -4, max: 4 }, im: { min: -3, max: 3 }, exclusions: [] });
    expect(adapted.document?.branchPolicy).toMatchObject({ sheetCount: 2, activeSheet: 1 });
    expect(adapted.document?.provenance.origin).toBe("legacy-adapter");
    expect(adapted.document).not.toHaveProperty("panelLayout");
    expect(adapted.document).not.toHaveProperty("animationProgress");
  });

  it("emits a clear diagnostic instead of persisting raw text or compiled functions", () => {
    for (const legacy of ["1/z", { compiledFunction: () => 1 }]) {
      const adapted = adaptLegacyComplexAnalysisState(legacy, () => ({ ok: true, value: zAst }));
      expect(adapted.document).toBeUndefined();
      expect(adapted.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "complex.legacy.unsupported", severity: "error" })]));
    }
  });
});
