import { createComplexAnalysisDocument, parseComplexExpressionAst } from "@math3d/core";

export const acceptanceComplexDocument = (sourceText = "z*z") => {
  const ast = parseComplexExpressionAst(sourceText, ["z"]).ast;
  if (!ast) throw new Error("Acceptance expression must parse.");
  return createComplexAnalysisDocument({ function: { sourceText, astVersion: 1, normalizedAst: ast, allowedVariables: ["z"] },
    parameters: [], assumptions: [], domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
    sampling: { strategy: "uniform-grid", columns: 16, rows: 16, maximumSamples: 256, tolerance: 1e-10 }, contours: [],
    branchPolicy: { profile: "principal", cut: { kind: "principal", angleRadians: Math.PI, points: [] }, includeInfinity: false, sheetCount: 1, activeSheet: 0 }, covering: null, mobius: null,
  }, { stableKey: `acceptance-complex/${sourceText}` });
};

