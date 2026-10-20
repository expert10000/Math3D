import { canonicalJsonStringify, structuralHash, type CanonicalJsonValue } from "./documentIdentity";
import { parseGraph2DExpression, evaluateGraph2DExpression, formatGraph2DExpressionAst,
  GRAPH2D_FUNCTIONS, type Graph2DExpressionAst, type Graph2DExpressionNode } from "./mathExpressionRealAst";
import { compileExpression, type RealExpressionAst } from "./mathExpressionLegacyReal";
import { parseComplexExpressionAst,
  COMPLEX_EXPRESSION_CONSTANTS, COMPLEX_EXPRESSION_FUNCTIONS, COMPLEX_EXPRESSION_PARSER_VERSION,
  type ComplexExpressionVariable } from "./complexExpressionAst";
import { compileComplexExpressionAstPreview } from "./complexExpressionEvaluation";
import { C, type Complex } from "./complexArithmetic";
import type { ComplexExpressionAst } from "./complexAnalysisDocument";
import { differentiateGraph2DExpression } from "./graph2dDerivatives";

export const MATH_EXPRESSION_SERVICE_VERSION = 1 as const;
export type MathExpressionProfile = "graph" | "real" | "complex";
/** Span-free common mathematical tree. Profile and scope carry dialect-specific meaning. */
export type MathExpressionNode =
  | Readonly<{ kind: "number"; value: number }>
  | Readonly<{ kind: "symbol"; name: string }>
  | Readonly<{ kind: "unary"; operator: "-"; operand: MathExpressionNode }>
  | Readonly<{ kind: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: MathExpressionNode; right: MathExpressionNode }>
  | Readonly<{ kind: "call"; name: string; arguments: readonly MathExpressionNode[] }>;
export type MathExpressionAst =
  | Readonly<{ version: 1; profile: "graph"; tree: Graph2DExpressionAst; normalized: MathExpressionNode; source: string; scope: readonly string[]; parserVersion: string }>
  | Readonly<{ version: 1; profile: "real"; tree: RealExpressionAst; normalized: MathExpressionNode; source: string; scope: readonly string[]; parserVersion: string }>
  | Readonly<{ version: 1; profile: "complex"; tree: ComplexExpressionAst; normalized: MathExpressionNode; source: string; scope: readonly string[]; parserVersion: string }>;
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
export type MathExpressionSymbolTable = Readonly<{
  variables: readonly string[];
  constants: readonly string[];
  functions: readonly string[];
}>;

const issue = (kind: MathExpressionDiagnostic["kind"], message: string, start = 0, end = start + 1): MathExpressionDiagnostic =>
  ({ kind, message, start, end });
const allowedName = /^[a-z][a-z0-9_]{0,31}$/;
const REAL_FUNCTIONS = ["sin", "cos", "tan", "sinh", "cosh", "tanh", "asin", "acos", "atan", "sqrt", "abs", "log", "exp", "min", "max"] as const;

const normalizeGraph = (node: Graph2DExpressionNode): MathExpressionNode => {
  switch (node.kind) {
    case "number": return { kind: "number", value: node.value };
    case "symbol": return { kind: "symbol", name: node.name };
    case "unary": return node.operator === "+" ? normalizeGraph(node.operand) :
      { kind: "unary", operator: "-", operand: normalizeGraph(node.operand) };
    case "binary": return { kind: "binary", operator: node.operator, left: normalizeGraph(node.left), right: normalizeGraph(node.right) };
    case "call": return { kind: "call", name: node.functionName, arguments: [normalizeGraph(node.argument)] };
  }
};
const normalizeComplex = (node: ComplexExpressionAst): MathExpressionNode => {
  switch (node.type) {
    case "number": return { kind: "number", value: node.value };
    case "constant": case "variable": return { kind: "symbol", name: node.name };
    case "unary": return { kind: "unary", operator: "-", operand: normalizeComplex(node.argument) };
    case "binary": return { kind: "binary", operator: node.operator,
      left: normalizeComplex(node.left), right: normalizeComplex(node.right) };
    case "call": return { kind: "call", name: node.name, arguments: [normalizeComplex(node.argument)] };
  }
};
const normalizeReal = (ast: RealExpressionAst): MathExpressionNode => {
  const stack: MathExpressionNode[] = [];
  for (const instruction of ast.instructions) {
    if (instruction.t === "num") stack.push({ kind: "number", value: instruction.v });
    else if (instruction.t === "var") stack.push({ kind: "symbol", name: instruction.name });
    else if (instruction.t === "op" && instruction.op === "neg") {
      stack.push({ kind: "unary", operator: "-", operand: stack.pop()! });
    } else if (instruction.t === "op") {
      const right = stack.pop()!, left = stack.pop()!;
      stack.push({ kind: "binary", operator: instruction.op as "+" | "-" | "*" | "/" | "^", left, right });
    } else if (instruction.t === "call") stack.push({ kind: "call", name: instruction.fn,
      arguments: stack.splice(stack.length - instruction.argc, instruction.argc) });
  }
  return stack[0]!;
};

export function mathExpressionSymbolTable(profile: MathExpressionProfile, variables: readonly string[]): MathExpressionSymbolTable {
  return { variables: [...variables],
    constants: profile === "complex" ? [...COMPLEX_EXPRESSION_CONSTANTS] : profile === "graph" ? ["pi", "e", "tau"] : ["pi", "e"],
    functions: profile === "complex" ? [...COMPLEX_EXPRESSION_FUNCTIONS] : profile === "graph" ? [...GRAPH2D_FUNCTIONS] : [...REAL_FUNCTIONS] };
}

/** Parse once, retain a typed AST, and evaluate against explicit finite bindings. */
export function prepareMathExpression(source: string, profile: MathExpressionProfile,
  variables: readonly string[]): MathExpressionResult {
  if (typeof source !== "string") return { error: issue("syntax", "Expression must be text.") };
  if (!Array.isArray(variables) || variables.length > 17 || new Set(variables).size !== variables.length ||
    variables.some(name => typeof name !== "string" || !allowedName.test(name)))
    return { error: issue("scope", "Invalid variable scope.") };
  if (profile === "complex" && variables.some(name => !["z", "u", "v"].includes(name)))
    return { error: issue("scope", "Complex expressions support z, u, and v.") };
  const scope = [...variables];
  const symbols = mathExpressionSymbolTable(profile, scope);
  const reserved = new Set([...symbols.constants, ...symbols.functions]);
  if (scope.some(name => reserved.has(name)))
    return { error: issue("scope", "A variable conflicts with a mathematical constant or function.") };
  if (profile === "graph") {
    const parsed = parseGraph2DExpression(source, scope);
    if (!parsed.ok) {
      const diagnostic = parsed.diagnostics[0]!;
      return { error: issue(diagnostic.code === "limit" ? "limit" : diagnostic.code === "unknown-symbol" ? "scope" : "syntax",
        diagnostic.message, diagnostic.span.start, diagnostic.span.end) };
    }
    return { ast: { version: 1, profile, tree: parsed.ast, normalized: normalizeGraph(parsed.ast.root),
      source, scope, parserVersion: "math3d-controlled-graph@1" },
      evaluate: bindings => {
        const values: Record<string, number> = {};
        for (const name of scope) {
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
    const scoped = scope as ComplexExpressionVariable[];
    const parsed = parseComplexExpressionAst(source, scoped);
    if (!parsed.ast || parsed.error) {
      const message = parsed.error?.message ?? "Invalid complex expression.";
      return { error: issue(message.includes("Unknown identifier") ? "scope" : message.includes("exceeds") ? "limit" : "syntax",
        message, parsed.error?.index ?? 0) };
    }
    const compiled = compileComplexExpressionAstPreview(parsed.ast, scoped);
    if (!compiled.fn) return { error: issue("syntax", compiled.error?.message ?? "Invalid complex expression.") };
    return { ast: { version: 1, profile, tree: parsed.ast, normalized: normalizeComplex(parsed.ast),
      source, scope, parserVersion: COMPLEX_EXPRESSION_PARSER_VERSION },
      evaluate: bindings => {
        for (const name of scope) if (!(name in bindings) || bindings[name] === undefined)
          return { error: issue("scope", `No value for '${name}'.`) };
        const z = bindings.z;
        const u = bindings.u;
        const v = bindings.v;
        if (z !== undefined && !(typeof z === "number" && Number.isFinite(z)) &&
          !(typeof z === "object" && z && Number.isFinite(z.re) && Number.isFinite(z.im)))
          return { error: issue("scope", "No finite value for 'z'.") };
        if (u !== undefined && (typeof u !== "number" || !Number.isFinite(u)) ||
            v !== undefined && (typeof v !== "number" || !Number.isFinite(v)))
          return { error: issue("scope", "Complex parameters u and v must be finite real numbers.") };
        const value = compiled.fn!({ z: typeof z === "number" ? C(z, 0) : z,
          u: typeof u === "number" ? u : undefined, v: typeof v === "number" ? v : undefined });
        return Number.isFinite(value.re) && Number.isFinite(value.im) ? { value } :
          { error: issue("domain", "The expression is singular or undefined at this point.") };
      } };
  }
  const compiled = compileExpression(source, scope);
  if (!compiled.fn || !compiled.ast) return { error: issue(compiled.error?.message.includes("too many") ||
    compiled.error?.message.includes("exceeds") ? "limit" : compiled.error?.message.includes("Unknown identifier") ? "scope" : "syntax",
    compiled.error?.message ?? "Invalid expression.", compiled.error?.index ?? 0) };
  return { ast: { version: 1, profile, tree: compiled.ast, normalized: normalizeReal(compiled.ast),
    source, scope, parserVersion: "math3d-legacy-real@2" },
    evaluate: bindings => {
      const values: Record<string, number> = {};
      for (const name of scope) {
        const value = bindings[name];
        if (typeof value !== "number" || !Number.isFinite(value)) return { error: issue("scope", `No finite value for '${name}'.`) };
        values[name] = value;
      }
      const value = compiled.fn!(values);
      return Number.isFinite(value) ? { value } : { error: issue("domain", "The expression is singular or undefined at this point.") };
    } };
}

/** Whitespace-independent, versioned canonical AST identity; original source stays in ast.source. */
export function serializeMathExpressionAst(ast: MathExpressionAst): string {
  return canonicalJsonStringify({ version: MATH_EXPRESSION_SERVICE_VERSION, profile: ast.profile,
    parserVersion: ast.parserVersion, scope: [...ast.scope].sort(), tree: ast.normalized } as CanonicalJsonValue);
}

export type MathExpressionProvenance = Readonly<{
  source: string; profile: MathExpressionProfile; parserVersion: string; scope: readonly string[];
  serializedAst: string; structuralHash: string;
}>;

export function mathExpressionProvenance(ast: MathExpressionAst): MathExpressionProvenance {
  const serializedAst = serializeMathExpressionAst(ast);
  return { source: ast.source, profile: ast.profile, parserVersion: ast.parserVersion,
    scope: [...ast.scope], serializedAst, structuralHash: structuralHash(serializedAst) };
}

/** Restore from source and compare the parsed canonical AST before accepting persisted provenance. */
export function restoreMathExpressionProvenance(value: unknown): MathExpressionResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { error: issue("syntax", "Invalid expression provenance.") };
  const record = value as Record<string, unknown>;
  if (typeof record.source !== "string" || typeof record.profile !== "string" ||
    !["graph", "real", "complex"].includes(record.profile) ||
    !Array.isArray(record.scope) || typeof record.serializedAst !== "string" ||
    typeof record.parserVersion !== "string" || typeof record.structuralHash !== "string")
    return { error: issue("syntax", "Invalid expression provenance.") };
  const parsed = prepareMathExpression(record.source, record.profile as MathExpressionProfile, record.scope as string[]);
  if (!parsed.ast) return parsed;
  const canonical = serializeMathExpressionAst(parsed.ast);
  if (parsed.ast.parserVersion !== record.parserVersion || canonical !== record.serializedAst ||
    structuralHash(canonical) !== record.structuralHash)
    return { error: issue("syntax", "Expression provenance does not match the current parser and source.") };
  return parsed;
}

/** Symbolic rules are available for the controlled Graph dialect; other dialects report an explicit capability gap. */
export function differentiateMathExpression(ast: MathExpressionAst, variable: string, order: 1 | 2 = 1):
  Readonly<{ ok: true; ast: MathExpressionAst; method: "symbolic-rules" } | { ok: false; reason: string }> {
  if (!ast.scope.includes(variable)) return { ok: false, reason: "Variable is outside the expression scope." };
  if (ast.profile !== "graph" || !["x", "theta", "t"].includes(variable))
    return { ok: false, reason: "Symbolic differentiation is not available for this expression profile." };
  const result = differentiateGraph2DExpression(ast.tree, order, variable as "x" | "theta" | "t");
  if (!result.ok) return result;
  return { ok: true, method: "symbolic-rules", ast: { ...ast, tree: result.ast,
    normalized: normalizeGraph(result.ast.root), source: formatGraph2DExpressionAst(result.ast) } };
}

export function previewMathExpression(source: string, profile: MathExpressionProfile, variables: readonly string[],
  bindings: Readonly<Record<string, number | Complex>> = {}) {
  const started = Date.now();
  const prepared = prepareMathExpression(source, profile, variables);
  const sample = Object.fromEntries(variables.map(name => [name, bindings[name] ?? (name === "z" ? C(0.5, 0.5) : 0.5)]));
  const evaluated = prepared.evaluate?.(sample);
  return { ...prepared, sample, value: evaluated?.value, sampleError: evaluated?.error,
    durationMs: Date.now() - started };
}
