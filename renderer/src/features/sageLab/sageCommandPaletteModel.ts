import { algebraOperationsFor, inspectProjectAlgebraFreshness, type AlgebraObjectRef, type AlgebraOperationId,
  type AlgebraRouteCapability, type Math3DProject } from "@math3d/core";

export type SagePaletteAction =
  | Readonly<{ kind: "operation"; id: AlgebraOperationId }>
  | Readonly<{ kind: "recipe"; id: string | null }>
  | Readonly<{ kind: "tangent" }>
  | Readonly<{ kind: "runtimes" }>;
export type SagePaletteCommand = Readonly<{ key: string; label: string; group: string;
  search: string; enabled: boolean; reason: string | null; action: SagePaletteAction }>;

const aliases: Partial<Record<AlgebraOperationId, string>> = {
  "sage.matrix.integer_forms": "smith hermite smith normal form integer matrix",
  "sage.numberField.primeDecomposition": "prime decomposition factor prime ideals",
  "sage.ideal.primaryDecomposition": "primary decomposition associated primes",
  "sage.polynomial.factor": "factor over qq factor polynomial",
  "sage.ideal.membership": "normal form ideal member",
};
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const sagePaletteCommands = (project: Math3DProject | null, target: AlgebraObjectRef | null,
  routes: readonly AlgebraRouteCapability[], locusAvailable: boolean): readonly SagePaletteCommand[] => {
  const commands: SagePaletteCommand[] = [];
  const entry = project?.algebraObjects?.find((item) => item.id === target?.objectId);
  const record = target && entry?.revisions[target.revision - 1];
  if (project && target && record) {
    for (const item of algebraOperationsFor(project, target, routes)) {
      if (!item.definition.accepts.includes(record.kind) ||
          item.definition.id === "sage.numberTheory.padic" ||
          item.definition.id === "sage.numberField.localExtensions") continue;
      const reason = item.reason ?? item.runtimeReason;
      commands.push({ key: item.definition.id, label: item.definition.label,
        group: "Object operation", search: normalize(`${item.definition.label} ${item.definition.id} ${aliases[item.definition.id] ?? ""}`),
        enabled: !!item.readyBackend, reason, action: { kind: "operation", id: item.definition.id } });
    }
    const current = target.revision === entry!.revisions.length && !entry!.archived &&
      inspectProjectAlgebraFreshness(project).find((item) => item.objectId === target.objectId)?.status !== "stale";
    commands.push({ key: "recipe-starter", label: "Open recipe starter for selected structure", group: "Recipe",
      search: normalize("create recipe starter workflow graph"), enabled: current,
      reason: current ? null : "Select a current, unarchived structure revision for a new recipe.",
      action: { kind: "recipe", id: null } });
    for (const recipe of project.algebraRecipes ?? []) if (recipe.stages.some((stage) =>
      stage.target.objectId === target.objectId)) {
      const unavailable = recipe.stages.map((stage) => ({ stage,
        availability: algebraOperationsFor(project, stage.target, routes)
          .find((item) => item.definition.id === stage.operation) })).find(({ stage, availability }) =>
            !availability?.eligible || availability.readyBackend !== stage.backend);
      const reason = unavailable ? `${unavailable.stage.id}: ${unavailable.availability?.reason ??
        unavailable.availability?.runtimeReason ?? "Required Sage route unavailable."}` : null;
      commands.push({ key: `recipe:${recipe.id}`, label: recipe.title, group: "Saved recipe",
        search: normalize(`${recipe.title} recipe ${recipe.stages.map((stage) => stage.operation).join(" ")}`),
        enabled: !reason, reason, action: { kind: "recipe", id: recipe.id } });
    }
    if (record.kind === "ideal" || record.kind === "polynomial-ring")
      commands.push({ key: "tangent-cone", label: "Show tangent-cone workspace", group: "Geometry",
        search: normalize("show tangent cone singular locus inspect tangent"), enabled: locusAvailable,
        reason: locusAvailable ? null : "The real-locus and tangent-scene handoff is unavailable in this workspace.",
        action: { kind: "tangent" } });
  }
  commands.push({ key: "runtimes", label: "Inspect Sage runtimes", group: "Workspace",
    search: normalize("inspect sage runtimes capabilities backend"), enabled: true, reason: null,
    action: { kind: "runtimes" } });
  return commands;
};

export const searchSagePaletteCommands = (commands: readonly SagePaletteCommand[], query: string): readonly SagePaletteCommand[] => {
  const terms = normalize(query).split(" ").filter(Boolean);
  return commands.filter((command) => terms.every((term) => command.search.includes(term)))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.label.localeCompare(b.label));
};
