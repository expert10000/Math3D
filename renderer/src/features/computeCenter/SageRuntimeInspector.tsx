import React, { useEffect, useRef, useState } from "react";
import { SAGE_CONSOLE_OPERATION, sageExecutionRegistry, type SageBackend, type SageRuntimeProbe } from "../../services/sageOperationExecution";

type ProbeState = { probe?: SageRuntimeProbe; error?: string; checkedAt?: number; checking: boolean };

const RUNTIMES: readonly { id: SageBackend; label: string; environment: string; action: string }[] = [
  { id: "local", label: "Local WSL", environment: "WSL Ubuntu · bounded local worker",
    action: "Install SageMath in WSL Ubuntu, then run wsl -d Ubuntu --exec /usr/bin/sage --version." },
  { id: "docker", label: "Docker", environment: "SageMath container service",
    action: "Start the service with docker compose -f services/sage-worker/docker-compose.yml up --build, then check its URL." },
  { id: "private", label: "Private gateway", environment: "Authenticated server-side Sage route",
    action: "Configure MATH3D_SAGE_GATEWAY_URL and MATH3D_SAGE_GATEWAY_TOKEN in the desktop or web server runtime." },
];

const formatBytes = (bytes: number) => bytes >= 1024 ** 2
  ? `${Math.round(bytes / 1024 ** 2)} MiB` : `${Math.round(bytes / 1024)} KiB`;

export default function SageRuntimeInspector() {
  const [probes, setProbes] = useState<Record<SageBackend, ProbeState>>({
    local: { checking: false }, docker: { checking: false }, private: { checking: false },
  });
  const started = useRef(false);

  const check = async (backend: SageBackend) => {
    setProbes((current) => ({ ...current, [backend]: { ...current[backend], checking: true } }));
    try {
      const probe = await sageExecutionRegistry.probeBackend(backend);
      setProbes((current) => ({ ...current, [backend]: { probe, checkedAt: Date.now(), checking: false } }));
    } catch (error) {
      setProbes((current) => ({ ...current, [backend]: {
        error: error instanceof Error ? error.message : "SageMath capability discovery failed.",
        checkedAt: Date.now(), checking: false,
      } }));
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Promise.all(RUNTIMES.map(({ id }) => check(id)));
  }, []);

  return <section aria-label="SageMath runtimes" data-testid="sage-runtime-inspector" style={{ display: "grid", gap: 9 }}>
    <div>
      <strong style={{ fontSize: 14 }}>SageMath backends</strong>
      <div style={{ color: "#64748b", fontSize: 11 }}>Availability and limits come from the same capability probes used to route Sage jobs. Refresh a backend after changing its setup.</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 9 }}>
      {RUNTIMES.map(({ id, label, environment, action }) => {
        const state = probes[id];
        const probe = state.probe;
        const consoleCapability = probe?.operations.find((operation) => operation.operationType === SAGE_CONSOLE_OPERATION);
        const available = probe?.health.available === true;
        const problem = state.error ?? (probe && !available ? probe.health.status : null);
        const status = state.checking ? "Checking…" : problem ? "Unavailable" : available ? "Available" : "Not checked";
        return <div key={id} data-testid={`sage-runtime-${id}`} style={{ border: "1px solid #dbe4f0", borderRadius: 8, padding: 11, background: "#fff", display: "grid", gap: 5, fontSize: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{label}</strong>
            <span role="status" style={{ color: problem ? "#b42318" : available ? "#16803e" : "#64748b" }}>{status}</span>
          </div>
          <div style={{ color: "#64748b" }}>Environment: {environment}</div>
          {probe && <>
            <div data-testid={`sage-runtime-version-${id}`}><strong>Version:</strong> {probe.health.engineVersion ? `SageMath ${probe.health.engineVersion}` : "Not reported"} · adapter v{probe.backendVersion}</div>
            <div><strong>Route:</strong> {probe.backendId} · {probe.transport}</div>
            <div><strong>Reported status:</strong> {probe.health.status}</div>
            <div><strong>Operations:</strong> {probe.operations.length} available through this route</div>
            <div data-testid={`sage-runtime-limits-${id}`}>
              <strong>Service operation limits:</strong> input {formatBytes(probe.limits.maxInputBytes)} · output {formatBytes(probe.limits.maxOutputBytes)} · memory {formatBytes(probe.limits.maxMemoryBytes)} · work {probe.limits.maxWorkUnits.toLocaleString()} units
            </div>
            {id === "private" && probe.health.limits && <div data-testid="sage-runtime-quota-private">
              <strong>Gateway quotas:</strong> {probe.health.limits.maxConcurrent} concurrent · {probe.health.limits.maxRequestsPerMinute} requests/min · {Math.round(probe.health.limits.timeoutMs / 1000)} s timeout
            </div>}
            {consoleCapability && <div data-testid="sage-runtime-console-limits">
              <strong>Trusted Console limits:</strong> input {formatBytes(consoleCapability.maxInputBytes)} · output {formatBytes(consoleCapability.maxOutputBytes)} · memory {formatBytes(consoleCapability.maxMemoryBytes)} · 20 s execution
            </div>}
            {probe.health.available && probe.operations.length === 0 && <div role="status">No registered Sage operation was reported by this backend.</div>}
          </>}
          {problem && <div role="alert" style={{ color: "#b42318", overflowWrap: "anywhere" }}>{problem}<div style={{ marginTop: 4 }}>Next: {action}</div></div>}
          {state.checkedAt && <div style={{ color: "#64748b" }}>Checked {new Date(state.checkedAt).toLocaleString()}</div>}
          <button type="button" onClick={() => void check(id)} disabled={state.checking} style={{ justifySelf: "start", fontSize: 11, padding: "4px 8px" }}>
            {state.checking ? "Checking…" : `Check ${label}`}
          </button>
        </div>;
      })}
    </div>
  </section>;
}
