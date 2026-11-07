import { createAlgebraRecipeGraph, type AlgebraRecipeGraph } from "./algebraRecipeGraph";
import type { AlgebraBackend } from "./algebraOperationRegistry";
import type { AlgebraObjectRef } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";

export const MAX_GCD_SWEEP_RUNS = 8;
export const GCD_SWEEP_GLOBAL_BUDGET_MS = 30_000;
export type GcdSweepPair = readonly [string, string];

/** Captures a repeatable, Project-pinned recipe. No imported recipe executes automatically. */
export const createGcdParameterSweepRecipe = (project: Math3DProject, target: AlgebraObjectRef,
  pairs: readonly GcdSweepPair[], backend: AlgebraBackend): AlgebraRecipeGraph => {
  if (pairs.length < 1 || pairs.length > MAX_GCD_SWEEP_RUNS)
    throw new TypeError(`A GCD sweep needs 1–${MAX_GCD_SWEEP_RUNS} parameter pairs.`);
  const canonical = pairs.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((value) =>
      typeof value !== "string" || !/^-?(0|[1-9][0-9]{0,79})$/.test(value)))
      throw new TypeError("Each GCD sweep row needs two canonical integers of at most 80 digits.");
    return [pair[0], pair[1]] as const;
  });
  return createAlgebraRecipeGraph(project, { kind: "gcd-parameter-sweep", target, canonical, backend,
    globalBudgetMs: GCD_SWEEP_GLOBAL_BUDGET_MS },
  `GCD parameter sweep (${canonical.length} runs, ${GCD_SWEEP_GLOBAL_BUDGET_MS / 1000}s global budget)`,
  canonical.map((values, index) => ({ id: `sweep-${String(index + 1).padStart(2, "0")}`,
    operation: "sage.numberTheory.gcd" as const, backend, target, args: { values }, dependsOn: [] })));
};

export const isGcdParameterSweepRecipe = (recipe: AlgebraRecipeGraph): boolean =>
  recipe.title.startsWith("GCD parameter sweep (") && recipe.stages.length >= 1 &&
  recipe.stages.length <= MAX_GCD_SWEEP_RUNS && recipe.stages.every((stage, index) =>
    stage.id === `sweep-${String(index + 1).padStart(2, "0")}` &&
    stage.operation === "sage.numberTheory.gcd" && stage.dependsOn.length === 0);
