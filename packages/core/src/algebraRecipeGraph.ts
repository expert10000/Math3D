import { canonicalJsonStringify, createStableDocumentId, isStableDocumentId, isStructuralHash, structuralHash,
  type CanonicalJsonValue, type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { ALGEBRA_OPERATION_REGISTRY, buildAlgebraOperationRequest,
  type AlgebraBackend, type AlgebraOperationArguments, type AlgebraOperationRequest,
  type AlgebraOperationId } from "./algebraOperationRegistry";
import type { AlgebraObjectRef } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export const ALGEBRA_RECIPE_FORMAT = "math3d.algebra-recipe" as const;
export const ALGEBRA_RECIPE_SCHEMA_VERSION = 1 as const;
export const MAX_PROJECT_ALGEBRA_RECIPES = 32;
export const MAX_ALGEBRA_RECIPE_STAGES = 16;
export type AlgebraRecipeDependency = Readonly<{ stageId: string; outputSchema: string }>;
export type AlgebraRecipeStage = Readonly<{
  id: string; operation: AlgebraOperationId; backend: AlgebraBackend;
  target: AlgebraObjectRef; targetHash: StructuralHash;
  args: AlgebraOperationArguments[AlgebraOperationId]; outputSchema: string; requestHash: StructuralHash;
  dependsOn: readonly AlgebraRecipeDependency[];
}>;
export type AlgebraRecipeGraph = Readonly<{
  format: typeof ALGEBRA_RECIPE_FORMAT; schemaVersion: typeof ALGEBRA_RECIPE_SCHEMA_VERSION;
  id: StableDocumentId; projectId: StableDocumentId; title: string;
  stages: readonly AlgebraRecipeStage[];
}>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const stageId = (value: unknown): value is string => typeof value === "string" &&
  /^[a-z][a-z0-9_-]{0,39}$/.test(value);
const definition = (id: unknown) => ALGEBRA_OPERATION_REGISTRY.find((item) => item.id === id);
const boundedArgs = (value: unknown): boolean => {
  if (!object(value)) return false;
  try { return new TextEncoder().encode(canonicalJsonStringify(value)).length <= 8 * 1024; }
  catch { return false; }
};
const validatePinnedArguments = (projectId: StableDocumentId, objects: readonly ProjectAlgebraObjectEntry[],
  stage: AlgebraRecipeStage): AlgebraOperationRequest => {
  const byId = new Map(objects.map((entry) => [entry.id, entry]));
  const closure = new Map<StableDocumentId, ProjectAlgebraObjectEntry>();
  const visit = (ref: AlgebraObjectRef): void => {
    const entry = byId.get(ref.objectId), record = entry?.revisions[ref.revision - 1];
    if (!entry || !record) throw new TypeError(`Recipe stage ${stage.id} has a missing pinned object.`);
    const existing = closure.get(ref.objectId);
    if (existing && existing.revisions.length !== ref.revision)
      throw new TypeError(`Recipe stage ${stage.id} uses conflicting revisions of one object.`);
    if (existing) return;
    closure.set(ref.objectId, { id: entry.id, revisions: entry.revisions.slice(0, ref.revision), archived: false });
    for (const parent of record.dependencies) visit(parent);
  };
  visit(stage.target);
  if (stage.operation === "sage.algebra.inspectDomains") {
    const other = (stage.args as { other?: AlgebraObjectRef }).other;
    if (!other || !isStableDocumentId(other.objectId) || !Number.isSafeInteger(other.revision))
      throw new TypeError(`Recipe stage ${stage.id} requires a second pinned domain.`);
    visit(other);
  }
  // The bounded request builder reads only Project ID and algebra registry here.
  const snapshot = { identity: { id: projectId }, algebraObjects: [...closure.values()] } as unknown as Math3DProject;
  try { return buildAlgebraOperationRequest(snapshot, stage.target, stage.operation, stage.backend, stage.args); }
  catch (error) { throw new TypeError(`Recipe stage ${stage.id}: ${String((error as Error).message ?? error)}`); }
};

/** Strict graph import: only pinned Project objects, registered operations and typed acyclic edges. */
export const parseAlgebraRecipeGraph = (value: unknown, projectId: StableDocumentId,
  objects: readonly ProjectAlgebraObjectEntry[]): AlgebraRecipeGraph => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "id", "projectId", "title", "stages"]) ||
      value.format !== ALGEBRA_RECIPE_FORMAT || value.schemaVersion !== ALGEBRA_RECIPE_SCHEMA_VERSION ||
      !isStableDocumentId(value.id) || !value.id.startsWith("math3d:algebra-recipe:") ||
      value.projectId !== projectId || typeof value.title !== "string" ||
      value.title.trim() !== value.title || value.title.length < 1 || value.title.length > 160 ||
      !Array.isArray(value.stages) || value.stages.length < 1 || value.stages.length > MAX_ALGEBRA_RECIPE_STAGES) {
    throw new TypeError("Invalid algebra recipe envelope.");
  }
  const stages = value.stages.map((raw: unknown): AlgebraRecipeStage => {
    if (!object(raw) || !exact(raw, ["id", "operation", "backend", "target", "targetHash", "args", "outputSchema", "requestHash", "dependsOn"]) ||
        !stageId(raw.id) || !object(raw.target) || !exact(raw.target, ["objectId", "revision"]) ||
        !isStableDocumentId(raw.target.objectId) || !Number.isSafeInteger(raw.target.revision) ||
        (raw.target.revision as number) < 1 || !isStructuralHash(raw.targetHash) || !isStructuralHash(raw.requestHash) ||
        !boundedArgs(raw.args) || !Array.isArray(raw.dependsOn) || raw.dependsOn.length > MAX_ALGEBRA_RECIPE_STAGES) {
      throw new TypeError("Invalid algebra recipe stage.");
    }
    const operation = definition(raw.operation);
    const target = objects.find((entry) => entry.id === (raw.target as Record<string, unknown>).objectId)
      ?.revisions[(raw.target.revision as number) - 1];
    if (!operation || !operation.backends.includes(raw.backend as AlgebraBackend) ||
        raw.outputSchema !== operation.outputSchema || !target || target.contentHash !== raw.targetHash ||
        !operation.accepts.includes(target.kind)) throw new TypeError(`Recipe stage ${raw.id} has an invalid operation or pinned target.`);
    const dependencies = raw.dependsOn.map((item: unknown) => {
      if (!object(item) || !exact(item, ["stageId", "outputSchema"]) || !stageId(item.stageId) ||
          typeof item.outputSchema !== "string" || item.outputSchema.length > 160) {
        throw new TypeError(`Invalid dependency of recipe stage ${raw.id}.`);
      }
      return item as AlgebraRecipeDependency;
    });
    if (new Set(dependencies.map((item: AlgebraRecipeDependency) => item.stageId)).size !== dependencies.length)
      throw new TypeError(`Duplicate dependency of recipe stage ${raw.id}.`);
    return { id: raw.id, operation: operation.id, backend: raw.backend as AlgebraBackend,
      target: raw.target as AlgebraObjectRef, targetHash: raw.targetHash as StructuralHash,
      args: raw.args as AlgebraOperationArguments[AlgebraOperationId], outputSchema: operation.outputSchema,
      requestHash: raw.requestHash as StructuralHash,
      dependsOn: dependencies };
  });
  for (const stage of stages) if (structuralHash(validatePinnedArguments(projectId, objects, stage)) !== stage.requestHash)
    throw new TypeError(`Recipe stage ${stage.id} request hash does not match its pinned inputs.`);
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) throw new TypeError("Duplicate algebra recipe stage ID.");
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  for (const stage of stages) for (const edge of stage.dependsOn) {
    const parent = byId.get(edge.stageId);
    if (!parent || parent.outputSchema !== edge.outputSchema) {
      throw new TypeError(`Recipe stage ${stage.id} has a missing or incompatible dependency ${edge.stageId}.`);
    }
  }
  const visiting = new Set<string>(), visited = new Set<string>(), order: AlgebraRecipeStage[] = [];
  const visit = (stage: AlgebraRecipeStage): void => {
    if (visiting.has(stage.id)) throw new TypeError(`Cyclic algebra recipe dependency at ${stage.id}.`);
    if (visited.has(stage.id)) return;
    visiting.add(stage.id);
    for (const edge of stage.dependsOn) visit(byId.get(edge.stageId)!);
    visiting.delete(stage.id);
    visited.add(stage.id);
    order.push(stage);
  };
  for (const stage of stages) visit(stage);
  return JSON.parse(canonicalJsonStringify({ ...value, stages: order })) as AlgebraRecipeGraph;
};

/** Captures a reusable graph; every stage is preflighted against the current fresh Project object. */
export const createAlgebraRecipeGraph = (project: Math3DProject, stableKey: CanonicalJsonValue,
  title: string, stages: readonly Omit<AlgebraRecipeStage, "targetHash" | "outputSchema" | "requestHash">[]): AlgebraRecipeGraph => {
  const filled = stages.map((stage) => {
    const request = buildAlgebraOperationRequest(project, stage.target, stage.operation, stage.backend, stage.args);
    const target = project.algebraObjects?.find((entry) => entry.id === stage.target.objectId)
      ?.revisions[stage.target.revision - 1];
    if (!target) throw new TypeError("Recipe stage target is missing.");
    return { ...stage, targetHash: target.contentHash, outputSchema: request.outputSchema,
      requestHash: structuralHash(request) };
  });
  return parseAlgebraRecipeGraph({ format: ALGEBRA_RECIPE_FORMAT,
    schemaVersion: ALGEBRA_RECIPE_SCHEMA_VERSION,
    id: createStableDocumentId("algebra-recipe", { projectId: project.identity.id, stableKey }),
    projectId: project.identity.id, title, stages: filled }, project.identity.id, project.algebraObjects ?? []);
};

export const orderedAlgebraRecipeStages = (recipe: AlgebraRecipeGraph): readonly AlgebraRecipeStage[] => recipe.stages;
