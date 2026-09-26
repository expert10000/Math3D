export const GRAPH2D_EXPRESSION_AST_VERSION = 1 as const;
export const GRAPH2D_EXPRESSION_MAX_BYTES = 2048;
export const GRAPH2D_EXPRESSION_MAX_NODES = 256;
export const GRAPH2D_EXPRESSION_MAX_DEPTH = 32;
export const GRAPH2D_EXPRESSION_MAX_EVALUATIONS = 100000;

export type Graph2DSpan = Readonly<{ start: number; end: number }>;
export type Graph2DExpressionNode =
  | Readonly<{ kind: "number"; value: number; span: Graph2DSpan }>
  | Readonly<{ kind: "symbol"; name: string; span: Graph2DSpan }>
  | Readonly<{ kind: "unary"; operator: "+" | "-"; operand: Graph2DExpressionNode; span: Graph2DSpan }>
  | Readonly<{ kind: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: Graph2DExpressionNode; right: Graph2DExpressionNode; span: Graph2DSpan }>
  | Readonly<{ kind: "call"; functionName: Graph2DFunctionName; argument: Graph2DExpressionNode; span: Graph2DSpan }>;
export type Graph2DExpressionAst = Readonly<{
  version: typeof GRAPH2D_EXPRESSION_AST_VERSION;
  root: Graph2DExpressionNode;
}>;
export type Graph2DExpressionDiagnostic = Readonly<{
  code: "syntax" | "limit" | "unknown-symbol" | "domain" | "non-finite";
  message: string;
  span: Graph2DSpan;
}>;
export type Graph2DParseResult = Readonly<
  { ok: true; ast: Graph2DExpressionAst; diagnostics: readonly [] } |
  { ok: false; ast: null; diagnostics: readonly Graph2DExpressionDiagnostic[] }
>;
export type Graph2DEvaluationResult = Readonly<
  { ok: true; value: number; evaluations: number } |
  { ok: false; diagnostic: Graph2DExpressionDiagnostic; evaluations: number }
>;

export const GRAPH2D_FUNCTIONS = ["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "exp", "ln", "log", "floor", "ceil"] as const;
export type Graph2DFunctionName = (typeof GRAPH2D_FUNCTIONS)[number];
const functionSet = new Set<string>(GRAPH2D_FUNCTIONS);
const constants: Readonly<Record<string, number>> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

type Token = Readonly<{ kind: "number" | "identifier" | "operator" | "left" | "right" | "end"; text: string; start: number; end: number }>;
class Graph2DExpressionError extends Error {
  readonly diagnostic: Graph2DExpressionDiagnostic;
  constructor(diagnostic: Graph2DExpressionDiagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}
const issue = (code: Graph2DExpressionDiagnostic["code"], message: string, span: Graph2DSpan): never => {
  throw new Graph2DExpressionError({ code, message, span });
};
const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const start = index;
    const char = source[index]!;
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[0-9.]/.test(char)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      if (!match) return issue("syntax", "Invalid number.", { start, end: start + 1 });
      index += match[0].length;
      if (!Number.isFinite(Number(match[0]))) issue("non-finite", "Number is outside finite range.", { start, end: index });
      tokens.push({ kind: "number", text: match[0], start, end: index });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(source.slice(index))!;
      index += match[0].length;
      tokens.push({ kind: "identifier", text: match[0], start, end: index });
      continue;
    }
    index += 1;
    const kind = char === "(" ? "left" : char === ")" ? "right" : "+-*/^".includes(char) ? "operator" : null;
    if (!kind) return issue("syntax", `Unexpected character '${char}'.`, { start, end: index });
    tokens.push({ kind, text: char, start, end: index });
    if (tokens.length > GRAPH2D_EXPRESSION_MAX_NODES * 4)
      issue("limit", "Expression has too many tokens.", { start, end: index });
  }
  tokens.push({ kind: "end", text: "", start: source.length, end: source.length });
  return tokens;
};

class Parser {
  private index = 0;
  private nodes = 0;
  private readonly tokens: readonly Token[];
  private readonly symbols: ReadonlySet<string>;
  constructor(tokens: readonly Token[], symbols: ReadonlySet<string>) {
    this.tokens = tokens;
    this.symbols = symbols;
  }
  private current(): Token { return this.tokens[this.index]!; }
  private advance(): Token { return this.tokens[this.index++]!; }
  private node<T extends Graph2DExpressionNode>(value: T): T {
    if (++this.nodes > GRAPH2D_EXPRESSION_MAX_NODES) issue("limit", "Expression has too many AST nodes.", value.span);
    return value;
  }
  parse(): Graph2DExpressionNode {
    const result = this.expression(0, 0);
    if (this.current().kind !== "end") issue("syntax", "Unexpected trailing input.", this.current());
    return result;
  }
  private expression(minBindingPower: number, depth: number): Graph2DExpressionNode {
    if (depth > GRAPH2D_EXPRESSION_MAX_DEPTH) issue("limit", "Expression nesting is too deep.", this.current());
    const token = this.advance();
    let left: Graph2DExpressionNode;
    if (token.kind === "number") {
      left = this.node({ kind: "number", value: Number(token.text), span: { start: token.start, end: token.end } });
    } else if (token.kind === "identifier") {
      if (this.current().kind === "left") {
        if (!functionSet.has(token.text)) issue("unknown-symbol", `Unknown function '${token.text}'.`, token);
        this.advance();
        const argument = this.expression(0, depth + 1);
        if (this.current().kind !== "right") issue("syntax", "Expected closing parenthesis.", this.current());
        const close = this.advance();
        left = this.node({ kind: "call", functionName: token.text as Graph2DFunctionName, argument,
          span: { start: token.start, end: close.end } });
      } else {
        if (!this.symbols.has(token.text) && !Object.prototype.hasOwnProperty.call(constants, token.text))
          issue("unknown-symbol", `Unknown symbol '${token.text}'.`, token);
        left = this.node({ kind: "symbol", name: token.text, span: { start: token.start, end: token.end } });
      }
    } else if (token.kind === "operator" && (token.text === "+" || token.text === "-")) {
      const operand = this.expression(3, depth + 1);
      left = this.node({ kind: "unary", operator: token.text, operand, span: { start: token.start, end: operand.span.end } });
    } else if (token.kind === "left") {
      left = this.expression(0, depth + 1);
      if (this.current().kind !== "right") issue("syntax", "Expected closing parenthesis.", this.current());
      this.advance();
    } else return issue("syntax", "Expected a number, symbol, or parenthesized expression.", token);

    while (this.current().kind === "operator") {
      const op = this.current();
      const leftPower = op.text === "+" || op.text === "-" ? 1 : op.text === "*" || op.text === "/" ? 2 : 4;
      if (leftPower < minBindingPower) break;
      this.advance();
      const right = this.expression(op.text === "^" ? leftPower : leftPower + 1, depth + 1);
      left = this.node({ kind: "binary", operator: op.text as "+" | "-" | "*" | "/" | "^", left, right,
        span: { start: left.span.start, end: right.span.end } });
    }
    return left;
  }
}

export const parseGraph2DExpression = (source: string, variables: readonly string[] = ["x"]): Graph2DParseResult => {
  if (typeof source !== "string") return { ok: false, ast: null, diagnostics: [{ code: "syntax", message: "Expression must be text.", span: { start: 0, end: 0 } }] };
  if (new TextEncoder().encode(source).length > GRAPH2D_EXPRESSION_MAX_BYTES)
    return { ok: false, ast: null, diagnostics: [{ code: "limit", message: "Expression exceeds byte limit.", span: { start: 0, end: source.length } }] };
  if (!source.trim()) return { ok: false, ast: null, diagnostics: [{ code: "syntax", message: "Expression is empty.", span: { start: 0, end: source.length } }] };
  if (variables.length > 17 || variables.some((name) => !/^[a-z][a-z0-9_]{0,31}$/.test(name) ||
      Object.prototype.hasOwnProperty.call(constants, name) || functionSet.has(name)))
    return { ok: false, ast: null, diagnostics: [{ code: "unknown-symbol", message: "Invalid variable declaration.", span: { start: 0, end: 0 } }] };
  try {
    const root = new Parser(tokenize(source), new Set(variables)).parse();
    return { ok: true, ast: { version: GRAPH2D_EXPRESSION_AST_VERSION, root }, diagnostics: [] };
  } catch (error) {
    if (error instanceof Graph2DExpressionError) return { ok: false, ast: null, diagnostics: [error.diagnostic] };
    return { ok: false, ast: null, diagnostics: [{ code: "limit", message: "Expression could not be parsed within limits.", span: { start: 0, end: source.length } }] };
  }
};

export const formatGraph2DExpressionAst = (ast: Graph2DExpressionAst): string => {
  const format = (node: Graph2DExpressionNode): string => {
    switch (node.kind) {
      case "number": return String(node.value);
      case "symbol": return node.name;
      case "unary": return `(${node.operator}${format(node.operand)})`;
      case "binary": return `(${format(node.left)}${node.operator}${format(node.right)})`;
      case "call": return `${node.functionName}(${format(node.argument)})`;
    }
  };
  return format(ast.root);
};

export const evaluateGraph2DExpression = (
  ast: Graph2DExpressionAst,
  variables: Readonly<Record<string, number>>,
  options: Readonly<{ maxEvaluations?: number; deadlineMs?: number }> = {},
): Graph2DEvaluationResult => {
  const maxEvaluations = Math.max(1, Math.min(GRAPH2D_EXPRESSION_MAX_EVALUATIONS, options.maxEvaluations ?? GRAPH2D_EXPRESSION_MAX_EVALUATIONS));
  const deadline = options.deadlineMs ?? Number.POSITIVE_INFINITY;
  let evaluations = 0;
  const compute = (node: Graph2DExpressionNode, depth: number): number => {
    if (++evaluations > maxEvaluations || Date.now() > deadline || depth > GRAPH2D_EXPRESSION_MAX_DEPTH + 1)
      issue("limit", "Evaluation budget exceeded.", node.span);
    let value: number;
    switch (node.kind) {
      case "number": value = node.value; break;
      case "symbol": {
        if (Object.prototype.hasOwnProperty.call(constants, node.name)) value = constants[node.name]!;
        else if (Object.prototype.hasOwnProperty.call(variables, node.name) && Number.isFinite(variables[node.name])) value = variables[node.name]!;
        else return issue("unknown-symbol", `No finite value for '${node.name}'.`, node.span);
        break;
      }
      case "unary": value = node.operator === "-" ? -compute(node.operand, depth + 1) : compute(node.operand, depth + 1); break;
      case "binary": {
        const left = compute(node.left, depth + 1);
        const right = compute(node.right, depth + 1);
        if (node.operator === "/" && right === 0) issue("domain", "Division by zero.", node.span);
        value = node.operator === "+" ? left + right : node.operator === "-" ? left - right :
          node.operator === "*" ? left * right : node.operator === "/" ? left / right : Math.pow(left, right);
        break;
      }
      case "call": {
        const argument = compute(node.argument, depth + 1);
        if ((node.functionName === "sqrt" && argument < 0) ||
            ((node.functionName === "ln" || node.functionName === "log") && argument <= 0) ||
            ((node.functionName === "asin" || node.functionName === "acos") && Math.abs(argument) > 1))
          issue("domain", `Invalid ${node.functionName} argument.`, node.span);
        const functions: Record<Graph2DFunctionName, (value: number) => number> = {
          sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
          sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, floor: Math.floor, ceil: Math.ceil,
        };
        value = functions[node.functionName](argument);
        break;
      }
      default: return issue("syntax", "Unsupported AST node.", { start: 0, end: 0 });
    }
    if (!Number.isFinite(value)) issue("non-finite", "Expression result is not finite.", node.span);
    return value;
  };
  try {
    if (ast.version !== GRAPH2D_EXPRESSION_AST_VERSION) issue("syntax", "Unsupported expression AST version.", { start: 0, end: 0 });
    return { ok: true, value: compute(ast.root, 0), evaluations };
  } catch (error) {
    if (error instanceof Graph2DExpressionError) return { ok: false, diagnostic: error.diagnostic, evaluations };
    return { ok: false, diagnostic: { code: "limit", message: "Evaluation could not complete within limits.", span: { start: 0, end: 0 } }, evaluations };
  }
};
