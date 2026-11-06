import { useEffect, useRef, useState } from "react";
import { ALGEBRA_OPERATION_REGISTRY, GCD_SWEEP_GLOBAL_BUDGET_MS, MAX_GCD_SWEEP_RUNS,
  algebraOperationsFor, createGcdParameterSweepRecipe, isGcdParameterSweepRecipe,
  startAlgebraRecipeRun, structuralHash,
  type AlgebraObjectRef, type AlgebraRecipeGraph, type AlgebraRecipeRunProgress,
  type Math3DProject, type ProjectAlgebraEvidence } from "@math3d/core";
import { sageExecutionRegistry } from "../../services/sageOperationExecution";
import { createSageRecipeStarter } from "./sageRecipeStarter";

type Props = { project: Math3DProject | null; target: AlgebraObjectRef | null;
  onSaveRecipe: (recipe: AlgebraRecipeGraph) => void | Promise<void>;
  onAppendEvidence: (base: Math3DProject, evidence: ProjectAlgebraEvidence) => Math3DProject | Promise<Math3DProject>;
  onInspectEvidence: (id: string) => void;
  requestedRecipe?: Readonly<{ id: string | null; token: number }> | null };
const operationLabel = (id: string) => ALGEBRA_OPERATION_REGISTRY.find((item) => item.id === id)?.label ?? id;

export default function SageRecipes({ project, target, onSaveRecipe, onAppendEvidence,
  onInspectEvidence, requestedRecipe }: Props) {
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<AlgebraRecipeRunProgress | null>(null);
  const [message, setMessage] = useState("");
  const [routes, setRoutes] = useState<readonly { backend: "docker" | "private"; available: boolean;
    operations: readonly string[]; reason?: string }[]>([]);
  const [checking, setChecking] = useState(false);
  const [sweepRows, setSweepRows] = useState("84,30\n35,15\n17,13");
  const active = useRef<{ cancel: () => void } | null>(null);
  const generation = useRef(0);
  const refresh = async () => {
    setChecking(true);
    try {
      const probes = await Promise.all([sageExecutionRegistry.probeBackend("docker"),
        sageExecutionRegistry.probeBackend("private")]);
      setRoutes(probes.map((probe) => ({ backend: probe.backend as "docker" | "private",
        available: probe.health.available, operations: probe.operations.map((item) => item.operationType),
        reason: probe.health.status })));
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
    finally { setChecking(false); }
  };
  useEffect(() => { void refresh(); return () => { generation.current += 1; active.current?.cancel(); }; }, []);
  useEffect(() => { generation.current += 1; active.current?.cancel(); active.current = null;
    setRecipeId(null); setProgress(null); setMessage("");
  }, [project?.identity.id, target?.objectId, target?.revision]);
  useEffect(() => { if (requestedRecipe) { setRecipeId(requestedRecipe.id); setProgress(null); setMessage(""); }
  }, [requestedRecipe?.token]);
  if (!project || !target) return <section data-testid="cas-recipes" role="status" style={{ fontSize: 12 }}>
    Select a saved structure to create or run a recipe.</section>;
  const recipes = (project.algebraRecipes ?? []).filter((item) => item.stages.some((stage) =>
    stage.target.objectId === target.objectId));
  const selected = recipes.find((item) => item.id === recipeId) ?? recipes[0];
  const stageAvailability = (stage: AlgebraRecipeGraph["stages"][number]) =>
    algebraOperationsFor(project, stage.target, routes).find((entry) => entry.definition.id === stage.operation);
  const unavailable = selected?.stages.find((stage) => {
    const item = stageAvailability(stage);
    return !item?.eligible || item.readyBackend !== stage.backend;
  });
  const unavailableReason = unavailable ? (() => {
    const item = stageAvailability(unavailable);
    return `${unavailable.id}: ${item?.reason ?? item?.runtimeReason ?? "Required Sage route unavailable."}`;
  })() : null;
  const create = async () => {
    setMessage("");
    try {
      const recipe = createSageRecipeStarter(project, target);
      await onSaveRecipe(recipe);
      setRecipeId(recipe.id);
      setMessage(`Saved ${recipe.title} in Project.`);
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
  };
  const createSweep = async () => {
    setMessage("");
    try {
      const rows = sweepRows.trim().split(/\r?\n/);
      if (rows.length > MAX_GCD_SWEEP_RUNS) throw new TypeError(`At most ${MAX_GCD_SWEEP_RUNS} sweep rows are allowed.`);
      const pairs = rows.map((row) => row.split(",").map((value) => value.trim()) as [string, string]);
      const backend = routes.find((route) => route.available && route.operations.includes("sage.numberTheory.gcd"))?.backend ?? "docker";
      const recipe = createGcdParameterSweepRecipe(project, target, pairs, backend);
      await onSaveRecipe(recipe);
      setRecipeId(recipe.id);
      setMessage(`Saved ${recipe.title} in Project. Run it explicitly when the Sage route is ready.`);
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
  };
  const run = async () => {
    if (!selected || unavailable || active.current) return;
    setMessage(""); setProgress(null);
    const token = ++generation.current;
    try {
      const job = startAlgebraRecipeRun(project, selected, (request) => {
        const handle = sageExecutionRegistry.run({ operation: request.operation,
          params: request.params, backend: request.backend });
        return { jobId: handle.jobId, cancel: () => { handle.cancel(); },
          promise: handle.promise.then(({ response, broker }) => ({ ...response,
            success: broker.ok && response.success })) };
      }, onAppendEvidence, (next) => { if (token === generation.current) setProgress(next); },
      isGcdParameterSweepRecipe(selected) ? { globalWallTimeMs: GCD_SWEEP_GLOBAL_BUDGET_MS } : undefined);
      active.current = job;
      const completed = await job.promise;
      if (token !== generation.current) return;
      const latestEvidence = [...completed.progress.stages].reverse().find((item) => item.evidenceId)?.evidenceId;
      if (latestEvidence) onInspectEvidence(latestEvidence);
      setMessage(completed.progress.status === "complete" ? "Recipe complete; every stage saved." :
        completed.progress.status === "cancelled" ? "Recipe cancelled; completed evidence was retained." :
          "Recipe partially completed; successful stage evidence was retained.");
    } catch (error) { if (token === generation.current) setMessage(String((error as Error).message ?? error)); }
    finally { if (token === generation.current) active.current = null; }
  };
  return <section data-testid="cas-recipes" style={{ display: "grid", gap: 10, fontSize: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Project recipes</h2>
      <button type="button" onClick={() => { void refresh(); }} disabled={checking || !!active.current}>Refresh runtimes</button>
    </div>
    <div>Recipes pin exact structure revisions and run bounded stages in dependency order.</div>
    <button type="button" onClick={() => { void create(); }} disabled={!!active.current}>
      Create and save starter for selected structure</button>
    {project.algebraObjects?.find((entry) => entry.id === target.objectId)?.revisions[target.revision - 1]?.kind === "integer-ring" &&
      <div data-testid="cas-gcd-sweep" style={{ border: "1px solid #dbe2ea", borderRadius: 7, padding: 9 }}>
        <strong>GCD parameter sweep</strong>
        <p>Enter one integer pair per line. Up to {MAX_GCD_SWEEP_RUNS} runs share a {GCD_SWEEP_GLOBAL_BUDGET_MS / 1000}s wall-time budget. The saved recipe pins this ZZ revision and exact inputs.</p>
        <textarea aria-label="GCD sweep parameter pairs" value={sweepRows}
          onChange={(event) => setSweepRows(event.target.value)} rows={4} style={{ width: "100%" }} />
        <button type="button" disabled={!!active.current} onClick={() => { void createSweep(); }}>Save GCD sweep recipe</button>
      </div>}
    {recipes.length > 0 && <label>Saved recipe
      <select aria-label="Saved recipe" value={selected?.id ?? ""} onChange={(event) => { setRecipeId(event.target.value);
        setProgress(null); setMessage(""); }} style={{ display: "block", width: "100%" }}>
        {recipes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>}
    {selected && <div data-testid="cas-recipe-stages" style={{ display: "grid", gap: 6 }}>
      {selected.stages.map((stage) => {
        const state = progress?.stages.find((item) => item.stageId === stage.id);
        const retained = (project.algebraEvidence ?? []).filter((item) => structuralHash(item.request) === stage.requestHash);
        return <div key={stage.id} style={{ border: "1px solid #dbe2ea", borderRadius: 7, padding: 7 }}>
          <strong>{stage.id}: {operationLabel(stage.operation)}</strong>
          <div>Depends on: {stage.dependsOn.length ? stage.dependsOn.map((edge) => edge.stageId).join(", ") : "none"}</div>
          <div>{state?.status ?? "ready"}{state?.reason ? ` · ${state.reason}` : ""}</div>
          <div>Retained evidence: {retained.length}</div>
          {state?.evidenceId && <button type="button" onClick={() => onInspectEvidence(state.evidenceId!)}>Inspect evidence</button>}
          {!state?.evidenceId && retained.length > 0 && <button type="button"
            onClick={() => onInspectEvidence(retained[retained.length - 1].id)}>Inspect retained evidence</button>}
        </div>;
      })}
    </div>}
    {selected && isGcdParameterSweepRecipe(selected) && <div data-testid="cas-gcd-sweep-results">
      <strong>Sweep results</strong>
      <table><thead><tr><th>Run</th><th>Inputs</th><th>Result</th></tr></thead><tbody>
        {selected.stages.map((stage) => {
          const evidence = (project.algebraEvidence ?? []).filter((item) => structuralHash(item.request) === stage.requestHash).at(-1);
          const state = progress?.stages.find((item) => item.stageId === stage.id);
          return <tr key={stage.id}><td>{stage.id}</td><td>{(stage.args as { values: readonly string[] }).values.join(", ")}</td>
            <td>{evidence ? JSON.stringify(evidence.result) : state?.status ?? "not run"}</td></tr>;
        })}</tbody></table>
      <div>{selected.stages.filter((stage) => (project.algebraEvidence ?? []).some((item) => structuralHash(item.request) === stage.requestHash)).length}
        /{selected.stages.length} saved results</div>
    </div>}
    {unavailableReason && <div role="status" style={{ color: "#9a3412" }}>{unavailableReason}</div>}
    {selected && <div><button type="button" onClick={() => { void run(); }} disabled={!!active.current || !!unavailableReason}>
      Run saved recipe</button>
      {active.current && <button type="button" onClick={() => active.current?.cancel()}>Cancel recipe</button>}</div>}
    {message && <div role="status" data-testid="cas-recipe-status">{message}</div>}
  </section>;
}
