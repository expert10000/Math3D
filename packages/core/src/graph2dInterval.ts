import type { Graph2DExpressionAst, Graph2DExpressionNode } from "./graph2dExpression";

type Interval = readonly [number, number];
const finite = (value: number) => Number.isFinite(value);
const widen = (lo: number, hi: number): Interval | null => {
  if (!finite(lo) || !finite(hi)) return null;
  const margin = 16 * Number.EPSILON * Math.max(1, Math.abs(lo), Math.abs(hi));
  return [lo - margin, hi + margin];
};
const multiply = (a: Interval, b: Interval): Interval | null => {
  const products = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return widen(Math.min(...products), Math.max(...products));
};

/** Conservative screen for the algebraic subset. Unsupported operations return null, never a false exclusion. */
export function graph2DExpressionInterval(ast: Graph2DExpressionAst, x: Interval, y: Interval,
  variables: Readonly<Record<string, number>> = {}): Interval | null {
  const walk = (node: Graph2DExpressionNode): Interval | null => {
    if (node.kind === "number") return [node.value, node.value];
    if (node.kind === "symbol") {
      if (node.name === "x") return x;
      if (node.name === "y") return y;
      const value = node.name === "pi" ? Math.PI : node.name === "tau" ? 2 * Math.PI :
        node.name === "e" ? Math.E : variables[node.name];
      return value !== undefined && finite(value) ? [value, value] : null;
    }
    if (node.kind === "unary") {
      const value = walk(node.operand);
      return !value ? null : node.operator === "-" ? widen(-value[1], -value[0]) : value;
    }
    if (node.kind === "call") {
      const value = walk(node.argument);
      if (!value) return null;
      if (node.functionName === "abs") return widen(value[0] <= 0 && value[1] >= 0 ? 0 :
        Math.min(Math.abs(value[0]), Math.abs(value[1])), Math.max(Math.abs(value[0]), Math.abs(value[1])));
      if (node.functionName === "sqrt" && value[0] >= 0) return widen(Math.sqrt(value[0]), Math.sqrt(value[1]));
      if (node.functionName === "exp") return widen(Math.exp(value[0]), Math.exp(value[1]));
      return null;
    }
    const a = walk(node.left), b = walk(node.right);
    if (!a || !b) return null;
    if (node.operator === "+") return widen(a[0] + b[0], a[1] + b[1]);
    if (node.operator === "-") return widen(a[0] - b[1], a[1] - b[0]);
    if (node.operator === "*") return multiply(a, b);
    if (node.operator === "/") return b[0] <= 0 && b[1] >= 0 ? null : multiply(a, [1 / b[1], 1 / b[0]]);
    if (node.operator === "^" && node.right.kind === "number" &&
        Number.isInteger(node.right.value) && node.right.value >= 0 && node.right.value <= 16) {
      const exponent = node.right.value;
      if (exponent === 0) return [1, 1];
      if (exponent % 2) return widen(a[0] ** exponent, a[1] ** exponent);
      return widen(a[0] <= 0 && a[1] >= 0 ? 0 :
        Math.min(a[0] ** exponent, a[1] ** exponent), Math.max(a[0] ** exponent, a[1] ** exponent));
    }
    return null;
  };
  return walk(ast.root);
}

/** Flags domain boundaries that interval arithmetic can locate even when point samples miss them. */
export function graph2DExpressionPossibleDomainBoundary(ast: Graph2DExpressionAst, x: Interval,
  variables: Readonly<Record<string, number>> = {}): boolean {
  const bound = (node: Graph2DExpressionNode) =>
    graph2DExpressionInterval({ ...ast, root: node }, x, [0, 0], variables);
  const crossesTanPole = (range: Interval): boolean => {
    const first = Math.ceil((range[0] - Math.PI / 2) / Math.PI);
    return Math.PI / 2 + first * Math.PI <= range[1];
  };
  const crossesSinZero = (range: Interval): boolean =>
    Math.ceil(range[0] / Math.PI) * Math.PI <= range[1];
  const visit = (node: Graph2DExpressionNode): boolean => {
    if (node.kind === "unary") return visit(node.operand);
    if (node.kind === "call") {
      const argument = bound(node.argument);
      if (argument && ((node.functionName === "sqrt" && argument[0] < 0) ||
          (["ln", "log", "log2"].includes(node.functionName) && argument[0] <= 0) ||
          (["asin", "acos"].includes(node.functionName) &&
            (argument[0] < -1 || argument[1] > 1)) ||
          (node.functionName === "acosh" && argument[0] < 1) ||
          (node.functionName === "atanh" && (argument[0] <= -1 || argument[1] >= 1)) ||
          (["tan", "sec"].includes(node.functionName) && crossesTanPole(argument)) ||
          (["csc", "cot"].includes(node.functionName) && crossesSinZero(argument)))) return true;
      return visit(node.argument);
    }
    if (node.kind !== "binary") return false;
    const denominator = node.operator === "/" ? bound(node.right) : null;
    if (denominator && denominator[0] <= 0 && denominator[1] >= 0) return true;
    const exponent = node.operator === "^" && node.right.kind === "number" ? node.right.value : null;
    const base = exponent === null ? null : bound(node.left);
    if (base && exponent !== null && (exponent < 0 && base[0] <= 0 && base[1] >= 0 ||
        !Number.isInteger(exponent) && base[0] < 0)) return true;
    return visit(node.left) || visit(node.right);
  };
  return visit(ast.root);
}
