import { buildAlgebraOperationRequest, type AlgebraOperationRequest } from "./algebraOperationRegistry";
import { parseAlgebraRecipeGraph, type AlgebraRecipeGraph } from "./algebraRecipeGraph";
import { createProjectAlgebraEvidence, type ProjectAlgebraEvidence } from "./projectAlgebraEvidence";
import { structuralHash } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";

export type AlgebraRecipeStageStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
export type AlgebraRecipeStageProgress = Readonly<{ stageId: string; status: AlgebraRecipeStageStatus;
  evidenceId?: string; reason?: string }>;
export type AlgebraRecipeRunProgress = Readonly<{ recipeId: string;
  status: "running" | "complete" | "partial" | "cancelled";
  stages: readonly AlgebraRecipeStageProgress[] }>;
export type AlgebraRecipeExecutionResponse = Readonly<{
  success: boolean; engine: string; engineVersion?: string; operation: string;
  result: unknown; warnings: readonly string[]; elapsedMs?: number; error?: string;
}>;
export type AlgebraRecipeStageHandle = Readonly<{ jobId: string;
  promise: Promise<AlgebraRecipeExecutionResponse>; cancel: () => void }>;
export type AlgebraRecipeExecutor = (request: AlgebraOperationRequest) => AlgebraRecipeStageHandle;
export type AlgebraRecipeEvidenceSaver = (base: Math3DProject,
  evidence: ProjectAlgebraEvidence) => Promise<Math3DProject> | Math3DProject;

/** Sequential bounded DAG execution. Independent branches continue after a failure; descendants skip. */
export const startAlgebraRecipeRun = (project: Math3DProject, recipe: AlgebraRecipeGraph,
  execute: AlgebraRecipeExecutor, saveEvidence: AlgebraRecipeEvidenceSaver,
  onProgress?: (progress: AlgebraRecipeRunProgress) => void,
  options?: Readonly<{ globalWallTimeMs: number }>): Readonly<{
    promise: Promise<{ project: Math3DProject; progress: AlgebraRecipeRunProgress }>;
    cancel: () => void;
  }> => {
  const graph = parseAlgebraRecipeGraph(recipe, project.identity.id, project.algebraObjects ?? []);
  const progress = new Map<string, AlgebraRecipeStageProgress>(graph.stages.map((stage) => [stage.id,
    { stageId: stage.id, status: "pending" as AlgebraRecipeStageStatus }]));
  let cancelled = false, active: AlgebraRecipeStageHandle | null = null;
  if (options && (!Number.isSafeInteger(options.globalWallTimeMs) || options.globalWallTimeMs < 1 ||
      options.globalWallTimeMs > 120_000)) throw new TypeError("Invalid recipe global time budget.");
  let budgetExpired = false;
  const budgetTimer = options ? setTimeout(() => {
    budgetExpired = true; cancelled = true; active?.cancel();
  }, options.globalWallTimeMs) : null;
  let state: AlgebraRecipeRunProgress["status"] = "running";
  const snapshot = (): AlgebraRecipeRunProgress => ({ recipeId: graph.id, status: state,
    stages: graph.stages.map((stage) => ({ ...progress.get(stage.id)! })) });
  const publish = () => { onProgress?.(snapshot()); };
  const promise = (async () => {
    let working = project, saveFailed = false;
    publish();
    for (const stage of graph.stages) {
      if (cancelled) { progress.set(stage.id, { stageId: stage.id, status: "cancelled",
        reason: budgetExpired ? "Global operation budget exhausted." : undefined }); publish(); continue; }
      const blocked = stage.dependsOn.find((edge) => progress.get(edge.stageId)?.status !== "completed");
      if (blocked || saveFailed) {
        progress.set(stage.id, { stageId: stage.id, status: "skipped",
          reason: saveFailed ? "Project evidence could not be saved." : `Dependency ${blocked!.stageId} did not complete.` });
        publish();
        continue;
      }
      try {
        const request = buildAlgebraOperationRequest(working, stage.target, stage.operation, stage.backend, stage.args);
        if (request.outputSchema !== stage.outputSchema || structuralHash(request) !== stage.requestHash)
          throw new TypeError("Recipe stage request no longer matches its pinned inputs.");
        active = execute(request);
        progress.set(stage.id, { stageId: stage.id, status: "running" });
        publish();
        const response = await active.promise;
        if (cancelled) { progress.set(stage.id, { stageId: stage.id, status: "cancelled",
          reason: budgetExpired ? "Global operation budget exhausted." : undefined }); publish(); continue; }
        if (!response.success) throw new Error(response.error ?? "Sage recipe stage failed.");
        if (response.engine !== "sagemath" || response.operation !== request.operation || !response.engineVersion)
          throw new TypeError("Sage recipe response lacks matching versioned provenance.");
        const evidence = createProjectAlgebraEvidence(working.identity.id, working.algebraObjects ?? [], request,
          response.result, { engine: "sagemath", version: response.engineVersion, backend: request.backend,
            jobId: active.jobId, elapsedMs: response.elapsedMs ?? 0, warnings: [...response.warnings] });
        try { working = await saveEvidence(working, evidence); }
        catch (error) { saveFailed = true; throw error; }
        progress.set(stage.id, { stageId: stage.id, status: "completed", evidenceId: evidence.id });
      } catch (error) {
        progress.set(stage.id, { stageId: stage.id, status: cancelled ? "cancelled" : "failed",
          reason: budgetExpired ? "Global operation budget exhausted." : String((error as Error).message ?? error) });
      } finally { active = null; publish(); }
    }
    state = cancelled ? "cancelled" : [...progress.values()].every((item) => item.status === "completed")
      ? "complete" : "partial";
    publish();
    if (budgetTimer !== null) clearTimeout(budgetTimer);
    return { project: working, progress: snapshot() };
  })();
  return { promise, cancel: () => { cancelled = true; active?.cancel(); } };
};
