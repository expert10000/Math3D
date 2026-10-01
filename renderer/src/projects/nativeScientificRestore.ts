import { parseComplexExpressionAst, type ComplexAnalysisDocument, type ComplexAnalysisStructuralSource, type TopologyDocument } from "@math3d/core";
import { compileComplexExpressionAstPreview } from "../math/complexExpr";
import type { ComplexPreviewMapSpec } from "../math/complexPreviewArtifacts";
import { buildQuotientPipeline, cloneFundamentalDiagram } from "../topology/quotientBuilder";
import type { FundamentalDiagram } from "../topology/types";

/** Check the native editor shape before any host state is changed. */
export const topologyEditorSeed = (document: TopologyDocument): FundamentalDiagram => {
  if (document.source.kind !== "fundamental-diagram") throw new TypeError("This Topology source needs a different editor adapter.");
  const model = document.source.model as unknown as FundamentalDiagram;
  const record = (value: unknown) => !!value && typeof value === "object" && !Array.isArray(value);
  if (typeof model.id !== "string" || typeof model.name !== "string" ||
      !Array.isArray(model.vertices) || !Array.isArray(model.edges) || !Array.isArray(model.faces) ||
      model.vertices.length > 4096 || model.edges.length > 8192 || model.faces.length > 4096 ||
      ![model.edgeOrientations, model.edgeLabels, model.edgePairings, model.vertexLabels, model.faceBoundaryWords].every(record) ||
      !model.vertices.every((v) => typeof v.id === "string" && Number.isFinite(v.x) && Number.isFinite(v.y)) ||
      !model.edges.every((e) => typeof e.id === "string" && typeof e.from === "string" && typeof e.to === "string") ||
      !model.faces.every((f) => typeof f.id === "string" && Array.isArray(f.boundary) && f.boundary.length <= 8192 && f.boundary.every((e) => typeof e.edgeId === "string" && (e.direction === 1 || e.direction === -1))) ||
      !Object.values(model.edgePairings).every((peers) => Array.isArray(peers) && peers.every((id) => typeof id === "string")))
    throw new TypeError("The saved Topology model is outside this editor's bounded diagram format.");
  const diagram = cloneFundamentalDiagram(model);
  // The pipeline may diagnose invalid mathematics; it must still accept the editor shape.
  buildQuotientPipeline(diagram);
  return diagram;
};

const complexSeed = (source: ComplexAnalysisStructuralSource): ComplexPreviewMapSpec => {
  if (source.parameters.length || source.covering || source.mobius || source.domain.exclusions.length ||
      source.sampling.strategy !== "uniform-grid" || source.sampling.columns > 256 || source.sampling.rows > 256 ||
      !["principal", "negative-real-axis", "positive-real-axis", "radial"].includes(source.branchPolicy.cut.kind) ||
      !compileComplexExpressionAstPreview(source.function.normalizedAst, source.function.allowedVariables).fn)
    throw new TypeError("This Complex source needs a different editor adapter.");
  return { inputMode: "fz", fExpr: source.function.sourceText, reExpr: "u", imExpr: "v",
    uMin: source.domain.re.min, uMax: source.domain.re.max, vMin: source.domain.im.min, vMax: source.domain.im.max,
    nu: source.sampling.columns, nv: source.sampling.rows, mapMode: "standard",
    sheetCount: source.branchPolicy.sheetCount, sheetIndex: source.branchPolicy.activeSheet,
    branchCutAngle: source.branchPolicy.cut.angleRadians ?? (source.branchPolicy.cut.kind === "positive-real-axis" ? 0 : Math.PI) };
};
export const complexEditorSeed = (document: ComplexAnalysisDocument) => complexSeed(document);

/** Change only fields represented by the editor. Opening a document is not an edit. */
export const complexSourceFromEditor = (saved: ComplexAnalysisDocument, spec: ComplexPreviewMapSpec): ComplexAnalysisStructuralSource => {
  const seed = complexSeed(saved);
  if (spec.nu > 256 || spec.nv > 256) throw new TypeError("This editor supports up to 256 samples per axis.");
  let fn = saved.function;
  const text = spec.inputMode === "fz" ? spec.fExpr : `(${spec.reExpr})+i*(${spec.imExpr})`;
  if (text !== seed.fExpr) {
    const parsed = parseComplexExpressionAst(text, ["z", "u", "v"]);
    if (!parsed.ast || parsed.error) throw new TypeError(parsed.error?.message ?? "Invalid complex expression.");
    fn = { sourceText: text, astVersion: 1, normalizedAst: parsed.ast, allowedVariables: ["z", "u", "v"] };
  }
  return { function: fn, parameters: saved.parameters, assumptions: saved.assumptions,
    domain: { ...saved.domain, re: { ...saved.domain.re, min: spec.uMin, max: spec.uMax }, im: { ...saved.domain.im, min: spec.vMin, max: spec.vMax } },
    sampling: { ...saved.sampling, columns: spec.nu, rows: spec.nv }, contours: saved.contours,
    branchPolicy: { ...saved.branchPolicy, sheetCount: spec.sheetCount, activeSheet: spec.sheetIndex,
      cut: spec.branchCutAngle === seed.branchCutAngle ? saved.branchPolicy.cut : { kind: "radial", angleRadians: spec.branchCutAngle, points: [] } },
    covering: saved.covering, mobius: saved.mobius };
};
export const scientificDocumentEditable = (document: TopologyDocument | ComplexAnalysisDocument) => {
  try { if (document.format === "math3d.topology-document") topologyEditorSeed(document); else complexEditorSeed(document); return true; } catch { return false; }
};
