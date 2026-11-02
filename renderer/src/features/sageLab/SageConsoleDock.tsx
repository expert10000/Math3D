import { useEffect, useRef, useState } from "react";
import { SAGE_CONSOLE_LIMITS, SAGE_CONSOLE_OPERATION, sageExecutionRegistry, type SageRuntimeProbe } from "../../services/sageOperationExecution";
import type { SageConsoleResponse } from "./sageConsoleTypes";

type State = "idle" | "running" | "succeeded" | "failed" | "cancelled";
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" };

export default function SageConsoleDock({ onClose, onOpenRuntimes }: { onClose: () => void; onOpenRuntimes: () => void }) {
  const [probe, setProbe] = useState<SageRuntimeProbe | null>(null);
  const [discoveryError, setDiscoveryError] = useState("");
  const [trusted, setTrusted] = useState(false);
  const [trustPending, setTrustPending] = useState(false);
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  const [response, setResponse] = useState<SageConsoleResponse | null>(null);
  const [jobId, setJobId] = useState("");
  const active = useRef<{ cancel: () => boolean } | null>(null);

  useEffect(() => {
    let current = true;
    void sageExecutionRegistry.discoverBackends().then(async (backends) => {
      const local = backends.find((item) => item.backendId === "sage-local-wsl");
      if (!current) return;
      const detail = await sageExecutionRegistry.probeBackend("local");
      if (current) {
        setProbe(detail);
        setDiscoveryError(local?.availability === "unavailable" ? local.unavailableReason ?? detail.health.status : "");
      }
    }).catch((failure) => { if (current) setDiscoveryError(failure instanceof Error ? failure.message : "Sage discovery failed."); });
    return () => {
      current = false;
      active.current?.cancel();
      void window.sageConsole?.setTrusted(false);
    };
  }, []);

  const available = !!window.sageConsole && !!probe?.health.available &&
    probe.operations.some((item) => item.operationType === SAGE_CONSOLE_OPERATION);
  const setTrust = async (checked: boolean) => {
    if (!window.sageConsole || !available) return;
    setTrusted(checked);
    setTrustPending(true);
    try {
      const result = await window.sageConsole.setTrusted(checked);
      setTrusted(result.trusted);
      if (!result.trusted) active.current?.cancel();
      setError("");
    } catch (failure) {
      setTrusted(false);
      setError(failure instanceof Error ? failure.message : "Could not change Sage trust.");
    } finally {
      setTrustPending(false);
    }
  };
  const run = async () => {
    if (!trusted || !available || state === "running") return;
    setResponse(null);
    setError("");
    setState("running");
    try {
      const handle = sageExecutionRegistry.runConsole({ code, trusted });
      active.current = handle;
      setJobId(handle.jobId);
      const outcome = await handle.promise;
      setResponse(outcome.response);
      if (outcome.broker.ok) setState("succeeded");
      else {
        setState(outcome.broker.code === "cancelled" ? "cancelled" : "failed");
        setError(outcome.response?.error ?? outcome.broker.message);
      }
    } catch (failure) {
      setState("failed");
      setError(failure instanceof Error ? failure.message : "Sage Console failed.");
    } finally {
      active.current = null;
    }
  };

  return <section role="region" aria-label="Sage Console" data-testid="sage-console-dock" style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "min(390px, 65vh)", zIndex: 2400, background: "#f8fafc", borderTop: "2px solid #64748b", boxShadow: "0 -8px 32px #0f172a33", display: "flex", flexDirection: "column", color: "#0f172a", fontSize: 12 }}>
    <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: "1px solid #cbd5e1" }}>
      <strong style={{ fontSize: 14 }}>Sage Console</strong>
      <span data-testid="sage-console-state">Session: {state}</span>
      <span>{probe?.health.available ? `Local WSL · SageMath ${probe.health.engineVersion ?? "version unknown"}` : "Local WSL unavailable"}</span>
      <button type="button" onClick={onOpenRuntimes}>Runtimes</button>
      <button type="button" onClick={onClose} aria-label="Close Sage Console" style={{ marginLeft: "auto" }}>Close</button>
    </header>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(280px, 1fr)", gap: 12, padding: 12, minHeight: 0, flex: 1, overflow: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
        <div>Trusted code runs with your user account in WSL. Limits are best effort: {SAGE_CONSOLE_LIMITS.maxInputBytes / 1024} KiB input, {SAGE_CONSOLE_LIMITS.maxOutputBytes / 1024} KiB output, 20 s, 4 GiB memory.</div>
        <label><input type="checkbox" data-testid="sage-console-trust" checked={trusted} disabled={!available} onChange={(event) => void setTrust(event.target.checked)} /> I trust this local Sage runtime to execute my code for this dock session</label>
        <textarea aria-label="Sage code" data-testid="sage-console-code" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} placeholder="factor(x^2 - 1)" style={{ ...mono, flex: 1, minHeight: 90, resize: "vertical", border: "1px solid #94a3b8", borderRadius: 5, padding: 8 }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" data-testid="sage-console-run" disabled={!trusted || trustPending || !available || state === "running" || !code.trim()} onClick={() => void run()}>Run code</button>
          <button type="button" data-testid="sage-console-cancel" disabled={state !== "running"} onClick={() => active.current?.cancel()}>Cancel</button>
          {jobId && <span style={mono}>Job {jobId}</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
        <strong>Output</strong>
        {!window.sageConsole && <div role="status">Code execution requires the trusted local desktop runtime. Web Sage operations remain available through their bounded service actions.</div>}
        {!available && window.sageConsole && <div role="status">{discoveryError || probe?.health.status || "Checking local SageMath…"}</div>}
        {error && <div role="alert" style={{ color: "#b91c1c", whiteSpace: "pre-wrap" }}>{error}</div>}
        <pre data-testid="sage-console-output" style={{ ...mono, margin: 0, flex: 1, minHeight: 80, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 5, padding: 8 }}>{response ? `${response.stdout}${response.result ? `${response.stdout ? "\n" : ""}${response.result}` : ""}` : ""}</pre>
        {response && <div data-testid="sage-console-provenance" style={{ ...mono, overflowWrap: "anywhere" }}>
          Backend: {response.backendId} · SageMath {response.engineVersion ?? "unknown"} · {response.elapsedMs} ms<br />
          Job: {response.jobId}<br />Source SHA-256: {response.inputHash}
          {response.warnings.map((warning) => <div key={warning}>Warning: {warning}</div>)}
        </div>}
      </div>
    </div>
  </section>;
}
