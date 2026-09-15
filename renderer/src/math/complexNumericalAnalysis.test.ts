import { describe, expect, it } from "vitest";
import { createComplexAnalysisDocument, parseComplexExpressionAst } from "@math3d/core";
import { contourRecordFromPoints, publishComplexNumericalAnalysis, qualifyLegacyComplexNumericalValues } from "./complexNumericalAnalysis";

const documentFor = (sourceText: string) => {
  const parsed = parseComplexExpressionAst(sourceText, ["z"]);
  if (!parsed.ast) throw new Error(parsed.error?.message);
  const points = Array.from({ length: 129 }, (_, index) => {
    const angle = 2 * Math.PI * index / 128;
    return { re: 1.5 * Math.cos(angle), im: 1.5 * Math.sin(angle) };
  });
  return createComplexAnalysisDocument({
    function: { sourceText, astVersion: 1, normalizedAst: parsed.ast, allowedVariables: ["z"] },
    parameters: [], assumptions: [],
    domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
    sampling: { strategy: "adaptive-grid", columns: 64, rows: 64, maximumSamples: 4096, tolerance: 1e-7 },
    contours: [contourRecordFromPoints("unit-circle", "circle", points)],
    branchPolicy: { profile: "principal", cut: { kind: "negative-real-axis", angleRadians: Math.PI, points: [] }, includeInfinity: false, sheetCount: 1, activeSheet: 0 },
    covering: null, mobius: null,
  }, { stableKey: `numerical-${sourceText}` });
};

describe("C06 numerical Complex result publication", () => {
  it("publishes revision-bound numerical evidence with tolerance, samples, and error", () => {
    const document = documentFor("1/z");
    const result = publishComplexNumericalAnalysis({ document, probe: { re: 1, im: 0 }, now: 10 });
    expect(result.status).toBe("numerical");
    expect(result.provenance.source).toMatchObject({ revision: document.identity.revision, structuralHash: document.identity.structuralHash });
    expect(result.provenance.numericContext?.tolerance?.absolute).toBe(1e-7);
    expect(result.summary.evidence).toBe("numerical-not-proof");
    expect((result.summary.contour as { samples: number }).samples).toBeGreaterThan(128);
    expect((result.summary.contour as { errorEstimate: number }).errorEstimate).toBeLessThan(0.01);
    expect((result.summary.poleCandidates as unknown[]).length).toBe(1);
  });

  it("reports branch-cut crossings and near-pole instability without upgrading status", () => {
    const document = documentFor("1/z");
    const result = publishComplexNumericalAnalysis({ document, tolerance: 0.01, now: 10 });
    expect(result.status).toBe("numerical");
    expect(result.diagnostics.some((entry) => entry.code === "complex.branch-cut-crossing")).toBe(true);
    expect(result.diagnostics.some((entry) => entry.code === "complex.near-pole")).toBe(false);
  });

  it("marks old inline values as legacy-limited instead of exact evidence", () => {
    expect(qualifyLegacyComplexNumericalValues({ integral: { re: 0, im: 6.28 } })).toMatchObject({
      kind: "legacy-limited",
      reason: "missing-provenance",
    });
  });
});
