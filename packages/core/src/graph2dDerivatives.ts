import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DDomain } from "./graph2dDocument";
import { evaluateGraph2DExpression, formatGraph2DExpressionAst,
  type Graph2DExpressionAst, type Graph2DExpressionNode } from "./graph2dExpression";

export const GRAPH2D_DERIVATIVE_ALGORITHM_VERSION = "1" as const;
export const GRAPH2D_DERIVATIVE_TOLERANCE = 1e-5;
export type Graph2DDerivativeOrder = 1 | 2;
export type Graph2DDerivativeMethod = "symbolic-rules" | "finite-difference" | "unavailable";
export type Graph2DDerivativeDiagnostic = Readonly<{ code: string; message: string }>;
export type Graph2DDerivativeEstimate = Readonly<{
  order: Graph2DDerivativeOrder;
  x: number;
  domain: Graph2DDomain;
  status: "numerical" | "unavailable";
  method: Graph2DDerivativeMethod;
  value: number | null;
  formula: string | null;
  step: number | null;
  tolerance: number;
  errorEstimate: number | null;
  diagnostics: readonly Graph2DDerivativeDiagnostic[];
  publication: AnalysisResultEnvelope;
}>;

type Node = Graph2DExpressionNode;
const span = { start: 0, end: 0 };
const number = (value: number): Node => ({ kind: "number", value, span });
const isNumber = (node: Node, value: number): boolean => node.kind === "number" && node.value === value;
const unary = (operator: "+" | "-", operand: Node): Node =>
  operator === "+" ? operand : operand.kind === "number" ? number(-operand.value) : { kind: "unary", operator, operand, span };
const binary = (operator: "+" | "-" | "*" | "/" | "^", left: Node, right: Node): Node => {
  if (operator === "+") { if (isNumber(left, 0)) return right; if (isNumber(right, 0)) return left; }
  if (operator === "-") { if (isNumber(right, 0)) return left; if (isNumber(left, 0)) return unary("-", right); }
  if (operator === "*") { if (isNumber(left, 0) || isNumber(right, 0)) return number(0);
    if (isNumber(left, 1)) return right; if (isNumber(right, 1)) return left; }
  if (operator === "/" && isNumber(right, 1)) return left;
  if (operator === "^") { if (isNumber(right, 0)) return number(1); if (isNumber(right, 1)) return left; }
  if (left.kind === "number" && right.kind === "number") {
    const value = operator === "+" ? left.value + right.value : operator === "-" ? left.value - right.value :
      operator === "*" ? left.value * right.value : operator === "/" ? left.value / right.value : left.value ** right.value;
    if (Number.isFinite(value)) return number(value);
  }
  return { kind: "binary", operator, left, right, span };
};
const call = (functionName: Extract<Node, { kind: "call" }>["functionName"], argument: Node): Node =>
  ({ kind: "call", functionName, argument, span });
const add = (a: Node, b: Node) => binary("+", a, b);
const sub = (a: Node, b: Node) => binary("-", a, b);
const mul = (a: Node, b: Node) => binary("*", a, b);
const div = (a: Node, b: Node) => binary("/", a, b);
const pow = (a: Node, b: Node) => binary("^", a, b);

const derivativeNode = (node: Node): Node | null => {
  switch (node.kind) {
    case "number": return number(0);
    case "symbol": return number(node.name === "x" ? 1 : 0);
    case "unary": {
      const operand = derivativeNode(node.operand);
      return operand ? unary(node.operator, operand) : null;
    }
    case "binary": {
      const left = derivativeNode(node.left), right = derivativeNode(node.right);
      if (!left || !right) return null;
      switch (node.operator) {
        case "+": return add(left, right);
        case "-": return sub(left, right);
        case "*": return add(mul(left, node.right), mul(node.left, right));
        case "/": return div(sub(mul(left, node.right), mul(node.left, right)), pow(node.right, number(2)));
        case "^": {
          if (node.right.kind === "number") return mul(mul(number(node.right.value), pow(node.left, number(node.right.value - 1))), left);
          return mul(node, add(mul(right, call("ln", node.left)), div(mul(node.right, left), node.left)));
        }
      }
    }
    case "call": {
      const d = derivativeNode(node.argument);
      if (!d) return null;
      const u = node.argument;
      switch (node.functionName) {
        case "sin": return mul(call("cos", u), d);
        case "cos": return mul(unary("-", call("sin", u)), d);
        case "tan": return div(d, pow(call("cos", u), number(2)));
        case "asin": return div(d, call("sqrt", sub(number(1), pow(u, number(2)))));
        case "acos": return unary("-", div(d, call("sqrt", sub(number(1), pow(u, number(2))))));
        case "atan": return div(d, add(number(1), pow(u, number(2))));
        case "sqrt": return div(d, mul(number(2), call("sqrt", u)));
        case "exp": return mul(call("exp", u), d);
        case "ln": return div(d, u);
        case "log": return div(d, mul(u, number(Math.LN10)));
        case "abs": case "floor": case "ceil": return null;
      }
    }
  }
};
const withinSymbolicBudget = (node: Node): boolean => {
  let count = 0;
  const walk = (current: Node, depth: number): boolean => {
    if (++count > 1024 || depth > 30) return false;
    if (current.kind === "unary") return walk(current.operand, depth + 1);
    if (current.kind === "call") return walk(current.argument, depth + 1);
    if (current.kind === "binary") return walk(current.left, depth + 1) && walk(current.right, depth + 1);
    return true;
  };
  return walk(node, 0);
};

/** A derivative AST is transient and bounded; unsupported or expanded trees request numerical fallback. */
export const differentiateGraph2DExpression = (
  ast: Graph2DExpressionAst, order: Graph2DDerivativeOrder,
): Readonly<{ ok: true; ast: Graph2DExpressionAst } | { ok: false; reason: "unsupported-rule" | "symbolic-budget" }> => {
  let root: Node = ast.root;
  for (let index = 0; index < order; index += 1) {
    const next = derivativeNode(root);
    if (!next) return { ok: false, reason: "unsupported-rule" };
    if (!withinSymbolicBudget(next)) return { ok: false, reason: "symbolic-budget" };
    root = next;
  }
  return { ok: true, ast: { version: ast.version, root } };
};

type NumericResult = Readonly<{ value: number; step: number; error: number } | { diagnostic: Graph2DDerivativeDiagnostic }>;
const numericalDerivative = (ast: Graph2DExpressionAst, variables: Readonly<Record<string, number>>,
  domain: Graph2DDomain, x: number, order: Graph2DDerivativeOrder, tolerance: number): NumericResult => {
  const scale = Math.max(1, Math.abs(x));
  let step = Math.pow(Number.EPSILON, 1 / (order + 2)) * scale;
  step = Math.min(step, (domain.max - domain.min) / 16);
  const direction = x - domain.min < step * 2 ? 1 : domain.max - x < step * 2 ? -1 : 0;
  const room = direction > 0 ? domain.max - x : direction < 0 ? x - domain.min : Math.min(x - domain.min, domain.max - x);
  step = Math.min(step, room / (direction === 0 ? 2 : 4));
  if (!(step > Number.EPSILON * scale * 8)) return { diagnostic: { code: "domain-too-narrow", message: "Domain leaves insufficient room for a stable finite difference." } };
  const sample = (offset: number): number | null => {
    const at = x + offset;
    if (at < domain.min || at > domain.max || (at === domain.min && !domain.includeMin) || (at === domain.max && !domain.includeMax)) return null;
    const evaluated = evaluateGraph2DExpression(ast, { ...variables, x: at });
    return evaluated.ok ? evaluated.value : null;
  };
  const f0 = sample(0);
  if (f0 === null) return { diagnostic: { code: "undefined-at-probe", message: "Expression is undefined at the probe." } };
  const estimate = (h: number): { value: number; magnitude: number } | null => {
    const offsets = direction === 0 ? [-h, h] : direction > 0 ? [h, 2 * h, 3 * h] : [-h, -2 * h, -3 * h];
    const values = offsets.map(sample);
    if (values.some((value) => value === null)) return null;
    const [a, b, c] = values as number[];
    const value = direction === 0 ? order === 1 ? (b - a) / (2 * h) : (b - 2 * f0 + a) / (h * h) :
      order === 1 ? direction * (-3 * f0 + 4 * a - b) / (2 * h) : (2 * f0 - 5 * a + 4 * b - c) / (h * h);
    return Number.isFinite(value) ? { value, magnitude: Math.max(Math.abs(f0), ...values.map((entry) => Math.abs(entry!))) } : null;
  };
  const coarse = estimate(step), fine = estimate(step / 2);
  if (!coarse || !fine) return { diagnostic: { code: "invalid-neighborhood", message: "Finite-difference samples cross an undefined or excluded interval." } };
  if (direction === 0 && order === 1) {
    const left = sample(-step), right = sample(step);
    if (left !== null && right !== null && Math.abs((f0 - left) / step - (right - f0) / step) >
        Math.max(0.02, 10 * Math.sqrt(step / scale) * Math.max(1, Math.abs(coarse.value))))
      return { diagnostic: { code: "nondifferentiable", message: "Left and right slopes disagree at the probe." } };
  }
  const value = (4 * fine.value - coarse.value) / 3;
  const roundoff = 16 * Number.EPSILON * Math.max(1, fine.magnitude) / Math.pow(step / 2, order);
  const error = Math.abs(value - fine.value) + roundoff;
  if (!Number.isFinite(value) || !Number.isFinite(error) || error > tolerance * Math.max(1, Math.abs(value)))
    return { diagnostic: { code: "no-convergence", message: "Finite differences did not meet the requested tolerance." } };
  return { value, step: step / 2, error };
};

export const analyzeGraph2DDerivative = (input: Readonly<{
  document: Graph2DDocument; objectId: string; x: number; order: Graph2DDerivativeOrder;
  tolerance?: number;
}>): Graph2DDerivativeEstimate => {
  const object = input.document.source.objects.find((entry) => entry.id === input.objectId);
  if (!object || !Number.isFinite(input.x) || ![1, 2].includes(input.order)) throw new TypeError("Invalid Graph2D derivative request.");
  const tolerance = input.tolerance ?? GRAPH2D_DERIVATIVE_TOLERANCE;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 0.1) throw new TypeError("Invalid derivative tolerance.");
  const started = Date.now();
  const diagnostics: Graph2DDerivativeDiagnostic[] = [];
  let method: Graph2DDerivativeMethod = "unavailable", value: number | null = null;
  let formula: string | null = null, step: number | null = null, errorEstimate: number | null = null;
  const inDomain = input.x > object.domain.min && input.x < object.domain.max ||
    input.x === object.domain.min && object.domain.includeMin || input.x === object.domain.max && object.domain.includeMax;
  if (!inDomain) diagnostics.push({ code: "outside-domain", message: "Probe is outside the function domain or at an excluded endpoint." });
  else {
    const variables = Object.fromEntries(input.document.source.variables.map((entry) => [entry.name, entry.value]));
    const symbolic = differentiateGraph2DExpression(object.expression.ast, input.order);
    if (symbolic.ok) {
      const evaluated = evaluateGraph2DExpression(symbolic.ast, { ...variables, x: input.x });
      if (evaluated.ok) {
        method = "symbolic-rules"; value = evaluated.value; formula = formatGraph2DExpressionAst(symbolic.ast);
        diagnostics.push({ code: "floating-point-evaluation", message: "Symbolic rule applied; the value is evaluated in floating point without a certified error bound." });
      } else diagnostics.push({ code: "symbolic-evaluation", message: evaluated.diagnostic.message });
    } else diagnostics.push({ code: symbolic.reason, message: "Symbolic differentiation is unavailable for this expression; using bounded finite differences." });
    if (value === null) {
      const numerical = numericalDerivative(object.expression.ast, variables, object.domain, input.x, input.order, tolerance);
      if ("diagnostic" in numerical) diagnostics.push(numerical.diagnostic);
      else { method = "finite-difference"; value = numerical.value; step = numerical.step; errorEstimate = numerical.error; }
    }
  }
  const resultId = "graph2d.derivative." + structuralHash({ documentId: input.document.identity.id,
    revision: input.document.identity.revision, objectId: input.objectId, x: input.x, order: input.order, tolerance }).slice(7);
  const publication = createAnalysisResultEnvelope({ resultId, status: value === null ? "unsupported" : "numerical",
    provenance: { source: { documentId: input.document.identity.id, revision: input.document.identity.revision,
      structuralHash: input.document.identity.structuralHash, generation: input.document.identity.revision },
      operation: { type: "graph2d.derivative", algorithm: "symbolic-rules-or-richardson", algorithmVersion: GRAPH2D_DERIVATIVE_ALGORITHM_VERSION,
        parameters: { objectId: input.objectId, x: input.x, order: input.order, domain: object.domain, tolerance } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: tolerance } },
      engine: { name: "math3d-core", version: GRAPH2D_DERIVATIVE_ALGORITHM_VERSION }, elapsedMs: Math.max(0, Date.now() - started) },
    summary: { value, method, formula, step, errorEstimate, x: input.x, order: input.order, domain: object.domain },
    warnings: method === "finite-difference" ? ["Finite differences are approximate and require local smoothness."] : [],
    diagnostics: diagnostics.map((entry) => ({ code: entry.code, severity: entry.code === "floating-point-evaluation" ? "info" as const : "warning" as const,
      message: entry.message })), artifacts: [] });
  return { order: input.order, x: input.x, domain: object.domain, status: value === null ? "unavailable" : "numerical",
    method, value, formula, step, tolerance, errorEstimate, diagnostics, publication };
};

export const analyzeGraph2DDerivatives = (document: Graph2DDocument, objectId: string, x: number):
  readonly [Graph2DDerivativeEstimate, Graph2DDerivativeEstimate] => [
    analyzeGraph2DDerivative({ document, objectId, x, order: 1 }),
    analyzeGraph2DDerivative({ document, objectId, x, order: 2 }),
  ];
