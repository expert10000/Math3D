import { evaluateGraph2DExpression, parseComplexExpressionAst, parseGraph2DExpression,
  type ComplexExpressionAst, type Graph2DExpressionAst } from "@math3d/core";
import { compileComplexExpressionAstPreview } from "./complexExpr";
import { C, type Complex } from "./complex";
import { compileExpression, type RealExpressionAst } from "./expression";

/** Existing module grammars remain distinct; every editor receives the same scoped result. */
export type MathExpressionProfile = "graph" | "real" | "complex";
export type MathExpressionAst =
  | Readonly<{ profile: "graph"; tree: Graph2DExpressionAst }>
  | Readonly<{ profile: "real"; tree: RealExpressionAst }>
  | Readonly<{ profile: "complex"; tree: ComplexExpressionAst }>;
export type MathExpressionDiagnostic = Readonly<{
  kind: "syntax" | "scope" | "limit" | "domain";
  message: string;
  start: number;
  end: number;
}>;
export type MathExpressionValue = number | Complex;
export type MathExpressionResult = Readonly<{
  ast?: MathExpressionAst;
  error?: MathExpressionDiagnostic;
  evaluate?: (bindings: Readonly<Record<string, number | Complex>>) =>
    Readonly<{ value?: MathExpressionValue; error?: MathExpressionDiagnostic }>;
}>;

const issue = (kind: MathExpressionDiagnostic["kind"], message: string, start = 0, end = start + 1): MathExpressionDiagnostic =>
  ({ kind, message, start, end });
const allowedName = /^[a-z][a-z0-9_]{0,31}$/;

/** Parse once; the returned evaluator reuses that AST for all preview samples. */
export function prepareMathExpression(source: string, profile: MathExpressionProfile,
  variables: readonly string[]): MathExpressionResult {
  if (variables.length > 17 || new Set(variables).size !== variables.length || variables.some(name => !allowedName.test(name)))
    return { error: issue("scope", "Invalid variable scope.") };
  if (profile === "complex" && variables.some(name => !["z", "u", "v"].includes(name)))
    return { error: issue("scope", "Complex expressions support z, u, and v.") };
  if (profile === "graph") {
    const parsed = parseGraph2DExpression(source, variables);
    if (!parsed.ok) {
      const diagnostic = parsed.diagnostics[0]!;
      return { error: issue(diagnostic.code === "limit" ? "limit" : diagnostic.code === "unknown-symbol" ? "scope" : "syntax",
        diagnostic.message, diagnostic.span.start, diagnostic.span.end) };
    }
    return { ast: { profile, tree: parsed.ast }, evaluate: bindings => {
      const values: Record<string, number> = {};
      for (const name of variables) {
        const value = bindings[name];
        if (typeof value !== "number" || !Number.isFinite(value)) return { error: issue("scope", `No finite value for '${name}'.`) };
        values[name] = value;
      }
      const result = evaluateGraph2DExpression(parsed.ast, values, { maxEvaluations: 4_096, deadlineMs: Date.now() + 50 });
      return result.ok ? { value: result.value } : { error: issue(result.diagnostic.code === "limit" ? "limit" :
        result.diagnostic.code === "unknown-symbol" ? "scope" : "domain", result.diagnostic.message,
        result.diagnostic.span.start, result.diagnostic.span.end) };
    } };
  }
  if (profile === "complex") {
    const scoped = variables as Array<"z" | "u" | "v">;
    const parsed = parseComplexExpressionAst(source, scoped);
    if (!parsed.ast || parsed.error) {
      const message = parsed.error?.message ?? "Invalid complex expression.";
      return { error: issue(message.includes("Unknown identifier") ? "scope" : message.includes("exceeds") ? "limit" : "syntax",
        message, parsed.error?.index ?? 0) };
    }
    const compiled = compileComplexExpressionAstPreview(parsed.ast, scoped);
    if (!compiled.fn) return { error: issue("syntax", compiled.error?.message ?? "Invalid complex expression.") };
    return { ast: { profile, tree: parsed.ast }, evaluate: bindings => {
      for (const name of variables) if (!(name in bindings)) return { error: issue("scope", `No value for '${name}'.`) };
      const z = bindings.z;
      const value = compiled.fn!({ z: typeof z === "number" ? C(z, 0) : z,
        u: typeof bindings.u === "number" ? bindings.u : undefined,
        v: typeof bindings.v === "number" ? bindings.v : undefined });
      return Number.isFinite(value.re) && Number.isFinite(value.im) ? { value } :
        { error: issue("domain", "The expression is singular or undefined at this point.") };
    } };
  }
  const compiled = compileExpression(source, [...variables]);
  if (!compiled.fn || !compiled.ast) return { error: issue(compiled.error?.message.includes("too many") ||
    compiled.error?.message.includes("exceeds") ? "limit" : compiled.error?.message.includes("Unknown identifier") ? "scope" : "syntax",
    compiled.error?.message ?? "Invalid expression.",
    compiled.error?.index ?? 0) };
  return { ast: { profile, tree: compiled.ast }, evaluate: bindings => {
    const values: Record<string, number> = {};
    for (const name of variables) {
      const value = bindings[name];
      if (typeof value !== "number" || !Number.isFinite(value)) return { error: issue("scope", `No finite value for '${name}'.`) };
      values[name] = value;
    }
    const value = compiled.fn!(values);
    return Number.isFinite(value) ? { value } : { error: issue("domain", "The expression is singular or undefined at this point.") };
  } };
}

export function previewMathExpression(source: string, profile: MathExpressionProfile, variables: readonly string[],
  bindings: Readonly<Record<string, number | Complex>> = {}) {
  const start = performance.now();
  const prepared = prepareMathExpression(source, profile, variables);
  const sample = Object.fromEntries(variables.map(name => [name, bindings[name] ?? (name === "z" ? C(0.5, 0.5) : 0.5)]));
  const evaluated = prepared.evaluate?.(sample);
  return { ...prepared, sample, value: evaluated?.value, sampleError: evaluated?.error,
    durationMs: performance.now() - start };
}
