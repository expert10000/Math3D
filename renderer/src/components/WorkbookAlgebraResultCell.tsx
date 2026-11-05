import React, { useEffect, useRef, useState } from "react";
import { createWorkbookAlgebraResult, inspectWorkbookAlgebraResult,
  recomputeWorkbookAlgebraResult,
  type WorkbookAlgebraResult } from "@math3d/workbook";
import type { NotebookProjectContext } from "../workbook/notebookProjectContext";
import { sageExecutionRegistry, type SageOperationHandle } from "../services/sageOperationExecution";

type Props = { value?: WorkbookAlgebraResult; readOnly: boolean;
  getProject: () => NotebookProjectContext | null; onChange: (value: WorkbookAlgebraResult) => void;
  onClear?: () => void };

export const WorkbookAlgebraResultCell: React.FC<Props> = ({ value, readOnly, getProject, onChange, onClear }) => {
  const [context, setContext] = useState<NotebookProjectContext | null>(null);
  const [selection, setSelection] = useState("");
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const active = useRef<SageOperationHandle | null>(null);
  const generation = useRef(0);
  const refresh = () => { try { setContext(getProject()); } catch (error) { setMessage(String(error)); } };
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 3000);
    return () => { window.clearInterval(timer); generation.current++; active.current?.cancel(); }; }, [getProject]);
  const project = context?.project ?? null;
  const inspection = value ? inspectWorkbookAlgebraResult(project, value) : null;
  const evidence = value?.evidence;
  const options = project?.algebraEvidence ?? [];
  const link = () => {
    const selected = options.find((item) => item.id === selection);
    if (!project || !selected) return;
    try { onChange(createWorkbookAlgebraResult(project, selected)); setMessage("Linked exact saved evidence."); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const rerun = async () => {
    if (!project || !evidence || !value || running) return;
    const token = ++generation.current;
    setRunning(true); setMessage("Running pinned, bounded Sage request…");
    try {
      const nextCell = await recomputeWorkbookAlgebraResult(project, value, async (request) => {
        const handle = sageExecutionRegistry.run({ operation: request.operation, params: request.params, backend: request.backend });
        active.current = handle;
        const { response, broker } = await handle.promise;
        if (!broker.ok || !response.success || response.operation !== request.operation || !response.engineVersion)
          throw new Error(response.error ?? "Sage request failed or returned incompatible evidence.");
        return { result: response.result, runtime: { engine: "sagemath" as const,
          version: response.engineVersion, backend: request.backend,
          jobId: handle.jobId, elapsedMs: response.elapsedMs ?? 0, warnings: response.warnings } };
      });
      if (token !== generation.current) return;
      onChange(nextCell);
      setMessage(`Recomputed from pinned revision ${value.revision}; ${nextCell.evidence.runtime.jobId}.`);
    } catch (error) { if (token === generation.current) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (token === generation.current) { active.current = null; setRunning(false); } }
  };
  return <section data-testid="workbook-algebra-result-cell" style={{ display: "grid", gap: 6,
    padding: 9, border: "1px solid #a7c7bb", borderRadius: 8, background: "#f3fbf7", fontSize: 11 }}>
    <strong>Typed algebra result</strong>
    {project ? <span>{project.metadata.title} · {context?.live ? "active Project" : "saved Project"}</span>
      : <span>Open a saved Project with algebra evidence to link a result.</span>}
    {!readOnly && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      <select aria-label="Saved algebra evidence" value={selection} onChange={(event) => setSelection(event.target.value)}
        style={{ maxWidth: "100%", flex: 1 }}>
        <option value="">Choose saved algebra result…</option>
        {options.map((item) => <option key={item.id} value={item.id}>
          {item.request.operation} · {item.request.target.objectId.slice(-12)}@{item.request.target.revision}
        </option>)}
      </select>
      <button type="button" disabled={!selection} onClick={link}>Link result</button>
      <button type="button" onClick={refresh}>Refresh</button>
    </div>}
    {evidence && <>
      {!readOnly && onClear && <button type="button" style={{ justifySelf: "start" }} onClick={onClear}>Use ordinary Project reference</button>}
      <div data-testid="workbook-algebra-result-status" role="status">
        {inspection?.status ?? "missing"} · {inspection?.reason}
      </div>
      <div>{evidence.request.operation} · object r{value?.revision} · {evidence.runtime.backend} Sage {evidence.runtime.version}</div>
      <div>Result hash {evidence.resultHash.slice(0, 16)} · {evidence.runtime.elapsedMs} ms</div>
      <details><summary>Exact result and request</summary><pre style={{ maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {JSON.stringify({ request: evidence.request, result: evidence.result, warnings: evidence.runtime.warnings }, null, 2)}
      </pre></details>
      {!readOnly && <div style={{ display: "flex", gap: 5 }}>
        <button type="button" disabled={running || !project || inspection?.status === "missing"}
          onClick={() => void rerun()}>Recompute pinned request</button>
        {running && <button type="button" onClick={() => { generation.current++; active.current?.cancel(); active.current = null;
          setRunning(false); setMessage("Cancellation requested; saved result retained."); }}>Cancel</button>}
      </div>}
    </>}
    {message && <div role="status">{message}</div>}
  </section>;
};
