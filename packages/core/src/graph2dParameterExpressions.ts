import { evaluateGraph2DExpression, parseGraph2DExpression, type Graph2DExpressionNode } from "./graph2dExpression";
import { GRAPH2D_PARAMETER_LIMITS, isGraph2DParameter, type Graph2DParameter } from "./graph2dParameterTypes";

const symbols = (node: Graph2DExpressionNode, found: Set<string>): void => {
  switch (node.kind) {
    case "symbol": found.add(node.name); break;
    case "unary": symbols(node.operand, found); break;
    case "binary": symbols(node.left, found); symbols(node.right, found); break;
    case "call": symbols(node.argument, found); break;
  }
};

/** Evaluate a bounded acyclic parameter graph in dependency order, retaining authored order. */
export function resolveGraph2DParameterExpressions(variables: readonly Graph2DParameter[]): readonly Graph2DParameter[] {
  if (variables.length > GRAPH2D_PARAMETER_LIMITS.count || variables.some(value => !isGraph2DParameter(value)))
    throw new TypeError("Invalid Graphs parameters.");
  const byName = new Map(variables.map(value => [value.name, value]));
  if (byName.size !== variables.length) throw new TypeError("Duplicate Graphs parameter name.");
  const result = new Map<string, Graph2DParameter>();
  const visiting = new Set<string>();
  const visit = (name: string): number => {
    const cached = result.get(name); if (cached) return cached.value;
    const variable = byName.get(name);
    if (!variable) throw new TypeError(`Unknown parameter '${name}'.`);
    if (visiting.has(name)) throw new TypeError(`Parameter dependency cycle includes '${name}'.`);
    visiting.add(name);
    try {
      if (!variable.expression) { result.set(name, variable); return variable.value; }
      const parsed = parseGraph2DExpression(variable.expression, [...byName.keys()]);
      if (!parsed.ok) throw new TypeError(`Parameter ${name}: ${parsed.diagnostics[0]?.message ?? "invalid expression"}`);
      const dependencies = new Set<string>();
      symbols(parsed.ast.root, dependencies);
      const bindings: Record<string, number> = {};
      for (const dependency of dependencies) if (byName.has(dependency)) bindings[dependency] = visit(dependency);
      const evaluated = evaluateGraph2DExpression(parsed.ast, bindings, { maxEvaluations: 512 });
      if (!evaluated.ok) throw new TypeError(`Parameter ${name}: ${evaluated.diagnostic.message}`);
      if (Math.abs(evaluated.value) > GRAPH2D_PARAMETER_LIMITS.magnitude)
        throw new TypeError(`Parameter ${name} exceeds ±1e9.`);
      result.set(name, { ...variable, value: evaluated.value });
      return evaluated.value;
    } finally { visiting.delete(name); }
  };
  for (const variable of variables) visit(variable.name);
  return variables.map(variable => result.get(variable.name)!);
}

export function graph2DParameterExpressionsCurrent(variables: readonly Graph2DParameter[]): boolean {
  try {
    const resolved = resolveGraph2DParameterExpressions(variables);
    return variables.every((variable, index) => variable.expression === undefined ||
      Math.abs(variable.value - resolved[index]!.value) <= 1e-12 * Math.max(1, Math.abs(resolved[index]!.value)));
  } catch { return false; }
}
