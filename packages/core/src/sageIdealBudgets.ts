import { analyzeIdealGenerator } from "./algebraIdealGenerators";
import type { AlgebraMonomialOrder } from "./algebraObjects";

export type SageIdealBudgetProfile = "standard" | "expanded";
export type SageIdealBudget = Readonly<{ format: "math3d.sage-ideal-budget"; schemaVersion: 1;
  profile: SageIdealBudgetProfile; maxVariables: number; maxGenerators: number;
  maxDegree: number; maxTermsPerPolynomial: number; maxResultBytes: number; wallTimeMs: number }>;

export const SAGE_IDEAL_BUDGETS: Readonly<Record<SageIdealBudgetProfile, SageIdealBudget>> = Object.freeze({
  standard: Object.freeze({ format: "math3d.sage-ideal-budget", schemaVersion: 1, profile: "standard",
    maxVariables: 2, maxGenerators: 3, maxDegree: 8, maxTermsPerPolynomial: 48,
    maxResultBytes: 16_384, wallTimeMs: 15_000 }),
  expanded: Object.freeze({ format: "math3d.sage-ideal-budget", schemaVersion: 1, profile: "expanded",
    maxVariables: 3, maxGenerators: 6, maxDegree: 16, maxTermsPerPolynomial: 128,
    maxResultBytes: 65_536, wallTimeMs: 30_000 }),
});

export const parseSageIdealBudget = (value: unknown): SageIdealBudget => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Ideal budget must be a versioned profile object.");
  const candidate = value as Record<string, unknown>;
  const expected = candidate.profile === "standard" ? SAGE_IDEAL_BUDGETS.standard :
    candidate.profile === "expanded" ? SAGE_IDEAL_BUDGETS.expanded : null;
  if (!expected || Object.keys(candidate).sort().join("|") !== Object.keys(expected).sort().join("|") ||
      Object.entries(expected).some(([key, item]) => candidate[key] !== item))
    throw new TypeError("Ideal budget must match a supported bounded profile exactly.");
  return expected;
};

export type SageIdealCost = Readonly<{ maximumDegree: number; maximumTerms: number; variableCount: number;
  generatorCount: number; level: "ordinary" | "elevated"; warning: string }>;

/** Structural input signal, not a predicted runtime or mathematical complexity bound. */
export const assessSageIdealCost = (variables: readonly string[], generators: readonly string[],
  order: AlgebraMonomialOrder, polynomial?: string): SageIdealCost => {
  const metrics = [...generators, ...(polynomial ? [polynomial] : [])]
    .map((item) => analyzeIdealGenerator(item, variables));
  const maximumDegree = Math.max(0, ...metrics.map((item) => item.degreeUpperBound));
  const maximumTerms = Math.max(0, ...metrics.map((item) => item.termUpperBound));
  const elevated = variables.length > 2 || generators.length > 3 || maximumDegree > 6 ||
    maximumTerms > 24 || (order === "lex" && maximumDegree > 3);
  return Object.freeze({ maximumDegree, maximumTerms, variableCount: variables.length,
    generatorCount: generators.length, level: elevated ? "elevated" : "ordinary",
    warning: `${variables.length} variable(s), ${generators.length} generator(s), degree bound ${maximumDegree}, ` +
      `term bound ${maximumTerms}, ${order} order. ${elevated ? "Higher input cost; " : ""}` +
      "Gröbner-related runtime cannot be predicted from these counts." });
};

export const enforceSageIdealBudget = (budget: SageIdealBudget, variables: readonly string[],
  generators: readonly string[], order: AlgebraMonomialOrder, polynomial?: string): SageIdealCost => {
  const cost = assessSageIdealCost(variables, generators, order, polynomial);
  if (cost.variableCount > budget.maxVariables || cost.generatorCount > budget.maxGenerators ||
      cost.maximumDegree > budget.maxDegree || cost.maximumTerms > budget.maxTermsPerPolynomial)
    throw new TypeError(`${budget.profile} ideal budget exceeded: ${cost.warning}`);
  return cost;
};
