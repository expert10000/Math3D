import { useEffect, useRef, useState } from "react";
import { algebraOperationsFor, buildAlgebraOperationRequest, createProjectAlgebraEvidence,
  inspectProjectAlgebraFreshness,
  type AlgebraObjectRef, type AlgebraOperationArguments, type AlgebraOperationId,
  type AlgebraRouteCapability, type Math3DProject, type ProjectAlgebraEvidence } from "@math3d/core";
import { sageExecutionRegistry, type SageOperationHandle } from "../../services/sageOperationExecution";

type Props = { project: Math3DProject | null; target: AlgebraObjectRef | null;
  onSaveEvidence: (evidence: ProjectAlgebraEvidence) => void | Promise<void>;
  selectedEvidenceId: string | null; onInspectEvidence: (id: string) => void };
const field = { width: "100%", boxSizing: "border-box" as const, padding: 6, fontSize: 12 };
const parseArguments = (id: AlgebraOperationId, text: string, other: AlgebraObjectRef):
  AlgebraOperationArguments[AlgebraOperationId] => {
  if (id === "sage.algebra.reconstruct") return {};
  if (id === "sage.ideal.groebner" || id === "sage.ideal.quotientDimension" ||
      id === "sage.ideal.syzygies" || id === "sage.ideal.hilbertSeries") return {};
  if (id === "sage.ideal.eliminate") return { eliminate: text.split(",").map((item) => item.trim()) };
  if (id === "sage.ideal.membership") return { polynomial: text.trim() };
  if (id === "sage.algebra.inspectDomains") return { other };
  if (id === "sage.numberTheory.gcd") return { values: text.split(",").map((item) => item.trim()) };
  if (id === "sage.numberTheory.modInverse") return { a: text.trim() };
  if (id === "sage.groebner.compute") return { polynomials: text.split(/\r?\n/).map((item) => item.trim()) };
  if (id === "sage.matrix.linear_dossier" || id === "sage.matrix.integer_forms") return {
    matrix: text.trim().split(/\r?\n/).map((row) => row.split(",").map((cell) => cell.trim())) };
  return { polynomial: text.trim() };
};

export default function SageObjectOperations({ project, target, onSaveEvidence, selectedEvidenceId,
  onInspectEvidence }: Props) {
  const [routes, setRoutes] = useState<readonly AlgebraRouteCapability[]>([]);
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<AlgebraOperationId | null>(null);
  const [input, setInput] = useState("");
  const [otherId, setOtherId] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef<SageOperationHandle | null>(null);
  const generation = useRef(0);
  const refresh = async () => {
    setChecking(true);
    try {
      const probes = await Promise.all([sageExecutionRegistry.probeBackend("docker"),
        sageExecutionRegistry.probeBackend("private")]);
      setRoutes(probes.map((probe) => ({ backend: probe.backend as "docker" | "private",
        available: probe.health.available, operations: probe.operations.map((item) => item.operationType),
        reason: probe.health.available ? undefined : probe.health.status })));
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
    finally { setChecking(false); }
  };
  useEffect(() => { void refresh(); return () => { generation.current += 1; active.current?.cancel(); }; }, []);
  useEffect(() => { generation.current += 1; active.current?.cancel(); active.current = null;
    setRunning(false); setSelected(null); setInput(""); setMessage("");
  }, [project?.identity.id, target?.objectId, target?.revision]);
  if (!project || !target) return <section data-testid="cas-object-operations" role="status" style={{ fontSize: 12 }}>
    Select a saved structure to see compatible object operations.</section>;
  const operations = algebraOperationsFor(project, target, routes);
  const current = operations.find((item) => item.definition.id === selected);
  const otherOptions = (project.algebraObjects ?? []).filter((entry) => !entry.archived).map((entry) => ({
    id: entry.id, record: entry.revisions[entry.revisions.length - 1] }));
  const other = otherOptions.find((item) => item.id === otherId) ?? otherOptions[0];
  const saved = (project.algebraEvidence ?? []).filter((item) => item.request.target.objectId === target.objectId);
  const targetStale = inspectProjectAlgebraFreshness(project).find((item) => item.objectId === target.objectId)?.status === "stale";
  const run = async () => {
    if (!current?.readyBackend || !other) return;
    setMessage("");
    const token = ++generation.current;
    try {
      const request = buildAlgebraOperationRequest(project, target, current.definition.id,
        current.readyBackend, parseArguments(current.definition.id, input, {
          objectId: other.id, revision: other.record.revision }));
      const handle = sageExecutionRegistry.run({ operation: request.operation, params: request.params,
        backend: request.backend });
      active.current = handle;
      setRunning(true);
      const { response, broker } = await handle.promise;
      if (token !== generation.current) return;
      if (!broker.ok || !response.success) throw new Error(response.error ?? "Sage operation failed.");
      if (response.engine !== "sagemath" || response.operation !== request.operation || !response.engineVersion)
        throw new Error("Sage response lacks matching operation and version provenance.");
      const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects ?? [], request,
        response.result, { engine: "sagemath", version: response.engineVersion, backend: request.backend,
          jobId: handle.jobId, elapsedMs: response.elapsedMs ?? 0, warnings: response.warnings });
      await onSaveEvidence(evidence);
      if (token === generation.current) setMessage(`Saved ${current.definition.label} evidence to Project (${handle.jobId}).`);
    } catch (error) { if (token === generation.current) setMessage(String((error as Error).message ?? error)); }
    finally { if (token === generation.current) { active.current = null; setRunning(false); } }
  };
  return <section data-testid="cas-object-operations" style={{ display: "grid", gap: 8, fontSize: 12,
    border: "1px solid #dbe2ea", borderRadius: 8, padding: 10, marginBottom: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <strong>Selected-object operations</strong>
      <button type="button" onClick={() => { void refresh(); }} disabled={checking || running} style={{ fontSize: 11 }}>Refresh</button>
    </div>
    <div style={{ color: "#64748b", fontSize: 11 }}>Results are pinned to this structure revision and saved in the Project.</div>
    {routes.length > 0 && <div data-testid="cas-object-runtime-status" role="status" style={{ color: "#64748b", fontSize: 11 }}>
      {routes.map((route) => `${route.backend}: ${route.available ? "available" : route.reason ?? "unavailable"}`).join(" · ")}
    </div>}
    {operations.map((item) => <div key={item.definition.id} data-testid={`cas-object-operation-${item.definition.id}`}
      style={{ display: "grid", gap: 2, borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
      <button type="button" disabled={!item.readyBackend || running} title={item.reason ?? item.runtimeReason ?? undefined}
        aria-label={`Select ${item.definition.label}`} onClick={() => { setSelected(item.definition.id); setInput(""); setMessage(""); }}
        style={{ textAlign: "left", fontWeight: 600 }}>{item.definition.label}</button>
      <span style={{ color: item.readyBackend ? "#16703b" : "#9a3412", fontSize: 11 }}>
        {item.readyBackend ? `${item.readyBackend} route ready` : item.reason ?? item.runtimeReason}
      </span>
    </div>)}
    {current?.readyBackend && <div data-testid="cas-object-run-controls" style={{ display: "grid", gap: 7 }}>
      <strong>{current.definition.label} · {target.objectId}@{target.revision}</strong>
      {selected === "sage.algebra.inspectDomains" && <label>Other structure
        <select style={field} value={other?.id ?? ""} onChange={(event) => setOtherId(event.target.value)}>
          {otherOptions.map((item) => <option key={item.id} value={item.id}>{item.record.label}@{item.record.revision}</option>)}
        </select></label>}
      {selected !== "sage.algebra.reconstruct" && selected !== "sage.algebra.inspectDomains" &&
        selected !== "sage.ideal.groebner" && selected !== "sage.ideal.quotientDimension" &&
        selected !== "sage.ideal.syzygies" && selected !== "sage.ideal.hilbertSeries" &&
        <label>{selected === "sage.ideal.eliminate" ? "Variables to eliminate, comma separated" :
          selected === "sage.ideal.membership" ? "Polynomial to test" :
          selected === "sage.numberTheory.gcd" ? "Integers, comma separated" :
          selected === "sage.numberTheory.modInverse" ? "Integer to invert" :
          selected?.startsWith("sage.matrix.") ? "Matrix: comma separated rows, one row per line" :
          selected === "sage.groebner.compute" ? "Polynomials, one per line" : "Polynomial"}
          {selected?.startsWith("sage.matrix.") || selected === "sage.groebner.compute" ?
            <textarea style={field} rows={4} value={input} onChange={(event) => setInput(event.target.value)} /> :
            <input style={field} value={input} onChange={(event) => setInput(event.target.value)} />}
        </label>}
      <div><button type="button" disabled={running} onClick={() => { void run(); }}>Run and save evidence</button>
        {running && <button type="button" onClick={() => { generation.current += 1; active.current?.cancel(); active.current = null;
          setRunning(false); setMessage("Operation cancelled."); }}>Cancel</button>}</div>
    </div>}
    {message && <div role="status" data-testid="cas-object-run-status">{message}</div>}
    <div><strong>Saved evidence for this structure ({saved.length})</strong>
      <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 4 }}>
      {saved.map((item) => <div key={item.id} style={{ borderTop: "1px solid #e2e8f0", padding: 6 }}>
        {item.request.operation} · revision {item.request.target.revision} · Sage {item.runtime.version} · {item.runtime.backend}
        {item.request.target.revision !== target.revision ? " · historical revision"
          : targetStale ? " · stale parent definition" : ""}
        <div><button type="button" aria-current={selectedEvidenceId === item.id} onClick={() => onInspectEvidence(item.id)}>
          Inspect saved result</button></div>
      </div>)}
      </div>
    </div>
  </section>;
}
