import { describe, expect, it } from "vitest";
import { COMPLEX_COMMAND_TYPES, createComplexAnalysisDocument, parseComplexExpressionAst, type ComplexAnalysisStructuralSource } from "@math3d/core";
import { ComplexAnalysisCommandAdapter } from "./complexCommandAdapter";

const ast = (source: string) => parseComplexExpressionAst(source, ["z"]).ast!;
const source = (): ComplexAnalysisStructuralSource => ({
  function: { sourceText: "z", astVersion: 1, normalizedAst: ast("z"), allowedVariables: ["z"] }, parameters: [], assumptions: [],
  domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
  sampling: { strategy: "uniform-grid", columns: 32, rows: 32, maximumSamples: 4096, tolerance: 1e-8 }, contours: [],
  branchPolicy: { profile: "none", cut: { kind: "principal", angleRadians: Math.PI, points: [] }, includeInfinity: false, sheetCount: 1, activeSheet: 0 },
  covering: null, mobius: null,
});

describe("C04 Complex command adapter", () => {
  it("keeps typing transient until an intentional function commit", () => {
    const adapter = new ComplexAnalysisCommandAdapter(createComplexAnalysisDocument(source(), { stableKey: "c04-preview" }));
    const preview = adapter.previewFunction("1/z");
    expect(preview.fn).toBeTypeOf("function");
    expect(adapter.document().function.sourceText).toBe("z");
    expect(adapter.history().undoDepth).toBe(0);
    adapter.commitFunction("1/z");
    expect(adapter.document().function.sourceText).toBe("1/z");
    expect(adapter.document().identity.revision).toBe(2);
    expect(adapter.history().undoDepth).toBe(1);
  });

  it("routes every semantic lab family through commands in migration order", () => {
    const initial = createComplexAnalysisDocument(source(), { stableKey: "c04-all" });
    const adapter = new ComplexAnalysisCommandAdapter(initial);
    const next: ComplexAnalysisStructuralSource = {
      ...source(), function: { sourceText: "sqrt(z)", astVersion: 1, normalizedAst: ast("sqrt(z)"), allowedVariables: ["z"] },
      parameters: [{ name: "a", value: { re: 1, im: 0 } }],
      domain: { re: { min: -4, max: 4 }, im: { min: -3, max: 3 }, exclusions: [{ re: 0, im: 0 }] },
      sampling: { strategy: "adaptive-grid", columns: 48, rows: 40, maximumSamples: 4096, tolerance: 1e-7 },
      contours: [{ contourId: "path:1", kind: "branch-loop", points: [], center: { re: 0, im: 0 }, radius: 1, innerRadius: null, closed: true, winding: 1 }],
      branchPolicy: { profile: "sqrt", cut: { kind: "negative-real-axis", angleRadians: Math.PI, points: [] }, includeInfinity: true, sheetCount: 2, activeSheet: 1 },
      covering: { kind: "sqrt-inverse", degree: 2, fiberWindow: 2, deckShift: 1 },
      mobius: { a: { re: 1, im: 0 }, b: { re: 1, im: 0 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } },
    };
    const committed = adapter.commitCandidate(next);
    expect(committed.identity.revision).toBe(initial.identity.revision + 8);
    expect(committed).toMatchObject(next);
    expect(adapter.history().undoDepth).toBe(8);
  });

  it("produces identical canonical documents for GUI and imported commands", () => {
    const initial = createComplexAnalysisDocument(source(), { stableKey: "c04-parity" });
    const gui = new ComplexAnalysisCommandAdapter(initial);
    const imported = new ComplexAnalysisCommandAdapter(initial);
    const domain = { re: { min: -5, max: 5 }, im: { min: -1, max: 1 }, exclusions: [] };
    gui.commit(COMPLEX_COMMAND_TYPES.setDomain, domain);
    imported.commit(COMPLEX_COMMAND_TYPES.setDomain, domain, { kind: "import", sourceId: "complex-command-file" });
    expect(imported.document()).toEqual(gui.document());
  });

  it("stales prior results and clears dependent intents on every source change", () => {
    const plain = createComplexAnalysisDocument(source(), { stableKey: "c04-stale" });
    const withResult = createComplexAnalysisDocument(source(), { id: plain.identity.id, results: [{ resultId: "residue:1", resultType: "complex.residue", sourceRevision: plain.identity.revision, sourceHash: plain.identity.structuralHash, state: "available" }] });
    const adapter = new ComplexAnalysisCommandAdapter(withResult);
    adapter.commitSelection({ space: "riemann-sphere", point: { re: 1, im: 0 }, entityId: "sphere:point" });
    adapter.requestAnalysis("request:1", "complex.residue");
    adapter.commit(COMPLEX_COMMAND_TYPES.setParameters, [{ name: "a", value: { re: 2, im: 0 } }]);
    expect(adapter.document().results[0]?.state).toBe("unavailable");
    expect(adapter.state()).toMatchObject({ committedSelection: null, analysisRequest: null, valueSurfaceRequest: null });
  });

  it("binds selection, analysis, and 3D handoff requests to the current revision", () => {
    const adapter = new ComplexAnalysisCommandAdapter(createComplexAnalysisDocument(source(), { stableKey: "c04-intents" }));
    const selected = adapter.commitSelection({ space: "z-plane", point: { re: 0.5, im: -0.25 }, entityId: null });
    expect(selected.committedSelection?.space).toBe("z-plane");
    expect(adapter.requestAnalysis("request:analysis", "complex.contour").analysisRequest).toMatchObject({ sourceRevision: 1, requestType: "complex.contour" });
    expect(adapter.requestValueSurface("request:mesh", "arg", "full").valueSurfaceRequest).toMatchObject({ sourceRevision: 1, quantity: "arg", quality: "full" });
  });
});
