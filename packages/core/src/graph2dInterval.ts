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
