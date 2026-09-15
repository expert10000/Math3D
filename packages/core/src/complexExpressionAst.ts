import { canonicalJsonStringify } from "./documentIdentity";
import type { ComplexExpressionAst } from "./complexAnalysisDocument";
import type { ValidationResult } from "./validation";

export const COMPLEX_EXPRESSION_PARSER_VERSION = "math3d-controlled-complex@1" as const;
export const COMPLEX_EXPRESSION_FUNCTIONS = Object.freeze(["sin", "cos", "tan", "exp", "log", "sqrt", "abs"] as const);
export const COMPLEX_EXPRESSION_CONSTANTS = Object.freeze(["i", "pi", "e"] as const);
export const COMPLEX_EXPRESSION_VARIABLES = Object.freeze(["z", "u", "v"] as const);
export type ComplexExpressionVariable = (typeof COMPLEX_EXPRESSION_VARIABLES)[number];
export type ComplexExpressionDiagnostic = Readonly<{ message: string; index: number; line: number; col: number }>;
export type ComplexExpressionParseResult = Readonly<{ ast?: ComplexExpressionAst; error?: ComplexExpressionDiagnostic }>;

type Token =
  | { kind: "number"; value: number; index: number }
  | { kind: "identifier"; value: string; index: number }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "^"; index: number }
  | { kind: "left" | "right" | "comma" | "end"; index: number };

const FUNCTIONS = new Set<string>(COMPLEX_EXPRESSION_FUNCTIONS);
const CONSTANTS = new Set<string>(COMPLEX_EXPRESSION_CONSTANTS);
const BINARY_PRECEDENCE = { "+": 2, "-": 2, "*": 3, "/": 3, "^": 4 } as const;
const MAX_SOURCE_LENGTH = 10_000;
const MAX_AST_NODES = 4_096;
const MAX_AST_DEPTH = 128;

const isWhitespace = (value: string) => value === " " || value === "\t" || value === "\r" || value === "\n";
const isDigit = (value: string) => value >= "0" && value <= "9";
const isAlpha = (value: string) => (value >= "a" && value <= "z") || (value >= "A" && value <= "Z") || value === "_";

const diagnosticAt = (source: string, message: string, index: number): ComplexExpressionDiagnostic => {
  const safeIndex = Math.max(0, Math.min(source.length, index));
  const prefix = source.slice(0, safeIndex);
  const lines = prefix.split(/\r\n|\r|\n/);
  return { message, index: safeIndex, line: lines.length, col: (lines.at(-1)?.length ?? 0) + 1 };
};

const tokenize = (source: string): { tokens?: Token[]; error?: ComplexExpressionDiagnostic } => {
  if (!source.trim()) return { error: diagnosticAt(source, "Expression is empty", 0) };
  if (source.length > MAX_SOURCE_LENGTH) return { error: diagnosticAt(source, `Expression exceeds ${MAX_SOURCE_LENGTH} characters`, MAX_SOURCE_LENGTH) };
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (isWhitespace(char)) { index += 1; continue; }
    if (isDigit(char) || (char === "." && isDigit(source[index + 1] ?? ""))) {
      const start = index;
      index += 1;
      while (isDigit(source[index] ?? "") || source[index] === ".") index += 1;
      const raw = source.slice(start, index);
      const value = Number(raw);
      if (!Number.isFinite(value)) return { error: diagnosticAt(source, `Bad number: ${raw}`, start) };
      tokens.push({ kind: "number", value, index: start });
      continue;
    }
    if (isAlpha(char)) {
      const start = index;
      index += 1;
      while (isAlpha(source[index] ?? "") || isDigit(source[index] ?? "")) index += 1;
      tokens.push({ kind: "identifier", value: source.slice(start, index), index: start });
      continue;
    }
    if (["+", "-", "*", "/", "^"].includes(char)) {
      tokens.push({ kind: "operator", value: char as "+" | "-" | "*" | "/" | "^", index });
      index += 1;
      continue;
    }
    if (char === "(") tokens.push({ kind: "left", index });
    else if (char === ")") tokens.push({ kind: "right", index });
    else if (char === ",") tokens.push({ kind: "comma", index });
    else return { error: diagnosticAt(source, `Unexpected character '${char}'`, index) };
    index += 1;
  }
  tokens.push({ kind: "end", index: source.length });
  return { tokens };
};

const insertImplicitMultiplication = (tokens: readonly Token[]): Token[] => {
  const result: Token[] = [];
  const endsValue = (token: Token) => token.kind === "number" || token.kind === "identifier" || token.kind === "right";
  const startsValue = (token: Token) => token.kind === "number" || token.kind === "identifier" || token.kind === "left";
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]!;
    result.push(current);
    const next = tokens[index + 1];
    if (!next || next.kind === "end") continue;
    const functionCall = current.kind === "identifier" && next.kind === "left" && FUNCTIONS.has(current.value);
    if (endsValue(current) && startsValue(next) && !functionCall) result.push({ kind: "operator", value: "*", index: next.index });
  }
  return result;
};

export const validateComplexExpressionAst = (
  value: unknown,
  allowedVariables: readonly ComplexExpressionVariable[] = COMPLEX_EXPRESSION_VARIABLES
): ValidationResult<ComplexExpressionAst> => {
  const errors: string[] = [];
  const allowed = new Set(allowedVariables);
  let nodes = 0;
  const visit = (node: unknown, path: string, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_AST_NODES) { if (nodes === MAX_AST_NODES + 1) errors.push(`AST exceeds ${MAX_AST_NODES} nodes.`); return; }
    if (depth > MAX_AST_DEPTH) { errors.push(`${path} exceeds depth ${MAX_AST_DEPTH}.`); return; }
    if (!node || typeof node !== "object" || Array.isArray(node)) { errors.push(`${path} must be an AST node.`); return; }
    const record = node as Record<string, unknown>;
    const exactFields = (expected: readonly string[]) => {
      const extras = Object.keys(record).filter((key) => !expected.includes(key));
      const missing = expected.filter((key) => !(key in record));
      if (extras.length) errors.push(`${path} contains unknown fields: ${extras.sort().join(", ")}.`);
      if (missing.length) errors.push(`${path} is missing fields: ${missing.join(", ")}.`);
    };
    switch (record.type) {
      case "number": exactFields(["type", "value"]); if (typeof record.value !== "number" || !Number.isFinite(record.value)) errors.push(`${path}.value must be finite.`); break;
      case "constant": exactFields(["type", "name"]); if (!CONSTANTS.has(String(record.name))) errors.push(`${path}.name is not a supported constant.`); break;
      case "variable": exactFields(["type", "name"]); if (!allowed.has(record.name as ComplexExpressionVariable)) errors.push(`${path}.name '${String(record.name)}' is not allowed.`); break;
      case "unary": exactFields(["type", "operator", "argument"]); if (record.operator !== "-") errors.push(`${path}.operator is not supported.`); visit(record.argument, `${path}.argument`, depth + 1); break;
      case "binary": exactFields(["type", "operator", "left", "right"]); if (!(String(record.operator) in BINARY_PRECEDENCE)) errors.push(`${path}.operator is not supported.`); visit(record.left, `${path}.left`, depth + 1); visit(record.right, `${path}.right`, depth + 1); break;
      case "call": exactFields(["type", "name", "argument"]); if (!FUNCTIONS.has(String(record.name))) errors.push(`${path}.name is not a supported function.`); visit(record.argument, `${path}.argument`, depth + 1); break;
      default: errors.push(`${path}.type is not supported.`);
    }
  };
  try { canonicalJsonStringify(value); } catch (error) { errors.push(`AST must be canonical JSON: ${(error as Error).message}`); }
  visit(value, "ast", 0);
  return errors.length ? { ok: false, errors } : { ok: true, value: value as ComplexExpressionAst };
};

export const parseComplexExpressionAst = (
  source: string,
  allowedVariables: readonly ComplexExpressionVariable[] = COMPLEX_EXPRESSION_VARIABLES
): ComplexExpressionParseResult => {
  const tokenized = tokenize(source);
  if (tokenized.error || !tokenized.tokens) return { error: tokenized.error };
  if (new Set(allowedVariables).size !== allowedVariables.length || allowedVariables.some((name) => !COMPLEX_EXPRESSION_VARIABLES.includes(name))) return { error: diagnosticAt(source, "Allowed variable list is invalid", 0) };
  const tokens = insertImplicitMultiplication(tokenized.tokens);
  let cursor = 0;
  let failure: ComplexExpressionDiagnostic | undefined;
  const peek = () => tokens[cursor] ?? { kind: "end" as const, index: source.length };
  const fail = (message: string, index = peek().index): undefined => { if (!failure) failure = diagnosticAt(source, message, index); return undefined; };
  let parsePrefix: () => ComplexExpressionAst | undefined;
  const parseExpression = (minimumPrecedence: number): ComplexExpressionAst | undefined => {
    let left = parsePrefix();
    if (!left) return undefined;
    while (peek().kind === "operator") {
      const operatorToken = peek() as Extract<Token, { kind: "operator" }>;
      const precedence = BINARY_PRECEDENCE[operatorToken.value];
      if (precedence < minimumPrecedence) break;
      cursor += 1;
      const right = parseExpression(operatorToken.value === "^" ? precedence : precedence + 1);
      if (!right) return fail(`Expected expression after '${operatorToken.value}'`, operatorToken.index + 1);
      left = { type: "binary", operator: operatorToken.value, left, right };
    }
    return left;
  };
  parsePrefix = (): ComplexExpressionAst | undefined => {
    const token = peek();
    if (token.kind === "operator" && token.value === "-") {
      cursor += 1;
      const argument = parseExpression(5);
      return argument ? { type: "unary", operator: "-", argument } : fail("Expected expression after unary '-'", token.index + 1);
    }
    if (token.kind === "number") { cursor += 1; return { type: "number", value: token.value }; }
    if (token.kind === "identifier") {
      cursor += 1;
      if (FUNCTIONS.has(token.value) && peek().kind === "left") {
        cursor += 1;
        if (peek().kind === "right") return fail(`Function '${token.value}' requires one argument`, peek().index);
        const argument = parseExpression(0);
        if (!argument) return undefined;
        if (peek().kind === "comma") return fail(`Function '${token.value}' accepts exactly one argument`, peek().index);
        if (peek().kind !== "right") return fail("Mismatched '('", token.index + token.value.length);
        cursor += 1;
        return { type: "call", name: token.value as Extract<ComplexExpressionAst, { type: "call" }>["name"], argument };
      }
      if (CONSTANTS.has(token.value)) return { type: "constant", name: token.value as Extract<ComplexExpressionAst, { type: "constant" }>["name"] };
      if (allowedVariables.includes(token.value as ComplexExpressionVariable)) return { type: "variable", name: token.value as ComplexExpressionVariable };
      return fail(`Unknown identifier '${token.value}'`, token.index);
    }
    if (token.kind === "left") {
      cursor += 1;
      const expression = parseExpression(0);
      if (!expression) return undefined;
      if (peek().kind !== "right") return fail("Mismatched '('", token.index);
      cursor += 1;
      return expression;
    }
    if (token.kind === "right") return fail("Mismatched ')'", token.index);
    if (token.kind === "comma") return fail("Unexpected ','", token.index);
    if (token.kind === "end") return fail("Expected expression", token.index);
    return fail(token.kind === "operator" ? `Unexpected operator '${token.value}'` : "Unexpected token", token.index);
  };
  const ast = parseExpression(0);
  if (failure || !ast) return { error: failure ?? diagnosticAt(source, "Could not parse expression", 0) };
  const remaining = peek();
  if (remaining.kind !== "end") return { error: diagnosticAt(source, remaining.kind === "right" ? "Mismatched ')'" : remaining.kind === "comma" ? "Unexpected ','" : "Unexpected token", remaining.index) };
  const validation = validateComplexExpressionAst(ast, allowedVariables);
  if (!validation.ok) return { error: diagnosticAt(source, validation.errors.join(" "), 0) };
  return { ast: validation.value };
};

export const serializeComplexExpressionAst = (ast: ComplexExpressionAst): string => {
  const validated = validateComplexExpressionAst(ast);
  if (!validated.ok) throw new TypeError(validated.errors.join(" "));
  return canonicalJsonStringify(validated.value);
};

export const deserializeComplexExpressionAst = (serialized: string): ValidationResult<ComplexExpressionAst> => {
  try { return validateComplexExpressionAst(JSON.parse(serialized)); }
  catch (error) { return { ok: false, errors: [`Complex expression AST JSON is invalid: ${(error as Error).message}`] }; }
};
