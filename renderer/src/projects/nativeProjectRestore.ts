import { type CurveDocument, type CurveDocumentSource, type SurfaceDocument, type SurfaceDocumentSource } from "@math3d/core";
import { compileExpression } from "../math/expression";

const renameParameter = (expression: string, from: string, to: string) => expression.replace(/[A-Za-z_][A-Za-z_0-9]*/g, (word) => word === from ? to : word);
const expression = (value: string | undefined, variables: string[]) => {
  if (!value || !compileExpression(value, variables).fn) throw new TypeError("A saved expression cannot be restored by this editor.");
  return value;
};
export const curveEditorSeed = (document: CurveDocument) => {
  const source = document.source;
  if (!["parametric", "explicit"].includes(source.representation) || !Array.isArray(source.dependencies) || source.dependencies.length || source.definition.sourceIds?.length)
    throw new TypeError("This Curve source needs a different editor adapter.");
  const parameter = source.domain.parameter;
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(parameter)) throw new TypeError("Unsupported Curve parameter.");
  const formulas = source.definition.expressions ?? {};
  const explicitFormula = !formulas.x && source.representation === "explicit";
  const x = explicitFormula ? parameter : formulas.x;
  const y = explicitFormula ? renameParameter(formulas.formula ?? "", formulas.independentVariable ?? parameter, parameter) : formulas.y;
  const project = (value: string | undefined) => expression(renameParameter(value ?? "", parameter, "t"), ["t"]);
  return { dimension: source.dimension, parameter, explicitFormula, x: project(x), y: project(y), z: source.dimension === 3 ? project(formulas.z) : "0",
    min: source.domain.min, max: source.domain.max, closed: source.domain.closed };
};
export const curveSourceFromEditor = (saved: CurveDocumentSource, formulas: { x: string; y: string; z?: string }, domain: { tMin: number; tMax: number; closed?: boolean }): CurveDocumentSource => {
  const parameter = saved.domain.parameter;
  const raw = saved.definition.expressions ?? {};
  const explicitFormula = !raw.x && saved.representation === "explicit";
  const seed = { parameter, explicitFormula, x: renameParameter(explicitFormula ? parameter : raw.x ?? "", parameter, "t"), y: renameParameter(explicitFormula ? raw.formula ?? "" : raw.y ?? "", explicitFormula ? raw.independentVariable ?? parameter : parameter, "t"), z: renameParameter(raw.z ?? "0", parameter, "t") };
  const expressions = { ...saved.definition.expressions };
  const restore = (value: string) => renameParameter(value, "t", seed.parameter);
  if (formulas.x !== seed.x && seed.explicitFormula) return { ...saved, representation: "parametric", domain: { ...saved.domain, min: domain.tMin, max: domain.tMax, closed: domain.closed ?? saved.domain.closed }, definition: { ...saved.definition, expressions: { x: restore(formulas.x), y: restore(formulas.y), ...(saved.dimension === 3 ? { z: restore(formulas.z ?? "0") } : {}) } } };
  if (seed.explicitFormula) { if (formulas.y !== seed.y) expressions.formula = renameParameter(formulas.y, "t", raw.independentVariable ?? seed.parameter); }
  else {
    if (formulas.x !== seed.x) expressions.x = restore(formulas.x);
    if (formulas.y !== seed.y) expressions.y = restore(formulas.y);
    if (saved.dimension === 3 && formulas.z !== seed.z) expressions.z = restore(formulas.z ?? "0");
  }
  return { ...saved, domain: { ...saved.domain, min: domain.tMin, max: domain.tMax, closed: domain.closed ?? saved.domain.closed },
    definition: { ...saved.definition, expressions } };
};
export const surfaceEditorSeed = (document: SurfaceDocument) => {
  const source = document.source;
  if (source.representation !== "parametric" || source.definition.sourceIds?.length || source.definition.meshId)
    throw new TypeError("This Surface source needs a different editor adapter.");
  const domain = source.domain as { kind?: string; u?: { min: number; max: number; periodic?: boolean }; v?: { min: number; max: number; periodic?: boolean } };
  if (domain?.kind !== "parameter" || !domain.u || !domain.v || domain.u.periodic || domain.v.periodic || ![domain.u.min, domain.u.max, domain.v.min, domain.v.max].every(Number.isFinite) || domain.u.max <= domain.u.min || domain.v.max <= domain.v.min)
    throw new TypeError("Only nonperiodic parameter domains can be restored by this Surface adapter.");
  const formulas = source.definition.expressions ?? {};
  return { x: expression(formulas.x, ["u", "v"]), y: expression(formulas.y, ["u", "v"]), z: expression(formulas.z, ["u", "v"]),
    uMin: domain.u.min, uMax: domain.u.max, vMin: domain.v.min, vMax: domain.v.max };
};
export const surfaceSourceFromEditor = (saved: SurfaceDocumentSource, formulas: { x: string; y: string; z: string }, domain: { uMin: number; uMax: number; vMin: number; vMax: number }): SurfaceDocumentSource => {
  const seed = saved.definition.expressions ?? {};
  const sourceDomain = saved.domain as { kind: string; u: Record<string, any>; v: Record<string, any> };
  const expressions = { ...saved.definition.expressions };
  for (const key of ["x", "y", "z"] as const) if (formulas[key] !== seed[key]) expressions[key] = formulas[key];
  return { ...saved, domain: { ...sourceDomain, u: { ...sourceDomain.u, min: domain.uMin, max: domain.uMax }, v: { ...sourceDomain.v, min: domain.vMin, max: domain.vMax } },
    definition: { ...saved.definition, expressions } };
};
export const nativeDocumentEditable = (document: CurveDocument | SurfaceDocument) => {
  try { if (document.format === "math3d.curve-document") curveEditorSeed(document); else surfaceEditorSeed(document); return true; } catch { return false; }
};
