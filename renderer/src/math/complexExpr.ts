import {
  parseComplexExpressionAst,
  validateComplexExpressionAst,
  type ComplexExpressionAst,
  type ComplexExpressionDiagnostic,
  type ComplexExpressionVariable,
} from "@math3d/core";
import { C, abs, add, cos, div, exp, isFiniteC, log, mul, powReal, sin, sqrt, sub, tan, type Complex } from "./complex";

export type ComplexExprError = ComplexExpressionDiagnostic;
export type ComplexVars = { z?: Complex; u?: number; v?: number };
export type ComplexPreviewCompileResult = {
  fn?: (vars: ComplexVars) => Complex;
  ast?: ComplexExpressionAst;
  error?: ComplexExprError;
};

const FUNCTIONS: Record<Extract<ComplexExpressionAst, { type: "call" }>["name"], (value: Complex) => Complex> = {
  sin, cos, tan, exp, log, sqrt, abs: (value) => C(abs(value), 0),
};
const CONSTANTS: Record<Extract<ComplexExpressionAst, { type: "constant" }>["name"], Complex> = {
  i: C(0, 1), pi: C(Math.PI, 0), e: C(Math.E, 0),
};

const evaluate = (node: ComplexExpressionAst, vars: ComplexVars): Complex => {
  switch (node.type) {
    case "number": return C(node.value, 0);
    case "constant": return CONSTANTS[node.name];
    case "variable": return node.name === "z" ? vars.z ?? C() : C(node.name === "u" ? vars.u ?? 0 : vars.v ?? 0, 0);
    case "unary": {
      const value = evaluate(node.argument, vars);
      return C(-value.re, -value.im);
    }
    case "binary": {
      const left = evaluate(node.left, vars);
      const right = evaluate(node.right, vars);
      if (node.operator === "+") return add(left, right);
      if (node.operator === "-") return sub(left, right);
      if (node.operator === "*") return mul(left, right);
      if (node.operator === "/") return div(left, right);
      return Math.abs(right.im) <= 1e-10 ? powReal(left, right.re) : C(NaN, NaN);
    }
    case "call": return FUNCTIONS[node.name](evaluate(node.argument, vars));
  }
};

const astError = (message: string): ComplexExprError => ({ message, index: 0, line: 1, col: 1 });

/** Final preview-only stage. It compiles validated data, never executable input. */
export const compileComplexExpressionAstPreview = (
  ast: ComplexExpressionAst,
  allowedVariables: readonly ComplexExpressionVariable[] = ["z", "u", "v"]
): ComplexPreviewCompileResult => {
  const validation = validateComplexExpressionAst(ast, allowedVariables);
  if (!validation.ok) return { error: astError(validation.errors.join(" ")) };
  const fn = (vars: ComplexVars): Complex => {
    const value = evaluate(validation.value, vars);
    return isFiniteC(value) ? value : C(NaN, NaN);
  };
  return { ast: validation.value, fn };
};

/** Controlled parse -> normalized AST -> validation -> preview-compiler pipeline. */
export function compileComplexExpression(
  source: string,
  allowedVariables: ComplexExpressionVariable[] = ["z", "u", "v"]
): ComplexPreviewCompileResult {
  const parsed = parseComplexExpressionAst(source, allowedVariables);
  if (!parsed.ast || parsed.error) return { error: parsed.error };
  return compileComplexExpressionAstPreview(parsed.ast, allowedVariables);
}
