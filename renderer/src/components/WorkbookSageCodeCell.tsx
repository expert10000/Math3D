import { useEffect, useRef, useState } from "react";
import type { Workbook, WorkbookBlock, WorkbookBlockFreshness, WorkbookSageCodeRun } from "@math3d/workbook";
import { inspectWorkbookDependency, workbookSageCodeDependencies, workbookSageCodeEvidence, workbookSageCodeOutputText, workbookSageCodeRunStatus, workbookSageCodeSourceHash } from "@math3d/workbook";
import type { Math3DProject } from "@math3d/core";
import { SAGE_CONSOLE_LIMITS, SAGE_CONSOLE_OPERATION, sageExecutionRegistry } from "../services/sageOperationExecution";
import { WorkbookSageEvidenceView } from "./WorkbookSageEvidence";

type Props = {
  workbook: Workbook;
  block: WorkbookBlock;
  freshness?: WorkbookBlockFreshness;
  project: Math3DProject | null;
  readOnly: boolean;
  onChange: (patch: Partial<WorkbookBlock>) => void;
};

export function WorkbookSageCodeCell({ workbook, block, freshness, project, readOnly, onChange }: Props) {
  const [runtime, setRuntime] = useState<{ available: boolean; version?: string; error: string }>({ available: false, error: "Checking Local WSL…" });
  const [trusted, setTrusted] = useState(false);
  const [trustPending, setTrustPending] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const scope = useRef(`workbook:${crypto.randomUUID()}:${crypto.randomUUID()}`);
  const active = useRef<{ cancel: () => boolean } | null>(null);
  const mounted = useRef(true);
  const code = block.sageCode?.code ?? "";
  const runs = block.sageCode?.runs ?? [];
  const latest = runs.at(-1);
  const runStatus = workbookSageCodeRunStatus(workbook, block);
  const effectiveStatus = latest && freshness && freshness.status !== "current" ? freshness.status : runStatus;
  const blocked = !!freshness?.blockedBySource || workbookSageCodeDependencies(workbook, block.id)
    .some((edge) => inspectWorkbookDependency(edge, workbook, project).status !== "current");

  useEffect(() => {
    mounted.current = true;
    void sageExecutionRegistry.discoverBackends().then(async (backends) => {
      const local = backends.find((item) => item.backendId === "sage-local-wsl");
      const probe = await sageExecutionRegistry.probeBackend("local");
      if (!mounted.current) return;
      const available = !!window.sageConsole && local?.availability === "available" &&
        probe.operations.some((operation) => operation.operationType === SAGE_CONSOLE_OPERATION);
      setRuntime({ available, version: probe.health.engineVersion,
        error: available ? "" : local?.unavailableReason ?? probe.health.status ?? "Trusted Local WSL is unavailable." });
    }).catch((cause) => { if (mounted.current) setRuntime({ available: false, error: cause instanceof Error ? cause.message : "Sage discovery failed." }); });
    return () => {
      mounted.current = false;
      active.current?.cancel();
      void window.sageConsole?.setTrusted(false, scope.current);
    };
  }, []);

  const changeTrust = async (checked: boolean) => {
    if (!window.sageConsole || !runtime.available) return;
    setTrusted(checked);
    setTrustPending(true);
    try {
      const result = await window.sageConsole.setTrusted(checked, scope.current);
      if (!mounted.current) return;
      setTrusted(result.trusted);
      if (!result.trusted) active.current?.cancel();
      setError("");
    } catch (cause) {
      if (mounted.current) { setTrusted(false); setError(cause instanceof Error ? cause.message : "Could not change Sage trust."); }
    } finally {
      if (mounted.current) setTrustPending(false);
    }
  };

  const run = async () => {
    if (readOnly || !trusted || trustPending || !runtime.available || !code.trim() || blocked || running) return;
    const sourceHash = workbookSageCodeSourceHash(workbook, block);
    const dependencies = JSON.parse(JSON.stringify(workbookSageCodeDependencies(workbook, block.id)));
    const startedCode = code;
    setRunning(true);
    setError("");
    try {
      const handle = sageExecutionRegistry.runConsole({ code: startedCode, trusted: true, scope: scope.current });
      active.current = handle;
      const { response, broker } = await handle.promise;
      if (!mounted.current) return;
      const status: WorkbookSageCodeRun["status"] = broker.ok ? "succeeded" : broker.code === "cancelled" ? "cancelled" : "failed";
      const diagnostic = broker.ok ? undefined : response?.error ?? broker.message;
      const savedAt = Date.now();
      const saved: WorkbookSageCodeRun = { id: handle.jobId, savedAt, sourceHash,
        code: startedCode, dependencies, status, output: response,
        evidence: workbookSageCodeEvidence({ blockId: block.id, jobId: handle.jobId, savedAt,
          sourceHash, code: startedCode, scope: scope.current, output: response, error: diagnostic }),
        ...(diagnostic ? { error: diagnostic } : {}) };
      onChange({ sageCode: { code: startedCode, runs: [...runs, saved].slice(-8) } });
      setError(diagnostic ?? "");
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Sage code failed.");
    } finally {
      active.current = null;
      if (mounted.current) setRunning(false);
    }
  };

  return <section data-testid={`workbook-sage-code-${block.id}`} style={{ display: "grid", gap: 7, border: "1px solid #b9d6ea", borderRadius: 7, padding: 9, background: "#f8fbff", fontSize: 11 }}>
    <div><strong>Trusted Sage code</strong> · {runtime.available ? `Local WSL · SageMath ${runtime.version ?? "version unknown"}` : runtime.error}</div>
    <div>Runs execute independently. Dependencies record sources and freshness; linked content is not injected into code. Limits: {SAGE_CONSOLE_LIMITS.maxInputBytes / 1024} KiB input, {SAGE_CONSOLE_LIMITS.maxOutputBytes / 1024} KiB output, 20 s, 4 GiB memory.</div>
    <textarea aria-label="Sage code" data-testid="workbook-sage-code-input" value={code} onChange={(event) => onChange({ sageCode: { code: event.target.value, runs } })}
      disabled={readOnly || running} spellCheck={false} rows={5} placeholder="factor(x^2 - 1)"
      style={{ width: "100%", boxSizing: "border-box", fontFamily: "ui-monospace, Consolas, monospace", padding: 7 }} />
    <label><input type="checkbox" data-testid="workbook-sage-code-trust" checked={trusted} disabled={readOnly || !runtime.available}
      onChange={(event) => void changeTrust(event.target.checked)} /> I trust this local Sage runtime to execute this cell for this session</label>
    {blocked && <div role="status" style={{ color: "#92400e" }}>Source unavailable or changed: {freshness?.reason}. Repair or refresh the dependency before running.</div>}
    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
      <button type="button" data-testid="workbook-sage-code-run" disabled={readOnly || !trusted || trustPending || !runtime.available || !code.trim() || blocked || running}
        onClick={() => void run()}>{latest ? "Rerun Sage code" : "Run Sage code"}</button>
      <button type="button" data-testid="workbook-sage-code-cancel" disabled={!running} onClick={() => active.current?.cancel()}>Cancel</button>
      <strong data-testid="workbook-sage-code-freshness">{running ? "running" : effectiveStatus}</strong>
    </div>
    {error && <div role="alert" style={{ color: "#b91c1c", whiteSpace: "pre-wrap" }}>{error}</div>}
    {latest && <div data-testid="workbook-sage-code-output" style={{ display: "grid", gap: 4 }}>
      <strong>Saved {latest.status} run · {new Date(latest.savedAt).toLocaleString()}</strong>
      <pre style={{ margin: 0, padding: 7, background: "white", border: "1px solid #cbd5e1", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 210, overflow: "auto" }}>{workbookSageCodeOutputText(latest)}</pre>
      <span>Backend: {latest.output?.backendId ?? "sage-local-wsl"} · SageMath {latest.output?.engineVersion ?? "unknown"} · Job {latest.id}</span>
      <span style={{ overflowWrap: "anywhere" }}>Source SHA-256: {latest.output?.inputHash ?? "unavailable"} · Source/dependency hash: {latest.sourceHash}</span>
      <span>Dependencies: {latest.dependencies.length} saved · {effectiveStatus === "current" ? "source current" : "source changed or run failed"}</span>
      {latest.output?.warnings.map((warning) => <span key={warning}>Warning: {warning}</span>)}
      {latest.evidence && <WorkbookSageEvidenceView evidence={latest.evidence}
        freshnessOverride={effectiveStatus === "stale" ? "stale" : undefined}
        currentSource={{ module: "workbook", id: `workbook:${block.id}`, revision: 1,
          expression: code, fingerprint: workbookSageCodeSourceHash(workbook, block) }} />}
    </div>}
    {runs.length > 1 && <details><summary>Previous runs ({runs.length - 1})</summary>{runs.slice(0, -1).map((item) =>
      <details key={item.id} style={{ marginTop: 6, overflowWrap: "anywhere" }}>
        <summary>{new Date(item.savedAt).toLocaleString()} · {item.status} · {item.id}</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{workbookSageCodeOutputText(item)}</pre>
        <div>Source SHA-256: {item.output?.inputHash ?? "unavailable"} · Dependencies: {item.dependencies.length}</div>
      </details>)}</details>}
  </section>;
}
